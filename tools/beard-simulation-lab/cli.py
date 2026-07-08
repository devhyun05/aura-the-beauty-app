"""Run the beard simulation pipeline on a single photo.

Usage:
  .venv/bin/python cli.py samples/me.jpg
  .venv/bin/python cli.py samples/me.jpg --stages mild,strong --shaving-state clean
"""

from __future__ import annotations

import argparse
import json
import sys

from engine.pipeline import DEFAULT_SURVEY, run_pipeline


def main() -> int:
    parser = argparse.ArgumentParser(description="Beard removal simulation (deterministic path)")
    parser.add_argument("photo", help="input photo path")
    parser.add_argument("--stages", default="mild,medium,strong",
                        help="comma-separated: mild,medium,strong")
    parser.add_argument("--shaving-state", default=DEFAULT_SURVEY["shavingState"],
                        choices=["clean", "stubble", "short", "dense"])
    parser.add_argument("--survey-json", default=None,
                        help="full survey as JSON string (overrides --shaving-state)")
    parser.add_argument("--config-dir", default=None)
    parser.add_argument("--out", default=None, help="output root (default outputs/runs)")
    args = parser.parse_args()

    survey = json.loads(args.survey_json) if args.survey_json else {
        **DEFAULT_SURVEY, "shavingState": args.shaving_state}

    outcome = run_pipeline(
        args.photo,
        stages=args.stages.split(","),
        survey=survey,
        config_dir=args.config_dir,
        out_root=args.out,
    )

    print(f"run dir: {outcome.run_dir}")
    if outcome.rejected:
        print(f"REJECTED: {outcome.reject_reason}")
        return 1

    assert outcome.result is not None
    for stage_result in outcome.result["stages"]:
        guard = stage_result["guard"]
        mitigations = ",".join(guard["mitigationsApplied"]) or "-"
        print(f"  {stage_result['stage']:<7} PASS  mitigations={mitigations}")
    for failure in outcome.result["failures"]:
        print(f"  {failure['stage']:<7} FAIL  {failure['reason']}")
    print(f"analysis: {outcome.result['analysis']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
