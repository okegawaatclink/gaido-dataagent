#!/bin/bash
# =============================================================================
# DataAgent ECS Fargate Deploy Script (Bedrock)
#
# Usage:
#   ./deploy.sh --region ap-northeast-1 \
#               --vpc-id vpc-xxxxxxxx \
#               --subnet-ids "subnet-aaa,subnet-bbb"
#
# Prerequisites:
#   - AWS CLI v2 configured (aws configure)
#   - Docker installed and running
#   - Amazon Bedrock Claude model access enabled in the target region
#   - Sufficient IAM permissions (ECS, ECR, EFS, ALB, IAM, CloudWatch, Bedrock)
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
REGION="${AWS_DEFAULT_REGION:-ap-northeast-1}"
STACK_NAME="dataagent"
ECR_REPO_NAME="dataagent"
IMAGE_TAG="latest"
TASK_CPU="1024"
TASK_MEMORY="2048"
CERTIFICATE_ARN=""
DB_ENCRYPTION_KEY="a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
MYSQL_ROOT_PASSWORD="rootpassword"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case $1 in
    --region)        REGION="$2";              shift 2;;
    --vpc-id)        VPC_ID="$2";              shift 2;;
    --subnet-ids)    SUBNET_IDS="$2";          shift 2;;
    --api-key)       ANTHROPIC_API_KEY="$2";   shift 2;;  # Optional: only for direct API mode
    --stack-name)    STACK_NAME="$2";          shift 2;;
    --cpu)           TASK_CPU="$2";            shift 2;;
    --memory)        TASK_MEMORY="$2";         shift 2;;
    --cert-arn)      CERTIFICATE_ARN="$2";     shift 2;;
    --encryption-key) DB_ENCRYPTION_KEY="$2";  shift 2;;
    --mysql-password) MYSQL_ROOT_PASSWORD="$2"; shift 2;;
    --image-tag)     IMAGE_TAG="$2";           shift 2;;
    -h|--help)
      echo "Usage: $0 --region REGION --vpc-id VPC_ID --subnet-ids SUBNET_IDS [options]"
      echo ""
      echo "Required:"
      echo "  --vpc-id          Existing VPC ID"
      echo "  --subnet-ids      Comma-separated subnet IDs (at least 2, different AZs)"
      echo ""
      echo "Optional:"
      echo "  --region          AWS region (default: ap-northeast-1)"
      echo "  --api-key         Anthropic API key (only for direct API mode, not needed for Bedrock)"
      echo "  --stack-name      CloudFormation stack name (default: dataagent)"
      echo "  --cpu             Task CPU units: 512|1024|2048|4096 (default: 1024)"
      echo "  --memory          Task memory MB: 1024-8192 (default: 2048)"
      echo "  --cert-arn        ACM certificate ARN for HTTPS"
      echo "  --encryption-key  AES-256-GCM key for DB passwords (64 hex chars)"
      echo "  --mysql-password  MySQL root password (default: rootpassword)"
      echo "  --image-tag       Docker image tag (default: latest)"
      exit 0;;
    *) echo "Unknown option: $1"; exit 1;;
  esac
done

# Validate required params
for var in VPC_ID SUBNET_IDS; do
  if [[ -z "${!var:-}" ]]; then
    echo "ERROR: --$(echo $var | tr '[:upper:]' '[:lower:]' | tr '_' '-') is required"
    exit 1
  fi
done

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --region "$REGION")
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO_NAME}"

echo "============================================"
echo "DataAgent ECS Fargate Deployment (Bedrock)"
echo "============================================"
echo "Region:     $REGION"
echo "Account:    $ACCOUNT_ID"
echo "Stack:      $STACK_NAME"
echo "VPC:        $VPC_ID"
echo "Subnets:    $SUBNET_IDS"
echo "ECR:        $ECR_URI"
echo "CPU/Memory: ${TASK_CPU}/${TASK_MEMORY}"
echo "LLM:        Amazon Bedrock (Claude)"
echo "============================================"

# ---------------------------------------------------------------------------
# Step 1: Create ECR repository (if not exists)
# ---------------------------------------------------------------------------
echo ""
echo "[1/4] Creating ECR repository..."
aws ecr describe-repositories --repository-names "$ECR_REPO_NAME" --region "$REGION" 2>/dev/null \
  || aws ecr create-repository --repository-name "$ECR_REPO_NAME" --region "$REGION" \
       --image-scanning-configuration scanOnPush=true

# ---------------------------------------------------------------------------
# Step 2: Build & push Docker image
# ---------------------------------------------------------------------------
echo ""
echo "[2/4] Building and pushing Docker image..."

# Navigate to project root (parent of output_system/)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Login to ECR
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# Build image (context = project root, same as docker-compose)
# --platform linux/amd64: Fargate runs on Linux/amd64, required when building on Apple Silicon Mac
# APP_VERSION: gitハッシュ+日付をフロントエンドに埋め込む
APP_VERSION="$(date +%Y-%m-%d) ($(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo 'unknown'))"
docker build \
  --platform linux/amd64 \
  --build-arg APP_VERSION="$APP_VERSION" \
  -f "$PROJECT_ROOT/output_system/Dockerfile" \
  -t "${ECR_URI}:${IMAGE_TAG}" \
  "$PROJECT_ROOT"

# Push
docker push "${ECR_URI}:${IMAGE_TAG}"

echo "Image pushed: ${ECR_URI}:${IMAGE_TAG}"

# ---------------------------------------------------------------------------
# Step 3: Deploy CloudFormation stack
# ---------------------------------------------------------------------------
echo ""
echo "[3/4] Deploying CloudFormation stack..."

aws cloudformation deploy \
  --template-file "$SCRIPT_DIR/cloudformation.yaml" \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    VpcId="$VPC_ID" \
    SubnetIds="$SUBNET_IDS" \
    DbEncryptionKey="$DB_ENCRYPTION_KEY" \
    MysqlRootPassword="$MYSQL_ROOT_PASSWORD" \
    WebImageUri="${ECR_URI}:${IMAGE_TAG}" \
    TaskCpu="$TASK_CPU" \
    TaskMemory="$TASK_MEMORY" \
    CertificateArn="$CERTIFICATE_ARN"

# ---------------------------------------------------------------------------
# Step 4: Show outputs
# ---------------------------------------------------------------------------
echo ""
echo "[4/4] Deployment complete!"
echo ""

ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='AlbDnsName'].OutputValue" \
  --output text)

echo "============================================"
echo "DataAgent is deploying to ECS Fargate!"
echo ""
echo "Access URL: $ALB_DNS"
echo ""
echo "Note: LLM is powered by Amazon Bedrock (Claude)."
echo ""
echo "Check service status:"
echo "  aws ecs describe-services --cluster dataagent-cluster --services dataagent-service --region $REGION"
echo ""
echo "View logs:"
echo "  aws logs tail /ecs/dataagent --region $REGION --follow"
echo "============================================"
