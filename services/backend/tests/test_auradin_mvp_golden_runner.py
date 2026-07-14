from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
import scripts.run_auradin_mvp_golden_eval as golden


class _Descriptor:
  run_date = "20260715"
  manifest_path = Path("/tmp/snapshot_20260715.json")
  manifest_sha256 = "a" * 64
  catalog_path = Path("/tmp/catalog_items_mvp_20260715.jsonl")
  catalog_sha256 = "b" * 64
  chunks_path = Path("/tmp/product_knowledge_chunks_mvp_20260715.jsonl")
  chunks_sha256 = "c" * 64
  vector_path = Path("/tmp/product_knowledge_vector_index_mvp_20260715.json")
  vector_sha256 = "d" * 64

  def public_status(self) -> dict[str, str]:
    return {
      "snapshotSource": "manifest_override",
      "snapshotRunDate": self.run_date,
      "snapshotManifestSha256": self.manifest_sha256,
    }


def _failed_result(prompt: str) -> dict:
  return {
    "prompt": prompt,
    "firstPhase": "question",
    "firstQuestionAttribute": "category",
    "finalPhase": "error",
    "questionCount": 1,
    "askedAttributes": ["category"],
    "products": [],
    "errorCode": "NO_RESULTS",
    "recoverable": True,
    "logs": [],
  }


def test_golden_runner_writes_failure_evidence_then_exits_nonzero(
  tmp_path: Path,
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  monkeypatch.setattr(golden, "REPO_ROOT", tmp_path)
  monkeypatch.setattr(golden, "get_settings", lambda: object())
  monkeypatch.setattr(golden, "resolve_and_validate_snapshot", lambda *_args, **_kwargs: _Descriptor())
  monkeypatch.setattr(golden, "clear_sessions", lambda: None)
  monkeypatch.setattr(golden, "run_prompt", _failed_result)
  monkeypatch.setattr(golden, "load_mvp_catalog", lambda **_kwargs: [])
  monkeypatch.setattr(golden, "_git_evidence", lambda: ("e" * 40, False))
  monkeypatch.setattr(
    golden,
    "build_semantic_scores",
    lambda *_args, **_kwargs: SimpleNamespace(
      backend="hash",
      status="available",
      degradedReason=None,
    ),
  )
  monkeypatch.setattr(sys, "argv", ["run_auradin_mvp_golden_eval.py", "--run-date", "20260715"])

  with pytest.raises(SystemExit) as exc_info:
    golden.main()

  assert exc_info.value.code == 1
  evidence = tmp_path / "reports/auradin/mvp_agent_eval_20260715.json"
  report = tmp_path / "reports/auradin/mvp_agent_eval_20260715.md"
  assert evidence.is_file()
  assert report.is_file()
  payload = json.loads(evidence.read_text(encoding="utf-8"))
  assert payload["appCommitSha"] == "e" * 40
  assert payload["workingTreeDirty"] is False
  assert payload["summary"] == {"status": "FAIL", "passed": 0, "failed": 6, "total": 6}
  assert all(result["status"] == "FAIL" for result in payload["results"])
  report_text = report.read_text(encoding="utf-8")
  assert f"appCommitSha: `{'e' * 40}`" in report_text
  assert "workingTreeDirty: `false`" in report_text


def test_golden_runner_uses_explicit_manifest_and_output_prefix(
  tmp_path: Path,
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  class _Settings:
    auradin_snapshot_manifest: str | None = None

  settings = _Settings()
  captured_settings: list[_Settings] = []
  monkeypatch.setattr(golden, "REPO_ROOT", tmp_path)
  monkeypatch.setattr(golden, "get_settings", lambda: settings)
  monkeypatch.setattr(
    golden,
    "resolve_and_validate_snapshot",
    lambda actual, **_kwargs: captured_settings.append(actual) or _Descriptor(),
  )
  monkeypatch.setattr(golden, "clear_sessions", lambda: None)
  monkeypatch.setattr(golden, "run_prompt", _failed_result)
  monkeypatch.setattr(golden, "load_mvp_catalog", lambda **_kwargs: [])
  monkeypatch.setattr(golden, "_git_evidence", lambda: ("f" * 40, False))
  monkeypatch.setattr(
    golden,
    "build_semantic_scores",
    lambda *_args, **_kwargs: SimpleNamespace(
      backend="hash",
      status="available",
      degradedReason=None,
    ),
  )
  manifest_path = tmp_path / "manifest.json"
  output_prefix = Path("reports/auradin/custom_eval")
  monkeypatch.setattr(
    sys,
    "argv",
    [
      "run_auradin_mvp_golden_eval.py",
      "--run-date",
      "20260715",
      "--manifest-path",
      str(manifest_path),
      "--output-prefix",
      str(output_prefix),
    ],
  )

  with pytest.raises(SystemExit) as exc_info:
    golden.main()

  assert exc_info.value.code == 1
  assert captured_settings == [settings]
  assert settings.auradin_snapshot_manifest == str(manifest_path)
  assert (tmp_path / "reports/auradin/custom_eval.md").is_file()
  evidence = tmp_path / "reports/auradin/custom_eval.json"
  assert evidence.is_file()
  assert json.loads(evidence.read_text(encoding="utf-8"))["appCommitSha"] == "f" * 40
  assert not (tmp_path / "reports/auradin/mvp_agent_eval_20260715.json").exists()


def test_require_clean_worktree_aborts_before_snapshot_or_evaluation(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  calls = {"settings": 0, "prompt": 0}

  def _settings() -> object:
    calls["settings"] += 1
    return object()

  def _prompt(_prompt_text: str) -> dict:
    calls["prompt"] += 1
    return _failed_result(_prompt_text)

  monkeypatch.setattr(golden, "_git_evidence", lambda: ("a" * 40, True))
  monkeypatch.setattr(golden, "get_settings", _settings)
  monkeypatch.setattr(golden, "run_prompt", _prompt)
  monkeypatch.setattr(
    sys,
    "argv",
    ["run_auradin_mvp_golden_eval.py", "--require-clean-worktree"],
  )

  with pytest.raises(SystemExit) as exc_info:
    golden.main()

  assert exc_info.value.code == 2
  assert calls == {"settings": 0, "prompt": 0}
