"""LaMa face-domain fine-tune — spike v0.1 (checkpoint-⑦ verdict follow-up).

WHY (human-judged evidence, 2026-07-12): cp7 unseal — every holdout fill was
rejected by the judge ("턱 모양·입 모양 다 바뀜", usable 0/8, anatomy 8/8) AND
by the quality gates (gate-human agreement 8/8). The fill model (Places2
big-lama) does not know facial anatomy; no threshold can fix that. The deep-
research conclusion (LaMa face fine-tune is the only path) is now backed by
holdout human data, so this spike stands the mechanism up end-to-end.

WHAT: fine-tune the traced big-lama.pt DIRECTLY (feasibility probed 2026-07-12:
gradients flow into all 533 param tensors, ~3.4s/step @256 b1 CPU; MPS forward
OK). Training pairs are built with the SAME front end the product uses
(detect_face -> build_lower_face_crop), on license-tagged clean-shaven faces
(Commons CC, manifest with author/license per image): beard-shaped holes over
the philtrum/chin/jaw with the clean skin as target — the model learns "fill
beard-region holes with THIS FACE's clean skin", including lip/jaw boundary
preservation (holes may touch but rarely cover the lips).

CONTRACTS:
  * inference determinism untouched — training happens offline; the output is
    a new TorchScript .pt whose sha256 gets its own manifest. spike/lama_runner
    still refuses unpinned weights.
  * SPIKE WEIGHTS ARE NOT SHIPPABLE: big-lama base weights + training photos
    carry license obligations (legal review is a standing pre-commercial
    blocker — see lama_manifest.json). This is mechanism evidence only.
  * eval on dev material only (dev9 + demoted cp6/cp7). Next checkpoint (⑧)
    requires fresh sealed material.

Usage:
  finetune_lama.py --data DIR [--steps 1500] [--batch 2] [--tag v01]
  (DIR = collector output: imgs/*.jpg + train_manifest.json)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import torch

LAB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB))

from engine.detect_face import (  # noqa: E402
    LIPS_OUTER, NOSE_BOTTOM, NOSTRILS, detect_face,
)
from engine.lower_face_roi import build_lower_face_crop  # noqa: E402

WEIGHTS = LAB / "external" / "models" / "big-lama" / "big-lama.pt"
OUT_ROOT = LAB / "outputs" / "finetune"
SEED = 20260712
TILE = 256          # training tile (mod-8); big-lama was trained at 256
FW_RANGE = (200.0, 300.0)   # resize crops so the face width lands here
HOLE_LIP_TOUCH_P = 0.15     # fraction of samples whose hole may cover lips


def _load_pairs(data_dir: Path, rng: random.Random) -> list[dict]:
    """Front-end every training photo exactly like inference: quality gate,
    lower-face crop, landmarks in crop coords. Cached in memory (spike scale)."""
    man = json.loads((data_dir / "train_manifest.json").read_text())
    pairs = []
    for title, m in man.items():
        p = data_dir / "imgs" / m["file"]
        bgr = cv2.imread(str(p), cv2.IMREAD_COLOR)
        if bgr is None:
            continue
        det = detect_face(bgr)
        if det is None or not det.quality.passed:
            continue
        crop = build_lower_face_crop(bgr, det.landmarks, det.face_width,
                                     det.face_height, under_jaw_extend=0.12)
        fw = crop.face_width
        scale = rng.uniform(*FW_RANGE) / fw
        img = cv2.resize(crop.bgr, (max(TILE, int(crop.bgr.shape[1] * scale)),
                                    max(TILE, int(crop.bgr.shape[0] * scale))),
                         interpolation=cv2.INTER_AREA)
        lm = crop.landmarks * scale
        pairs.append({"img": img, "lm": lm, "fw": fw * scale,
                      "file": m["file"], "license": m["license"]})
    return pairs


def _beard_hole(sample: dict, rng: random.Random) -> np.ndarray:
    """Synthetic beard-region hole in image coords: philtrum band + chin patch
    + jaw band, randomized; usually avoids the lip polygon so the model
    learns to STOP at the vermilion instead of repainting it."""
    img, lm, fw = sample["img"], sample["lm"], sample["fw"]
    h, w = img.shape[:2]
    hole = np.zeros((h, w), np.uint8)
    nose = lm[NOSE_BOTTOM]
    lips = lm[LIPS_OUTER]
    lip_top = float(lips[:, 1].min())
    lip_bot = float(lips[:, 1].max())
    cx = float(nose[0])

    if rng.random() < 0.9:   # philtrum / mustache band
        y0 = int(nose[1] + 0.01 * fw)
        y1 = int(max(y0 + 3, lip_top - 0.005 * fw))
        x0, x1 = int(cx - rng.uniform(0.14, 0.22) * fw), int(cx + rng.uniform(0.14, 0.22) * fw)
        cv2.rectangle(hole, (x0, y0), (x1, y1), 1, -1)
    if rng.random() < 0.85:  # chin patch
        cy = int(lip_bot + rng.uniform(0.06, 0.14) * fw)
        ax = int(rng.uniform(0.10, 0.20) * fw)
        ay = int(rng.uniform(0.06, 0.12) * fw)
        cv2.ellipse(hole, (int(cx), cy), (ax, ay), 0, 0, 360, 1, -1)
    if rng.random() < 0.7:   # jaw/cheek bands
        for sgn in (-1, 1):
            if rng.random() < 0.75:
                bx = int(cx + sgn * rng.uniform(0.18, 0.30) * fw)
                by = int(lip_bot + rng.uniform(0.0, 0.08) * fw)
                cv2.ellipse(hole, (bx, by),
                            (int(rng.uniform(0.08, 0.16) * fw),
                             int(rng.uniform(0.05, 0.10) * fw)),
                            rng.uniform(-25, 25), 0, 360, 1, -1)
    # jitter the boundary so edges are not analytic shapes
    k = max(3, int(0.01 * fw) | 1)
    hole = cv2.dilate(hole, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    if rng.random() > HOLE_LIP_TOUCH_P:
        lip_poly = np.zeros((h, w), np.uint8)
        cv2.fillPoly(lip_poly, [lips.astype(np.int32)], 1)
        lk = max(3, int(0.008 * fw) | 1)
        lip_poly = cv2.dilate(lip_poly, cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (lk, lk)))
        hole[lip_poly > 0] = 0
    # nostril apertures are NEVER holes (inference guards them; keep the
    # training distribution consistent)
    for idx in NOSTRILS:
        cv2.circle(hole, (int(lm[idx][0]), int(lm[idx][1])),
                   max(2, int(0.02 * fw)), 0, -1)
    return hole


def _tile_batch(pairs, rng, batch):
    imgs, masks = [], []
    while len(imgs) < batch:
        s = rng.choice(pairs)
        img, lm = s["img"], s["lm"]
        h, w = img.shape[:2]
        hole = _beard_hole(s, rng)
        if hole.sum() < 200:
            continue
        ys, xs = np.nonzero(hole)
        cy = int(np.clip(ys.mean() + rng.uniform(-20, 20), TILE // 2, max(TILE // 2, h - TILE // 2)))
        cxp = int(np.clip(xs.mean() + rng.uniform(-30, 30), TILE // 2, max(TILE // 2, w - TILE // 2)))
        y0, x0 = cy - TILE // 2, cxp - TILE // 2
        t_img = img[y0:y0 + TILE, x0:x0 + TILE]
        t_hole = hole[y0:y0 + TILE, x0:x0 + TILE]
        if t_img.shape[:2] != (TILE, TILE) or t_hole.sum() < 200:
            continue
        rgb = cv2.cvtColor(t_img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        imgs.append(torch.from_numpy(rgb.transpose(2, 0, 1)))
        masks.append(torch.from_numpy(t_hole.astype(np.float32))[None])
    return torch.stack(imgs), torch.stack(masks)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, type=Path)
    ap.add_argument("--steps", type=int, default=1500)
    ap.add_argument("--batch", type=int, default=2)
    ap.add_argument("--lr", type=float, default=1e-5)
    ap.add_argument("--tag", default="v01")
    args = ap.parse_args()

    out = OUT_ROOT / f"lama_face_{args.tag}"
    if out.exists():
        raise SystemExit(f"{out} exists — 규율 8: no overwriting runs")
    out.mkdir(parents=True)
    (out / "samples").mkdir()

    rng = random.Random(SEED)
    torch.manual_seed(SEED)
    np.random.seed(SEED)

    pairs = _load_pairs(args.data, rng)
    print(f"training pairs: {len(pairs)}", flush=True)
    assert len(pairs) >= 40, "too few training faces for even a spike"

    model = torch.jit.load(str(WEIGHTS), map_location="cpu")
    model.train(False)                       # eval semantics, grads only
    params = [p for p in model.parameters()]
    for p in params:
        p.requires_grad_(True)
    opt = torch.optim.AdamW(params, lr=args.lr)

    # fixed eval batch for the sample sheets (first 3 pairs, fixed holes)
    ev_rng = random.Random(1)
    ev_imgs, ev_masks = _tile_batch(pairs[:10], ev_rng, 3)

    losses = []
    t0 = time.time()
    for step in range(1, args.steps + 1):
        imgs, masks = _tile_batch(pairs, rng, args.batch)
        out_t = model(imgs, masks)
        hole = masks
        l_hole = (torch.abs(out_t - imgs) * hole).sum() / hole.sum().clamp(min=1) / 3
        gx = torch.abs(torch.diff(out_t, dim=3) - torch.diff(imgs, dim=3))
        gy = torch.abs(torch.diff(out_t, dim=2) - torch.diff(imgs, dim=2))
        l_grad = ((gx * hole[..., :, 1:]).sum() + (gy * hole[..., 1:, :]).sum()) \
            / hole.sum().clamp(min=1) / 3
        l_ctx = (torch.abs(out_t - imgs) * (1 - hole)).sum() \
            / (1 - hole).sum().clamp(min=1) / 3
        loss = l_hole + 0.5 * l_grad + 0.1 * l_ctx
        opt.zero_grad()
        loss.backward()
        opt.step()
        losses.append(float(loss))
        if step % 25 == 0:
            dt = (time.time() - t0) / step
            print(f"step {step}/{args.steps} loss={np.mean(losses[-25:]):.4f} "
                  f"({dt:.1f}s/step, ETA {(args.steps-step)*dt/60:.0f}m)",
                  flush=True)
        if step % 250 == 0 or step == args.steps:
            with torch.inference_mode():
                ev = model(ev_imgs, ev_masks)
            tiles = []
            for i in range(ev.shape[0]):
                a = (ev_imgs[i].numpy().transpose(1, 2, 0)[..., ::-1] * 255).astype(np.uint8)
                b = (ev[i].numpy().transpose(1, 2, 0)[..., ::-1] * 255).clip(0, 255).astype(np.uint8)
                mm = (ev_masks[i, 0].numpy() * 255).astype(np.uint8)
                tiles.append(np.hstack([a, cv2.cvtColor(mm, cv2.COLOR_GRAY2BGR), b]))
            cv2.imwrite(str(out / "samples" / f"step_{step:05d}.png"),
                        np.vstack(tiles))
            model.save(str(out / "weights_last.pt"))

    model.save(str(out / "weights_last.pt"))
    sha = hashlib.sha256((out / "weights_last.pt").read_bytes()).hexdigest()
    (out / "run_manifest.json").write_text(json.dumps({
        "base": "big-lama.pt sha " + json.loads(
            (LAB / "spike" / "lama_manifest.json").read_text())["sha256"],
        "weightsSha256": sha, "steps": args.steps, "batch": args.batch,
        "lr": args.lr, "seed": SEED, "pairs": len(pairs),
        "dataManifestSha256": hashlib.sha256(
            (args.data / "train_manifest.json").read_bytes()).hexdigest(),
        "lossTail": [round(v, 5) for v in losses[-20:]],
        "shippable": False,
        "note": "SPIKE — mechanism evidence only; legal review blocking for "
                "any commercial use (base weights + training photo licenses)",
    }, indent=2) + "\n")
    print(f"done -> {out} (weights sha {sha[:12]}…)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
