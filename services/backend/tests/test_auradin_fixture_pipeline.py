from pathlib import Path

from app.services.auradin_catalog.pipeline import run_fixture_pipeline


def test_fixture_pipeline_writes_candidate_and_queue_outputs(tmp_path: Path) -> None:
  fixture_path = Path(__file__).parent / "fixtures" / "auradin" / "naver_shop_fixture.json"
  result = run_fixture_pipeline(
    fixture_path=fixture_path,
    output_root=tmp_path / "data" / "auradin",
    report_root=tmp_path / "reports" / "auradin",
    run_date="20260702",
    collected_at="2026-07-02T00:00:00+09:00",
  )

  assert result.raw_count == 7
  assert result.candidate_count == 4
  assert result.queue_count == 4
  assert result.candidate_quality["passed"] is True
  assert result.queue_quality["passed"] is True
  assert result.rejects == {
    "brand_not_whitelisted": 1,
    "non_cosmetic_noise": 1,
  }
  assert result.processed_path.read_text(encoding="utf-8").count("\n") == 4
  assert result.queue_path.read_text(encoding="utf-8").count("\n") == 4
  assert "No official mall, Olive Young, Naver detail page" in result.naver_summary_path.read_text(
    encoding="utf-8",
  )
