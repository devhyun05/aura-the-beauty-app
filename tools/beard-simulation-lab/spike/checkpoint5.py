"""Checkpoint-5 blinded panel builder (Codex #9/#10 protocol).

Per photo: ORIG always visible + X/Y blinded pair of
  A = current serving pipeline at 'medium' (kept as the naturalness-
      regression control — it must LOSE on erase-completeness; if it wins
      naturalness while C fails it, that is signal, not noise)
  C = hybrid v3 (guarded LaMa, coverage-first)
Letter assignment is deterministic but unpredictable (sha256 of photo name +
salt); the mapping is sealed OUTSIDE the panel folder the judge browses.

Judgment order (absolute FIRST, preference second):
  1. 보이는 수염이 전부 제거됐는가
  2. 얼굴형·입·콧구멍·가림물이 보존됐는가
  3. 회색/이색 패치나 경계선(seam)이 없는가
  4. 최종 사용 가능 (허용/불가)
  5. (마지막에만) X/Y 중 선호

Strata (aggregated separately, never pooled):
  beard-positive: newbeard1, 2, 4, 7, 12
  occluded:       newbeard10 (visible beard judged on the same absolute
                  standard; mask-hidden neck excluded from the coverage
                  denominator; any occluder change is a hard defect)
  negative:       newbeard6 (erase-completeness N/A; false-positive edits
                  and naturalness only — safety stratum)
"""
from __future__ import annotations

import hashlib
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

LAB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB))

from eval.measure_ghost import run_stages  # noqa: E402
from spike import hybrid_recon, lama_runner  # noqa: E402
from spike.oracle_kill import label  # noqa: E402

SRC = Path("/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/newbeards")
OUT = LAB / "outputs" / "ghost" / "checkpoint5"
STRATA = {
    "beard-positive": ["newbeard1", "newbeard2", "newbeard4", "newbeard7",
                       "newbeard12"],
    "occluded": ["newbeard10"],
    "negative": ["newbeard6"],
}
SALT = "checkpoint5-20260711"


def _load(path: Path) -> np.ndarray | None:
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        try:
            img = cv2.cvtColor(np.array(Image.open(path).convert("RGB")),
                               cv2.COLOR_RGB2BGR)
        except Exception:
            return None
    return img


def _photo_path(stem: str) -> Path | None:
    for p in SRC.iterdir():
        if p.stem == stem:
            return p
    return None


def main() -> int:
    tag = sys.argv[1] if len(sys.argv) > 1 else "cp5"
    out_dir = OUT / tag
    if out_dir.exists():
        raise SystemExit(f"{out_dir} exists — 규율 8: no overwriting runs")
    out_dir.mkdir(parents=True)
    panels = out_dir / "panels"
    panels.mkdir()

    lama_runner.get_model()
    mapping: dict[str, dict] = {}
    rows = []
    for stratum, names in STRATA.items():
        for stem in names:
            src = _photo_path(stem)
            if src is None:
                print(f"{stem}: MISSING under {SRC}")
                continue
            # C arm + all diagnostics via the production pipeline. A
            # reference abstain / gate failure is still recorded; the panel
            # then shows the C tile as ABSTAIN (an abstain IS a product
            # outcome the judge must see).
            rec = hybrid_recon.run_photo(stem, src, out_dir)
            rows.append({"stratum": stratum, **(rec or {"id": stem})})

            ctx = hybrid_recon.prepare_unlabeled(stem, src)
            if ctx is None or "abstain" in ctx:
                print(f"{stem}: no pipeline output for panel")
                continue
            crop = ctx["crop"]
            a_img = run_stages(ctx)["medium"]
            c_path = out_dir / f"{stem}_result.png"
            c_img = cv2.imread(str(c_path)) if c_path.exists() else None

            # Deterministic blind letters.
            first_is_a = int(hashlib.sha256(
                f"{SALT}:{stem}".encode()).hexdigest(), 16) % 2 == 0
            pair = [("A", a_img), ("C", c_img)]
            if not first_is_a:
                pair.reverse()
            letters = "XY"
            tiles = [label(crop.bgr, "ORIG")]
            for (arm, img), letter in zip(pair, letters):
                if img is None:
                    blank = np.zeros_like(crop.bgr)
                    cv2.putText(blank, "ABSTAIN", (10, blank.shape[0] // 2),
                                cv2.FONT_HERSHEY_SIMPLEX, 1.0,
                                (255, 255, 255), 2)
                    tiles.append(label(blank, letter))
                else:
                    tiles.append(label(img, letter))
            cv2.imwrite(str(panels / f"{stem}.png"), np.hstack(tiles))
            mapping[stem] = {letters[i]: pair[i][0] for i in range(2)}
            print(f"{stem}: panel ready ({stratum})")

    (out_dir / "report.json").write_text(json.dumps(
        {"meta": lama_runner.run_metadata(),
         "config": hybrid_recon.CONFIG, "strata": STRATA,
         "photos": rows}, indent=2, default=str))
    seal = LAB / "spike" / f"blind_mapping_{tag}.json"
    seal.write_text(json.dumps(mapping, indent=2))
    print(f"\npanels -> {panels}   (blinded; mapping sealed at {seal})")
    print("판정 순서: ① 수염 전부 제거? ② 얼굴형·입·콧구멍·가림물 보존? "
          "③ 회색/이색 패치·경계선 없음? ④ 사용 가능(허용/불가)? "
          "⑤ 마지막에만 X/Y 선호")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
