FROM node:20-slim

WORKDIR /app

# 企業プロキシ用SSL証明書のコピー（オプション）
COPY ssl-certificates/ /etc/ssl/certs/custom/
RUN if [ -f /etc/ssl/certs/custom/netskope.cer ]; then \
      apt-get update && apt-get install -y --no-install-recommends ca-certificates && \
      rm -rf /var/lib/apt/lists/* && \
      cp /etc/ssl/certs/custom/netskope.cer /usr/local/share/ca-certificates/netskope.crt && \
      update-ca-certificates; \
    fi

COPY output_system/graphql-mesh-gateway/package.json ./
RUN if [ -f /etc/ssl/certs/custom/netskope.cer ]; then \
      export NODE_EXTRA_CA_CERTS=/etc/ssl/certs/custom/netskope.cer; \
    fi && \
    npm install

COPY output_system/graphql-mesh-gateway/.meshrc.yaml ./

EXPOSE 4000

CMD ["npx", "mesh", "dev"]
