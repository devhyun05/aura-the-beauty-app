"""월1회 확장 트랙 오케스트레이터 (B4 — 종합보고서 §6.2 확장 트랙).

기존 자산 체이닝 (신규 인프라 없음):
  ① collect      run_auradin_naver_collection --all-templates (전 카테고리)
  ② supplement   build_auradin_base_supplement_seed --category {cat} (카테고리별 신규 판별)
  ③ spotcheck    사람 스팟체크 큐 — 여기서 체인이 멈춘다 (사람 게이트, 자동 통과 없음)
  ④ merge        merge_auradin_seed_supplement (카테고리 supplement를 순차 병합)
  ⑤ promote-prep run_auradin_weekly_offer_refresh --from preprocess --seed-path {merged}
                 → preprocess→vector→prepare→golden까지. activate는 사람만 실행.

`--plan-only`는 서브프로세스 실행 없이 실행 계획(JSON)만 출력한다.
스팟체크 CSV(verdict/checkedBy — 사람만 기입)가 채워진 뒤 `--spotcheck-dir`로 재실행하면
②를 --apply-spotcheck 모드로 다시 돌리고 ④·⑤까지 진행한다.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Callable

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_ROOT = REPO_ROOT / "scripts"

DEFAULT_CATEGORIES = ("base", "brow", "cheek", "liner", "lip", "shadow")
HUMAN_GATE_STAGE = "spotcheck"


class ExpansionAbort(RuntimeError):
  pass


def _default_run_date() -> str:
  return (datetime.now(tz=UTC) + timedelta(hours=9)).strftime("%Y%m%d")


def _split_csv(value: str | None) -> list[str]:
  if not value:
    return []
  return [item.strip() for item in value.split(",") if item.strip()]


def resolve_active_seed_path(data_root: Path) -> Path | None:
  pointer_path = data_root / "active_snapshot.json"
  if not pointer_path.exists():
    return None
  pointer = json.loads(pointer_path.read_text(encoding="utf-8"))
  manifest_path = data_root / str(pointer.get("manifestPath") or "")
  if not manifest_path.exists():
    return None
  manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
  seed_path = data_root / str(manifest.get("seedPath") or "")
  return seed_path if seed_path.exists() else None


def build_plan(
  *,
  run_date: str,
  categories: list[str],
  existing_seed: Path,
  data_root: Path,
  report_root: Path,
  spotcheck_dir: Path | None,
  python_executable: str,
) -> list[dict[str, Any]]:
  """실행 계획 — 각 스테이지는 {name, kind, command|note}. kind=human_gate는 실행 정지점."""
  candidates_path = data_root / "processed" / f"product_candidates_{run_date}.jsonl"
  stages: list[dict[str, Any]] = []

  stages.append(
    {
      "name": "collect",
      "kind": "subprocess",
      "command": [
        python_executable,
        str(SCRIPTS_ROOT / "run_auradin_naver_collection.py"),
        "--date", run_date,
        "--all-templates",
        "--categories", ",".join(categories),
        "--output-root", str(data_root),
        "--report-root", str(report_root),
      ],
    },
  )

  supplement_outputs: dict[str, Path] = {}
  for category in categories:
    supplement_path = data_root / "catalog" / f"{category}_supplement_seed_{run_date}.jsonl"
    supplement_outputs[category] = supplement_path
    command = [
      python_executable,
      str(SCRIPTS_ROOT / "build_auradin_base_supplement_seed.py"),
      "--candidates", str(candidates_path),
      "--existing-seed", str(existing_seed),
      "--run-date", run_date,
      "--category", category,
      "--output", str(supplement_path),
      "--spotcheck-output",
      str(data_root / "review" / f"{category}_supplement_spotcheck_{run_date}.csv"),
    ]
    if spotcheck_dir is not None:
      command.extend(
        ["--apply-spotcheck", str(spotcheck_dir / f"{category}_supplement_spotcheck_{run_date}.csv")],
      )
    stages.append(
      {
        "name": f"supplement:{category}",
        "kind": "subprocess",
        "command": command,
      },
    )

  if spotcheck_dir is None:
    stages.append(
      {
        "name": HUMAN_GATE_STAGE,
        "kind": "human_gate",
        "note": (
          "사람 스팟체크 게이트 — data/auradin/review/{category}_supplement_spotcheck_"
          f"{run_date}.csv의 verdict/checkedBy를 사람이 기입한 뒤 "
          "--spotcheck-dir <검토된 CSV 디렉터리>로 재실행. 자동 통과 없음."
        ),
      },
    )

  merged_seed = data_root / "catalog" / f"catalog_items_seed_{run_date}_expanded.jsonl"
  merge_base = existing_seed
  for index, category in enumerate(categories):
    merge_output = (
      merged_seed
      if index == len(categories) - 1
      else data_root / "catalog" / f"catalog_items_seed_{run_date}_merge_step{index + 1}.jsonl"
    )
    stages.append(
      {
        "name": f"merge:{category}",
        "kind": "subprocess",
        "command": [
          python_executable,
          str(SCRIPTS_ROOT / "merge_auradin_seed_supplement.py"),
          "--base-seed", str(merge_base),
          "--supplement", str(supplement_outputs[category]),
          "--output", str(merge_output),
          "--report",
          str(report_root / f"seed_supplement_merge_{category}_{run_date}.md"),
        ],
      },
    )
    merge_base = merge_output

  stages.append(
    {
      "name": "promote-prep",
      "kind": "subprocess",
      "command": [
        python_executable,
        str(SCRIPTS_ROOT / "run_auradin_weekly_offer_refresh.py"),
        "--run-date", run_date,
        "--from", "preprocess",
        "--seed-path", str(merged_seed),
        "--data-root", str(data_root),
      ],
      "note": "preprocess→vector→prepare→golden까지 — activate(승격)는 사람만 실행.",
    },
  )
  return stages


def execute_plan(
  stages: list[dict[str, Any]],
  *,
  runner: Callable[[list[str]], int] | None = None,
) -> dict[str, Any]:
  """스테이지를 순차 실행. human_gate에서 정지, 실패 시 이후 스테이지 실행 안 함."""

  def _default_runner(command: list[str]) -> int:
    completed = subprocess.run(command, check=False)
    return int(completed.returncode)

  run = runner or _default_runner
  executed: list[str] = []
  for stage in stages:
    if stage["kind"] == "human_gate":
      return {
        "executed": executed,
        "haltedAt": stage["name"],
        "note": stage.get("note", ""),
        "status": "halted_for_spotcheck",
      }
    return_code = run(list(stage["command"]))
    executed.append(stage["name"])
    if return_code != 0:
      return {
        "executed": executed,
        "failedStage": stage["name"],
        "returnCode": return_code,
        "status": "failed",
      }
  return {"executed": executed, "status": "completed"}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Monthly Auradin expansion track orchestrator (B4, §6.2) — chains existing assets.",
  )
  parser.add_argument("--date", default=_default_run_date())
  parser.add_argument(
    "--categories",
    default=",".join(DEFAULT_CATEGORIES),
    help="Comma-separated categories (default: all 6).",
  )
  parser.add_argument("--existing-seed", type=Path, default=None)
  parser.add_argument("--data-root", type=Path, default=REPO_ROOT / "data" / "auradin")
  parser.add_argument("--report-root", type=Path, default=REPO_ROOT / "reports" / "auradin")
  parser.add_argument(
    "--spotcheck-dir",
    type=Path,
    default=None,
    help="사람이 기입한 스팟체크 CSV 디렉터리 — 지정 시 apply 모드로 merge·promote-prep까지 진행.",
  )
  parser.add_argument(
    "--plan-only",
    action="store_true",
    help="서브프로세스 실행 없이 실행 계획(JSON)만 출력.",
  )
  parser.add_argument("--python", dest="python_executable", default=sys.executable)
  return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
  args = parse_args(argv)
  try:
    if len(args.date) != 8 or not args.date.isdigit():
      raise ExpansionAbort("date must be YYYYMMDD")
    categories = _split_csv(args.categories)
    if not categories:
      raise ExpansionAbort("categories must not be empty")
    existing_seed = args.existing_seed or resolve_active_seed_path(args.data_root)
    if existing_seed is None:
      raise ExpansionAbort("existing seed not found — pass --existing-seed explicitly")

    stages = build_plan(
      run_date=args.date,
      categories=categories,
      existing_seed=existing_seed,
      data_root=args.data_root,
      report_root=args.report_root,
      spotcheck_dir=args.spotcheck_dir,
      python_executable=args.python_executable,
    )

    if args.plan_only:
      print(
        json.dumps(
          {
            "existingSeed": str(existing_seed),
            "mode": "plan-only",
            "runDate": args.date,
            "stages": stages,
          },
          ensure_ascii=False,
          indent=2,
          sort_keys=True,
        ),
      )
      return 0

    if args.spotcheck_dir is not None:
      missing = [
        category
        for category in categories
        if not (args.spotcheck_dir / f"{category}_supplement_spotcheck_{args.date}.csv").exists()
      ]
      if missing:
        raise ExpansionAbort(
          f"spotcheck CSV missing for categories: {', '.join(missing)} in {args.spotcheck_dir}",
        )

    result = execute_plan(stages)
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if result["status"] in {"completed", "halted_for_spotcheck"} else 1
  except (OSError, ExpansionAbort, json.JSONDecodeError) as exc:
    print(f"monthly expansion failed: {exc}", file=sys.stderr)
    return 1


if __name__ == "__main__":
  raise SystemExit(main())
