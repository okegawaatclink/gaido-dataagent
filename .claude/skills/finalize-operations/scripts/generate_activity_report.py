#!/usr/bin/env python3
"""エージェント活動レポート生成スクリプト.

セッションログ（JSONL）を解析し、スキル・SubAgentの使用状況を
agent_activity_report.md として出力する。

Usage:
    python3 generate_activity_report.py <session_dir> [--agents-dir PATH] [--skills-dir PATH] [--output PATH]
"""

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from pathlib import Path


JST = timezone(timedelta(hours=9))


@dataclass
class SkillInfo:
    """スキル定義情報."""

    name: str
    directory_name: str
    description: str


@dataclass
class AgentInfo:
    """SubAgent定義情報."""

    name: str
    preloaded_skills: list[str] = field(default_factory=list)
    model: str = ""


@dataclass
class SkillCall:
    """スキル呼出記録."""

    skill_name: str
    timestamp: str
    caller: str


@dataclass
class TaskCall:
    """SubAgent呼出記録."""

    subagent_type: str
    timestamp: str
    caller: str
    description: str


def parse_frontmatter(path: str) -> dict:
    """YAMLフロントマター（---区切り）を簡易パースする.

    PyYAML不要。key: value と key:\\n  - item の2形式のみ対応。

    Args:
        path: マークダウンファイルのパス

    Returns:
        フロントマターのキーバリュー辞書
    """
    try:
        with open(path, encoding="utf-8") as f:
            lines = f.readlines()
    except (OSError, UnicodeDecodeError):
        return {}

    if not lines or lines[0].strip() != "---":
        return {}

    fm_lines: list[str] = []
    for line in lines[1:]:
        if line.strip() == "---":
            break
        fm_lines.append(line)
    else:
        # 閉じ --- がなかった
        return {}

    result: dict = {}
    current_key: str | None = None

    for line in fm_lines:
        stripped = line.rstrip("\n")
        # リストアイテム: "  - value"
        if stripped.startswith("  - ") and current_key is not None:
            if not isinstance(result.get(current_key), list):
                result[current_key] = []
            result[current_key].append(stripped.strip()[2:].strip())
            continue

        # key: value
        if ":" in stripped:
            key, _, value = stripped.partition(":")
            key = key.strip()
            value = value.strip()
            current_key = key
            if value:
                result[key] = value
            # value が空の場合は次行のリストを期待
        else:
            current_key = None

    return result


def discover_all_skills(skills_dir: str) -> list[SkillInfo]:
    """スキルディレクトリをスキャンしSkillInfo一覧を返す.

    Args:
        skills_dir: .claude/skills ディレクトリパス

    Returns:
        発見されたスキル一覧
    """
    skills: list[SkillInfo] = []
    skills_path = Path(skills_dir)

    if not skills_path.is_dir():
        print(f"警告: スキルディレクトリが見つかりません: {skills_dir}", file=sys.stderr)
        return skills

    for skill_md in sorted(skills_path.glob("*/SKILL.md")):
        directory_name = skill_md.parent.name
        fm = parse_frontmatter(str(skill_md))
        name = fm.get("name", directory_name)
        description = fm.get("description", "")
        skills.append(SkillInfo(
            name=name,
            directory_name=directory_name,
            description=description,
        ))

    return skills


def discover_all_agents(agents_dir: str) -> list[AgentInfo]:
    """エージェントディレクトリをスキャンしAgentInfo一覧を返す.

    Args:
        agents_dir: .claude/agents ディレクトリパス

    Returns:
        発見されたエージェント一覧
    """
    agents: list[AgentInfo] = []
    agents_path = Path(agents_dir)

    if not agents_path.is_dir():
        print(f"警告: エージェントディレクトリが見つかりません: {agents_dir}", file=sys.stderr)
        return agents

    for agent_md in sorted(agents_path.glob("*.md")):
        fm = parse_frontmatter(str(agent_md))
        name = fm.get("name", agent_md.stem)
        model = fm.get("model", "")
        preloaded = fm.get("skills", [])
        if isinstance(preloaded, str):
            preloaded = [preloaded]
        agents.append(AgentInfo(
            name=name,
            preloaded_skills=preloaded,
            model=model,
        ))

    return agents


def parse_jsonl(path: str) -> list[dict]:
    """JSONLファイルを読み込みメッセージ一覧を返す.

    Args:
        path: JSONLファイルパス

    Returns:
        パースされたJSONオブジェクトのリスト
    """
    messages: list[dict] = []
    try:
        with open(path, encoding="utf-8") as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    messages.append(json.loads(line))
                except json.JSONDecodeError:
                    print(f"警告: JSONパース失敗 {path}:{line_num}", file=sys.stderr)
    except OSError as e:
        print(f"警告: ファイル読込失敗 {path}: {e}", file=sys.stderr)
    return messages


def _extract_timestamp(message: dict) -> str:
    """メッセージからタイムスタンプを抽出する.

    Args:
        message: JSONLのメッセージオブジェクト

    Returns:
        ISO 8601形式のタイムスタンプ、またはメッセージ内のtimestamp文字列
    """
    # timestamp フィールドがあればそれを使う
    ts = message.get("timestamp", "")
    if ts:
        return ts
    return ""


def extract_skill_calls(messages: list[dict], source_label: str) -> list[SkillCall]:
    """メッセージ一覧からSkill呼出を抽出する.

    Args:
        messages: parse_jsonlの出力
        source_label: 呼出元ラベル（"main" or "agent-xxxxxxx"）

    Returns:
        スキル呼出記録のリスト
    """
    calls: list[SkillCall] = []

    for msg in messages:
        if msg.get("type") != "assistant":
            continue
        content = msg.get("message", {}).get("content", [])
        if isinstance(content, str):
            continue
        timestamp = _extract_timestamp(msg)

        for item in content:
            if not isinstance(item, dict):
                continue
            if item.get("type") != "tool_use" or item.get("name") != "Skill":
                continue
            inp = item.get("input", {})
            # 実データでは input.skill が使われる
            skill_name = inp.get("skill", "") or inp.get("skill_name", "")
            # 先頭 / を除去
            if skill_name.startswith("/"):
                skill_name = skill_name[1:]
            if skill_name:
                calls.append(SkillCall(
                    skill_name=skill_name,
                    timestamp=timestamp,
                    caller=source_label,
                ))

    return calls


def extract_agent_calls(messages: list[dict], source_label: str) -> list[TaskCall]:
    """メッセージ一覧からAgent（SubAgent）呼出を抽出する.

    Claude CodeのCustom Subagentは "Agent" ツールで呼び出される。

    Args:
        messages: parse_jsonlの出力
        source_label: 呼出元ラベル（"main" or "agent-xxxxxxx"）

    Returns:
        SubAgent呼出記録のリスト
    """
    calls: list[TaskCall] = []

    for msg in messages:
        if msg.get("type") != "assistant":
            continue
        content = msg.get("message", {}).get("content", [])
        if isinstance(content, str):
            continue
        timestamp = _extract_timestamp(msg)

        for item in content:
            if not isinstance(item, dict):
                continue
            if item.get("type") != "tool_use" or item.get("name") != "Agent":
                continue
            inp = item.get("input", {})
            subagent_type = inp.get("subagent_type", "")
            description = inp.get("description", "")
            if len(description) > 80:
                description = description[:80] + "..."
            if subagent_type:
                calls.append(TaskCall(
                    subagent_type=subagent_type,
                    timestamp=timestamp,
                    caller=source_label,
                    description=description,
                ))

    return calls


def extract_read_skill_calls(messages: list[dict], source_label: str) -> list[SkillCall]:
    """メッセージ一覧からRead経由のスキル読込を抽出する.

    SubAgentがSkillツールではなくReadツールで直接SKILL.mdを読み込むパターンを検出する。

    Args:
        messages: parse_jsonlの出力
        source_label: 呼出元ラベル（"main" or "agent-xxxxxxx"）

    Returns:
        スキル呼出記録のリスト
    """
    calls: list[SkillCall] = []
    pattern = re.compile(r"skills/([^/]+)/SKILL\.md")

    for msg in messages:
        if msg.get("type") != "assistant":
            continue
        content = msg.get("message", {}).get("content", [])
        if isinstance(content, str):
            continue
        timestamp = _extract_timestamp(msg)

        for item in content:
            if not isinstance(item, dict):
                continue
            if item.get("type") != "tool_use" or item.get("name") != "Read":
                continue
            inp = item.get("input", {})
            file_path = inp.get("file_path", "")
            m = pattern.search(file_path)
            if m:
                skill_name = m.group(1)
                calls.append(SkillCall(
                    skill_name=skill_name,
                    timestamp=timestamp,
                    caller=source_label,
                ))

    return calls


def build_agent_id_map(
    messages: list[dict],
    session_dir: Path,
) -> dict[str, str]:
    """main.jsonlのメッセージとagent-*.jsonlからagent-ID → subagent_typeのマッピングを構築する.

    Agent tool_useのtimestampとagent-*.jsonlの最初のuserメッセージのtimestampが
    完全一致することを利用して突き合わせる。

    Args:
        messages: main.jsonlのparse_jsonl出力
        session_dir: セッションディレクトリ（agent-*.jsonlが存在するディレクトリ）

    Returns:
        agent-ID（"agent-xxxxx"形式）→ subagent_type のマッピング
    """
    # Step 1: main.jsonlからAgent tool_useの (timestamp, subagent_type) を収集
    agent_tool_uses: list[tuple[str, str]] = []
    for msg in messages:
        if msg.get("type") != "assistant":
            continue
        content = msg.get("message", {}).get("content", [])
        if isinstance(content, str):
            continue
        timestamp = _extract_timestamp(msg)
        if not timestamp:
            continue
        for item in content:
            if not isinstance(item, dict):
                continue
            if item.get("type") != "tool_use" or item.get("name") != "Agent":
                continue
            inp = item.get("input", {})
            subagent_type = inp.get("subagent_type", "")
            if subagent_type:
                agent_tool_uses.append((timestamp, subagent_type))

    # Step 2: agent-*.jsonlを走査し、最初のuserメッセージのtimestampを取得
    # timestampは数ミリ秒ずれるため、最近傍マッチで紐付ける
    agent_id_map: dict[str, str] = {}
    matched_indices: set[int] = set()  # 既にマッチ済みのtool_useインデックス

    agent_first_ts: list[tuple[str, str]] = []  # (agent_id, first_user_timestamp)
    for agent_jsonl in sorted(session_dir.glob("agent-*.jsonl")):
        agent_id = agent_jsonl.stem  # e.g. "agent-a084e074bf191c30f"
        agent_messages = parse_jsonl(str(agent_jsonl))
        for amsg in agent_messages:
            if amsg.get("type") == "user":
                first_ts = _extract_timestamp(amsg)
                if first_ts:
                    agent_first_ts.append((agent_id, first_ts))
                break

    for agent_id, first_ts in agent_first_ts:
        try:
            agent_dt = datetime.fromisoformat(first_ts.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            continue
        best_idx: int | None = None
        best_diff: float = 1.0  # 最大許容差: 1秒
        for i, (tool_ts, _subagent_type) in enumerate(agent_tool_uses):
            if i in matched_indices:
                continue
            try:
                tool_dt = datetime.fromisoformat(tool_ts.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                continue
            diff = abs((agent_dt - tool_dt).total_seconds())
            if diff < best_diff:
                best_diff = diff
                best_idx = i
        if best_idx is not None:
            matched_indices.add(best_idx)
            agent_id_map[agent_id] = agent_tool_uses[best_idx][1]

    return agent_id_map


def _resolve_caller(caller: str, agent_id_map: dict[str, str]) -> str:
    """agent-IDをSubAgent名付きで表示するヘルパー.

    Args:
        caller: 呼出元ラベル（"main" or "agent-xxxxxxx"）
        agent_id_map: build_agent_id_mapの出力

    Returns:
        agent-IDに対応するSubAgent名がある場合は "agent-xxx[subagent-name]" 形式、
        なければそのまま返す
    """
    if caller in agent_id_map:
        return f"{caller}({agent_id_map[caller]})"
    return caller


def _format_time_jst(ts: str) -> str:
    """タイムスタンプ文字列をJST HH:MM形式に変換する.

    Args:
        ts: ISO 8601形式のタイムスタンプ文字列

    Returns:
        HH:MM形式の時刻文字列。パース失敗時は元の文字列
    """
    if not ts:
        return "-"
    try:
        # ISO 8601 パース
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return dt.astimezone(JST).strftime("%H:%M")
    except (ValueError, TypeError):
        return ts[:16] if len(ts) > 16 else ts


def build_report(
    skills: list[SkillInfo],
    agents: list[AgentInfo],
    skill_calls: list[SkillCall],
    task_calls: list[TaskCall],
    read_skill_calls: list[SkillCall] | None = None,
    agent_id_map: dict[str, str] | None = None,
) -> str:
    """集計結果からMarkdownレポートを生成する.

    Args:
        skills: 登録スキル一覧
        agents: 登録エージェント一覧
        skill_calls: スキル呼出記録一覧
        task_calls: SubAgent呼出記録一覧
        read_skill_calls: Read経由スキル読込記録一覧
        agent_id_map: agent-ID → subagent_type のマッピング

    Returns:
        Markdown形式のレポート文字列
    """
    if read_skill_calls is None:
        read_skill_calls = []
    if agent_id_map is None:
        agent_id_map = {}
    now = datetime.now(JST).strftime("%Y-%m-%d %H:%M:%S JST")
    lines: list[str] = []

    # スキル名→SkillInfoマッピング（ディレクトリ名 or name で検索）
    skill_by_name: dict[str, SkillInfo] = {}
    skill_by_dir: dict[str, SkillInfo] = {}
    for s in skills:
        skill_by_name[s.name] = s
        skill_by_dir[s.directory_name] = s

    def find_skill(name: str) -> SkillInfo | None:
        """スキル名またはディレクトリ名でSkillInfoを検索する."""
        return skill_by_name.get(name) or skill_by_dir.get(name)

    # エージェント名→AgentInfoマッピング
    agent_by_name: dict[str, AgentInfo] = {}
    for a in agents:
        agent_by_name[a.name] = a

    # --- 明示的スキル呼出の集計 ---
    explicit_skill_names: set[str] = set()
    skill_call_counts: dict[str, int] = {}
    skill_callers: dict[str, set[str]] = {}
    skill_first_time: dict[str, str] = {}
    skill_last_time: dict[str, str] = {}

    for sc in skill_calls:
        explicit_skill_names.add(sc.skill_name)
        skill_call_counts[sc.skill_name] = skill_call_counts.get(sc.skill_name, 0) + 1
        if sc.skill_name not in skill_callers:
            skill_callers[sc.skill_name] = set()
        skill_callers[sc.skill_name].add(sc.caller)
        if sc.skill_name not in skill_first_time or sc.timestamp < skill_first_time[sc.skill_name]:
            skill_first_time[sc.skill_name] = sc.timestamp
        if sc.skill_name not in skill_last_time or sc.timestamp > skill_last_time[sc.skill_name]:
            skill_last_time[sc.skill_name] = sc.timestamp

    # --- プリロードスキルの集計 ---
    # task_callsのsubagent_typeから、そのagentのpreloaded_skillsを集計
    preloaded_skill_agents: dict[str, set[str]] = {}
    preloaded_skill_counts: dict[str, int] = {}

    for tc in task_calls:
        agent = agent_by_name.get(tc.subagent_type)
        if not agent:
            continue
        for ps in agent.preloaded_skills:
            if ps not in preloaded_skill_agents:
                preloaded_skill_agents[ps] = set()
                preloaded_skill_counts[ps] = 0
            preloaded_skill_agents[ps].add(tc.subagent_type)
            preloaded_skill_counts[ps] += 1

    preloaded_skill_names: set[str] = set(preloaded_skill_agents.keys())

    # --- Read経由スキルの集計 ---
    read_skill_names: set[str] = set()
    read_skill_call_counts: dict[str, int] = {}
    read_skill_caller_counts: dict[str, dict[str, int]] = {}
    read_skill_first_time: dict[str, str] = {}
    read_skill_last_time: dict[str, str] = {}

    for rc in read_skill_calls:
        read_skill_names.add(rc.skill_name)
        read_skill_call_counts[rc.skill_name] = read_skill_call_counts.get(rc.skill_name, 0) + 1
        if rc.skill_name not in read_skill_caller_counts:
            read_skill_caller_counts[rc.skill_name] = {}
        read_skill_caller_counts[rc.skill_name][rc.caller] = read_skill_caller_counts[rc.skill_name].get(rc.caller, 0) + 1
        if rc.skill_name not in read_skill_first_time or rc.timestamp < read_skill_first_time[rc.skill_name]:
            read_skill_first_time[rc.skill_name] = rc.timestamp
        if rc.skill_name not in read_skill_last_time or rc.timestamp > read_skill_last_time[rc.skill_name]:
            read_skill_last_time[rc.skill_name] = rc.timestamp

    # --- 未使用スキルの特定 ---
    all_skill_names: set[str] = set()
    all_skill_dirs: set[str] = set()
    for s in skills:
        all_skill_names.add(s.name)
        all_skill_dirs.add(s.directory_name)

    used_names = explicit_skill_names | preloaded_skill_names | read_skill_names
    # nameまたはdirectory_nameのいずれかがused_namesに含まれていれば使用済み
    unused_skills: list[SkillInfo] = []
    for s in skills:
        if s.name not in used_names and s.directory_name not in used_names:
            unused_skills.append(s)

    # --- サマリ ---
    lines.append("# エージェント活動レポート")
    lines.append("")
    lines.append(f"生成日時: {now}")
    lines.append("")
    lines.append("## サマリ")
    lines.append("")
    lines.append("| 項目 | 値 |")
    lines.append("|------|-----|")
    lines.append(f"| 登録スキル数 | {len(skills)} |")
    lines.append(f"| 使用スキル数（明示呼出） | {len(explicit_skill_names)} |")
    lines.append(f"| 使用スキル数（プリロード） | {len(preloaded_skill_names)} |")
    lines.append(f"| 使用スキル数（Read経由） | {len(read_skill_names)} |")
    lines.append(f"| 未使用スキル数 | {len(unused_skills)} |")
    lines.append(f"| SubAgent呼出回数 | {len(task_calls)} |")
    lines.append("")

    # --- SubAgent呼出一覧 ---
    lines.append("## SubAgent呼出一覧")
    lines.append("")
    if task_calls:
        lines.append("| # | SubAgent | 呼出元 | 時刻(JST) | プリロードスキル | 概要 |")
        lines.append("|---|----------|--------|-----------|-----------------|------|")
        for i, tc in enumerate(task_calls, 1):
            agent = agent_by_name.get(tc.subagent_type)
            preloaded = ", ".join(agent.preloaded_skills) if agent and agent.preloaded_skills else "-"
            time_str = _format_time_jst(tc.timestamp)
            lines.append(f"| {i} | {tc.subagent_type} | {tc.caller} | {time_str} | {preloaded} | {tc.description} |")
    else:
        lines.append("SubAgent呼出はありませんでした。")
    lines.append("")

    # --- agent-ID対応表 ---
    if agent_id_map:
        lines.append("## agent-ID対応表")
        lines.append("")
        lines.append("| agent-ID | SubAgent |")
        lines.append("|----------|----------|")
        for aid, subagent_type in sorted(agent_id_map.items()):
            lines.append(f"| {aid} | {subagent_type} |")
        lines.append("")

    # --- 明示的スキル呼出 ---
    lines.append("## 明示的に呼び出されたスキル")
    lines.append("")
    if explicit_skill_names:
        lines.append("| スキル名 | 呼出回数 | 呼出元 | 初回 | 最終 |")
        lines.append("|----------|---------|--------|------|------|")
        for sn in sorted(explicit_skill_names):
            count = skill_call_counts[sn]
            callers = ", ".join(sorted(
                _resolve_caller(c, agent_id_map) for c in skill_callers[sn]
            ))
            first = _format_time_jst(skill_first_time.get(sn, ""))
            last = _format_time_jst(skill_last_time.get(sn, ""))
            lines.append(f"| {sn} | {count} | {callers} | {first} | {last} |")
    else:
        lines.append("明示的なスキル呼出はありませんでした。")
    lines.append("")

    # --- プリロードスキル ---
    lines.append("## SubAgentにプリロードされたスキル")
    lines.append("")
    if preloaded_skill_names:
        lines.append("| スキル名 | プリロード先 | プリロード回数 |")
        lines.append("|----------|-------------|---------------|")
        for sn in sorted(preloaded_skill_names):
            agents_str = ", ".join(sorted(preloaded_skill_agents[sn]))
            count = preloaded_skill_counts[sn]
            lines.append(f"| {sn} | {agents_str} | {count} |")
    else:
        lines.append("プリロードされたスキルはありませんでした。")
    lines.append("")

    # --- Read経由スキル ---
    lines.append("## Read経由で読み込まれたスキル")
    lines.append("")
    if read_skill_names:
        lines.append("| スキル名 | 読込回数 | 読込元 | 初回 | 最終 |")
        lines.append("|----------|---------|--------|------|------|")
        for sn in sorted(read_skill_names):
            count = read_skill_call_counts[sn]
            caller_counts = read_skill_caller_counts[sn]
            callers = ", ".join(
                f"{_resolve_caller(c, agent_id_map)} x{n}"
                for c, n in sorted(caller_counts.items())
            )
            first = _format_time_jst(read_skill_first_time.get(sn, ""))
            last = _format_time_jst(read_skill_last_time.get(sn, ""))
            lines.append(f"| {sn} | {count} | {callers} | {first} | {last} |")
    else:
        lines.append("Read経由で読み込まれたスキルはありませんでした。")
    lines.append("")

    # --- 未使用スキル ---
    lines.append("## 未使用スキル")
    lines.append("")
    if unused_skills:
        lines.append("| スキル名 | 説明 |")
        lines.append("|----------|------|")
        for s in unused_skills:
            lines.append(f"| {s.name} | {s.description} |")
    else:
        lines.append("すべてのスキルが使用されました。")
    lines.append("")

    return "\n".join(lines)


def main() -> None:
    """メインエントリーポイント."""
    parser = argparse.ArgumentParser(
        description="セッションログからエージェント活動レポートを生成する",
    )
    parser.add_argument(
        "session_dir",
        help="セッションディレクトリ（session_YYYYMMDD_HHMMSS/）",
    )
    parser.add_argument(
        "--agents-dir",
        default=".claude/agents",
        help="エージェント定義ディレクトリ（デフォルト: .claude/agents）",
    )
    parser.add_argument(
        "--skills-dir",
        default=".claude/skills",
        help="スキル定義ディレクトリ（デフォルト: .claude/skills）",
    )
    parser.add_argument(
        "--output",
        default="agent_activity_report.md",
        help="出力ファイルパス（デフォルト: agent_activity_report.md）",
    )

    args = parser.parse_args()

    session_dir = Path(args.session_dir)
    if not session_dir.is_dir():
        print(f"エラー: セッションディレクトリが見つかりません: {session_dir}", file=sys.stderr)
        sys.exit(1)

    # スキル・エージェント定義の読込
    skills = discover_all_skills(args.skills_dir)
    agents = discover_all_agents(args.agents_dir)

    # セッションログの解析
    all_skill_calls: list[SkillCall] = []
    all_task_calls: list[TaskCall] = []
    all_read_skill_calls: list[SkillCall] = []

    # main.jsonl
    main_jsonl = session_dir / "main.jsonl"
    main_messages: list[dict] = []
    if main_jsonl.is_file():
        main_messages = parse_jsonl(str(main_jsonl))
        all_skill_calls.extend(extract_skill_calls(main_messages, "main"))
        all_task_calls.extend(extract_agent_calls(main_messages, "main"))
        all_read_skill_calls.extend(extract_read_skill_calls(main_messages, "main"))
    else:
        print(f"警告: main.jsonlが見つかりません: {main_jsonl}", file=sys.stderr)

    # agent-ID → subagent_type マッピング構築
    agent_id_map = build_agent_id_map(main_messages, session_dir)

    # agent-*.jsonl
    for agent_jsonl in sorted(session_dir.glob("agent-*.jsonl")):
        source_label = agent_jsonl.stem  # e.g. "agent-xxxxxxx"
        messages = parse_jsonl(str(agent_jsonl))
        all_skill_calls.extend(extract_skill_calls(messages, source_label))
        all_task_calls.extend(extract_agent_calls(messages, source_label))
        all_read_skill_calls.extend(extract_read_skill_calls(messages, source_label))

    # レポート生成
    report = build_report(
        skills, agents, all_skill_calls, all_task_calls, all_read_skill_calls, agent_id_map,
    )

    # 出力
    output_path = Path(args.output)
    output_path.write_text(report, encoding="utf-8")
    print(f"レポート生成完了: {output_path}")


if __name__ == "__main__":
    main()
