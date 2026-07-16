"""B4 월1회 확장 트랙 오케스트레이터 — 단계 체이닝 로직 테스트 (서브프로세스 mock)."""

import json
from pathlib import Path

import scripts.run_auradin_monthly_expansion as expansion


def _plan(spotcheck_dir: Path | None = None, categories: list[str] | None = None):
  return expansion.build_plan(
    run_date="20260801",
    categories=categories or ["lip", "cheek"],
    existing_seed=Path("/data/auradin/catalog/catalog_items_seed_20260708.jsonl"),
    data_root=Path("/data/auradin"),
    report_root=Path("/reports/auradin"),
    spotcheck_dir=spotcheck_dir,
    python_executable="python",
  )


def test_plan_stage_order_chains_existing_assets() -> None:
  stages = _plan()
  names = [stage["name"] for stage in stages]
  assert names == [
    "collect",
    "supplement:lip",
    "supplement:cheek",
    "spotcheck",
    "merge:lip",
    "merge:cheek",
    "promote-prep",
  ]

  collect = stages[0]["command"]
  assert "run_auradin_naver_collection.py" in collect[1]
  assert "--all-templates" in collect
  assert collect[collect.index("--categories") + 1] == "lip,cheek"

  supplement = stages[1]["command"]
  assert "build_auradin_base_supplement_seed.py" in supplement[1]
  assert supplement[supplement.index("--category") + 1] == "lip"
  assert "--apply-spotcheck" not in supplement
  assert supplement[supplement.index("--candidates") + 1].endswith(
    "product_candidates_20260801.jsonl",
  )

  promote = stages[-1]["command"]
  assert "run_auradin_weekly_offer_refresh.py" in promote[1]
  assert promote[promote.index("--from") + 1] == "preprocess"
  assert promote[promote.index("--seed-path") + 1].endswith(
    "catalog_items_seed_20260801_expanded.jsonl",
  )


def test_merge_stages_chain_outputs_sequentially() -> None:
  stages = {stage["name"]: stage for stage in _plan()}
  merge_lip = stages["merge:lip"]["command"]
  merge_cheek = stages["merge:cheek"]["command"]

  # 첫 병합의 base는 기존 시드, 다음 병합의 base는 직전 병합 산출물.
  assert merge_lip[merge_lip.index("--base-seed") + 1].endswith(
    "catalog_items_seed_20260708.jsonl",
  )
  step1_output = merge_lip[merge_lip.index("--output") + 1]
  assert merge_cheek[merge_cheek.index("--base-seed") + 1] == step1_output
  # 마지막 병합이 promote-prep의 seed-path와 동일한 최종 파일을 만든다.
  assert merge_cheek[merge_cheek.index("--output") + 1].endswith(
    "catalog_items_seed_20260801_expanded.jsonl",
  )
  assert merge_lip[merge_lip.index("--supplement") + 1].endswith(
    "lip_supplement_seed_20260801.jsonl",
  )


def test_execution_halts_at_human_spotcheck_gate() -> None:
  stages = _plan()
  ran: list[str] = []

  def runner(command: list[str]) -> int:
    ran.append(command[1])
    return 0

  result = expansion.execute_plan(stages, runner=runner)
  assert result["status"] == "halted_for_spotcheck"
  assert result["haltedAt"] == "spotcheck"
  # 게이트 앞 3단계(collect + supplement×2)만 실행, merge/promote-prep은 미실행.
  assert len(ran) == 3
  assert not any("merge_auradin_seed_supplement" in name for name in ran)
  assert not any("run_auradin_weekly_offer_refresh" in name for name in ran)


def test_execution_stops_on_stage_failure() -> None:
  stages = _plan()
  ran: list[str] = []

  def runner(command: list[str]) -> int:
    ran.append(command[1])
    return 1 if "build_auradin_base_supplement_seed.py" in command[1] else 0

  result = expansion.execute_plan(stages, runner=runner)
  assert result["status"] == "failed"
  assert result["failedStage"] == "supplement:lip"
  assert result["returnCode"] == 1
  assert len(ran) == 2  # collect + 실패한 supplement:lip 까지만.


def test_spotcheck_dir_switches_to_apply_mode_and_full_chain() -> None:
  stages = _plan(spotcheck_dir=Path("/reviewed"))
  names = [stage["name"] for stage in stages]
  assert "spotcheck" not in names  # 사람 게이트는 apply 재실행에서는 계획에 없음.

  supplement = next(stage for stage in stages if stage["name"] == "supplement:lip")["command"]
  assert supplement[supplement.index("--apply-spotcheck") + 1] == (
    "/reviewed/lip_supplement_spotcheck_20260801.csv"
  )

  ran: list[str] = []
  result = expansion.execute_plan(stages, runner=lambda command: (ran.append(command[1]), 0)[1])
  assert result["status"] == "completed"
  assert result["executed"] == names


def test_plan_only_mode_runs_no_subprocess(tmp_path: Path, capsys, monkeypatch) -> None:
  seed = tmp_path / "seed.jsonl"
  seed.write_text("{}\n", encoding="utf-8")

  def _forbidden(*args, **kwargs):
    raise AssertionError("plan-only must not spawn subprocesses")

  monkeypatch.setattr(expansion.subprocess, "run", _forbidden)
  exit_code = expansion.main(
    [
      "--date", "20260801",
      "--categories", "lip",
      "--existing-seed", str(seed),
      "--data-root", str(tmp_path),
      "--report-root", str(tmp_path),
      "--plan-only",
    ],
  )
  assert exit_code == 0
  payload = json.loads(capsys.readouterr().out)
  assert payload["mode"] == "plan-only"
  assert [stage["name"] for stage in payload["stages"]] == [
    "collect",
    "supplement:lip",
    "spotcheck",
    "merge:lip",
    "promote-prep",
  ]
  human_gate = payload["stages"][2]
  assert human_gate["kind"] == "human_gate"
  assert "command" not in human_gate
