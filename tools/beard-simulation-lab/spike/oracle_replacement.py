"""Oracle-assisted falsification spike: can REPLACEMENT look cleanly erased?

The direction under test (cross-validated 2026-07-11): stop attenuating hair
contrast; key the actual dark hair pixels and REPLACE them -- texture from the
person's own clean skin, chroma from an uncontaminated reference -- plus a
gated low-frequency darkness lift.

Codex pre-run review (NO-GO list) is incorporated:
  - the GATE stays on the frozen strict candidates, but the EDIT KEY is a
    separate broad max(p95, med+3MAD) key (no mole heuristic, explicit
    human-confirmed exclusions), approved on an overlay before results count;
  - all edits are composited back through an explicit scope mask, so pixels
    outside the edit scope are BYTE-IDENTICAL to the original (Lab round-trip
    leakage eliminated, negative controls meaningful);
  - the shading fit's IRLS normal equations are the correct A'WA b = A'Wt;
  - missing negative controls are a hard failure, not a silent pass;
  - quilting lays a non-jittered base layer first, so no coverage holes;
  - the S4 ring gate measures the EXTERIOR ring (dilate(zone) & ~zone).

Variants per photo:  A = current medium   B = keyed replacement + clean chroma
                     C = B + gated shading lift
Human judgement is blinded: X/Y/Z panels in deterministic per-photo order,
mapping revealed only in blind_mapping.json after the verdict.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine.beard_segmentation import fit_skin_model  # noqa: E402
from engine.lower_face_roi import skin_reference_pixels  # noqa: E402
from eval.ghost_ruler import score_result  # noqa: E402
from eval.measure_ghost import build_broad_key, prepare_photo, run_stages  # noqa: E402
from eval.run_owndomain_eval import discover_pairs  # noqa: E402

LAB = Path(__file__).resolve().parents[1]
OUT = LAB / "outputs" / "ghost" / "oracle_spike"
CONTROLS_PATH = LAB / "spike" / "oracle_controls.json"

_PATCH = 32
_STRIDE = 16


def quilt_high_field(bgr: np.ndarray, sample_mask: np.ndarray, fw: float,
                     seed: int = 0) -> np.ndarray | None:
    """Natural-amplitude 3-channel high-band field quilted from clean skin.

    Not unit-RMS (texture.build_grain_field): donor texture must arrive at the
    donor's real amplitude and chroma because it REPLACES hair pixels. A
    non-jittered base pass guarantees full coverage; the jittered pass on top
    breaks up any grid regularity (Codex reproduced interior holes with the
    jittered pass alone).
    """
    h, w = bgr.shape[:2]
    img = bgr.astype(np.float32)
    low = cv2.GaussianBlur(img, (0, 0), sigmaX=max(2.0, fw / 30))
    high = img - low
    ok = sample_mask > 0.5
    ys, xs = np.where(ok)
    P = _PATCH
    if ys.size < P * P:
        return None
    patches = []
    for y in range(int(ys.min()), max(int(ys.max()) - P, int(ys.min())) + 1, P // 2):
        for x in range(int(xs.min()), max(int(xs.max()) - P, int(xs.min())) + 1, P // 2):
            m = ok[y:y + P, x:x + P]
            if m.shape == (P, P) and float(m.mean()) > 0.98:
                patches.append(high[y:y + P, x:x + P]
                               - high[y:y + P, x:x + P].mean(axis=(0, 1)))
    if not patches:
        return None
    rng = np.random.default_rng(seed)
    win = (np.hanning(P)[:, None] * np.hanning(P)[None, :]).astype(np.float32)[..., None]
    acc = np.zeros((h + 2 * P, w + 2 * P, 3), np.float32)
    wsum = np.zeros((h + 2 * P, w + 2 * P, 1), np.float32)
    for jitter in (0, P // 4):                      # base pass, then jittered
        for gy in range(0, h + P, _STRIDE):
            for gx in range(0, w + P, _STRIDE):
                p = patches[int(rng.integers(len(patches)))]
                p = np.rot90(p, int(rng.integers(4)))
                if rng.integers(2):
                    p = p[:, ::-1]
                jy = gy + (int(rng.integers(-jitter, jitter + 1)) if jitter else 0)
                jx = gx + (int(rng.integers(-jitter, jitter + 1)) if jitter else 0)
                jy = min(max(jy, 0), h + P)
                jx = min(max(jx, 0), w + P)
                acc[jy:jy + P, jx:jx + P] += p * win
                wsum[jy:jy + P, jx:jx + P] += win
    field = acc[P:P + h, P:P + w] / np.maximum(wsum[P:P + h, P:P + w], 1e-3)
    assert float(wsum[P:P + h, P:P + w].min()) > 1e-3, "quilt coverage hole"
    return field


def robust_chroma_ref(lab: np.ndarray, clean: np.ndarray, fw: float,
                      skin_ab: np.ndarray) -> np.ndarray:
    """Smooth a,b reference from UNCONTAMINATED support, Mahalanobis-capped."""
    m = clean.astype(np.float32)
    sigma = max(12.0, fw / 7.5)
    wsum = cv2.GaussianBlur(m, (0, 0), sigma)
    ref = np.empty_like(lab[..., 1:])
    for i in (1, 2):
        ref[..., i - 1] = cv2.GaussianBlur(lab[..., i] * m, (0, 0), sigma)
    ref = ref / np.maximum(wsum[..., None], 1e-4)
    ref = np.where(wsum[..., None] > 1e-3, ref, skin_ab)

    ab = lab[..., 1:][clean]
    if len(ab) > 500:
        cov = np.cov(ab.T) + np.eye(2) * 0.5
        icov = np.linalg.inv(cov)
        d = ref - skin_ab
        m2 = np.einsum("...i,ij,...j->...", d, icov, d)
        scale = np.minimum(1.0, 3.0 / np.maximum(np.sqrt(m2), 1e-6))[..., None]
        ref = skin_ab + d * scale
    return ref.astype(np.float32)


def shading_field(l_low: np.ndarray, clean: np.ndarray, zone: np.ndarray,
                  fw: float) -> tuple[np.ndarray | None, dict]:
    """Hybrid jaw-shading estimate: robust quadratic + normalized-conv residual."""
    h, w = l_low.shape
    ys, xs = np.nonzero(clean)
    info: dict = {"supportPx": int(len(ys))}
    if len(ys) < 800:
        info["gate"] = "insufficient support"
        return None, info

    dist = cv2.distanceTransform((~clean).astype(np.uint8), cv2.DIST_L2, 3)
    zd = dist[zone]
    info["supportDistP95"] = float(np.percentile(zd, 95)) if zd.size else 0.0
    ring_k = np.ones((int(0.12 * fw) | 1,) * 2, np.uint8)
    ring = (cv2.dilate(zone.astype(np.uint8), ring_k) > 0) & ~zone
    info["ringCleanFrac"] = float(clean[ring].mean()) if ring.any() else 0.0
    gate_ok = (info["supportDistP95"] <= 0.10 * fw
               and info["ringCleanFrac"] >= 0.20)
    info["gate"] = "full" if gate_ok else "fallback"

    cy, cx = h / 2, w / 2
    idx = np.random.default_rng(3).choice(len(ys), min(len(ys), 8000), replace=False)
    yy, xx = ys[idx], xs[idx]
    u, v = (xx - cx) / fw, (yy - cy) / fw
    A = np.stack([np.ones_like(u), u, v, u * u, u * v, v * v], 1)
    t = l_low[yy, xx].astype(np.float64)
    wgt = np.ones(len(t))
    beta = None
    for _ in range(5):
        # Correct weighted normal equations: (A' W A) beta = A' W t.
        AW = A * wgt[:, None]
        beta = np.linalg.solve(AW.T @ A + np.eye(6) * 1e-3, AW.T @ t)
        res = t - A @ beta
        s = max(np.median(np.abs(res)) * 1.4826, 1e-3)
        wgt = np.minimum(1.0, 1.345 / np.maximum(np.abs(res) / s, 1e-6))
    gy, gx = np.mgrid[0:h, 0:w]
    U, V = (gx - cx) / fw, (gy - cy) / fw
    P = (beta[0] + beta[1] * U + beta[2] * V + beta[3] * U * U
         + beta[4] * U * V + beta[5] * V * V).astype(np.float32)

    R = (l_low - P) * clean
    m = clean.astype(np.float32)
    S = P.copy()
    filled = np.zeros((h, w), bool)
    for sig in (0.05 * fw, 0.10 * fw):
        num = cv2.GaussianBlur(R, (0, 0), sig)
        den = cv2.GaussianBlur(m, (0, 0), sig)
        good = (den > 0.02) & ~filled
        S[good] = P[good] + (num[good] / den[good])
        filled |= good
    return S, info


def controls_for(name: str) -> list[dict]:
    """Negative controls are REQUIRED for a spike photo -- silence is failure."""
    if not CONTROLS_PATH.exists():
        raise SystemExit(f"controls file missing: {CONTROLS_PATH}")
    data = json.loads(CONTROLS_PATH.read_text())
    ctrl = [c for c in data.get(name, []) if isinstance(c, dict)]
    if not ctrl:
        raise SystemExit(f"no negative controls recorded for {name}; refusing to run")
    return ctrl


def run_photo(name: str, img_path: Path, gt_path: Path,
              key_percentile: float = 95.0) -> dict | None:
    ctrl = controls_for(name)
    ctx = prepare_photo(name, img_path, gt_path)
    if ctx is None:
        return None
    crop, zone, cands = ctx["crop"], ctx["zone"], ctx["cands"]
    fw = crop.face_width
    H, W = crop.bgr.shape[:2]
    for c in ctrl:  # crop-local coordinate sanity
        if not (0 <= c["x"] < W and 0 <= c["y"] < H):
            raise SystemExit(f"{name}: control out of crop bounds: {c}")

    # --- oracle inputs ------------------------------------------------------
    key = build_broad_key(ctx, percentile=key_percentile)
    if key.sum() < 16:
        print(f"{name}: broad key empty; skipping")
        return None
    allowed = ((crop.roi_mask > 0.5) & (crop.protect_mask < 0.5)
               & (cv2.dilate(zone.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0))
    key_f = cv2.GaussianBlur(cv2.dilate(key.astype(np.float32),
                                        np.ones((3, 3), np.float32)), (0, 0), 1.0)
    key_f = np.clip(key_f, 0, 1) * allowed

    kdil = np.ones((15, 15), np.uint8)
    clean = ctx["clean"]

    img = crop.bgr.astype(np.float32)
    low = cv2.GaussianBlur(img, (0, 0), sigmaX=max(2.0, fw / 30))
    high = img - low

    donor_high = quilt_high_field(crop.bgr, clean, fw)
    if donor_high is None:
        print(f"{name}: no donor patches")
        return None

    # Low-band edit weight: inside the GT zone only, feathered INWARD.
    wz = cv2.GaussianBlur(zone.astype(np.float32), (0, 0), 8.0)
    wz = wz * zone * (crop.roi_mask > 0.5) * (1 - crop.protect_mask)

    lab_low = cv2.cvtColor(np.clip(low, 0, 255) / 255.0, cv2.COLOR_BGR2Lab)
    lab_low[..., 0] *= 2.55
    lab_low[..., 1:] += 128.0
    skin = fit_skin_model(skin_reference_pixels(ctx["bgr"], ctx["det"].landmarks, fw))
    ref_ab = robust_chroma_ref(lab_low, clean, fw, skin.mean[1:])

    scope = np.clip(np.maximum(wz, key_f), 0, 1)[..., None]

    def compose(l_low_out: np.ndarray) -> np.ndarray:
        lab2 = lab_low.copy()
        lab2[..., 0] = l_low_out
        lab2[..., 1:] += (ref_ab - lab_low[..., 1:]) * wz[..., None]
        lab2[..., 0] /= 2.55
        lab2[..., 1:] -= 128.0
        low_out = cv2.cvtColor(lab2, cv2.COLOR_Lab2BGR) * 255.0
        high_out = high * (1 - key_f[..., None]) + donor_high * key_f[..., None]
        edited = low_out + high_out
        # Outside the edit scope the result is BYTE-IDENTICAL to the original:
        # the Lab round-trip's +-1 quantization must not leak into controls.
        blended = img * (1 - scope) + edited * scope
        return np.clip(blended, 0, 255).astype(np.uint8)

    b_img = compose(lab_low[..., 0])

    S, gate = shading_field(lab_low[..., 0], clean, zone, fw)
    dens = cv2.GaussianBlur(key.astype(np.float32), (0, 0), 0.05 * fw)
    dscale = float(np.percentile(dens[zone], 95)) if zone.any() else 0.0
    dens = np.clip(dens / max(dscale, 1e-4), 0, 1) if dscale > 1e-6 else dens * 0
    if S is not None and gate["gate"] == "full":
        lift = np.clip(S - lab_low[..., 0], 0, 12.0)
    else:
        sm = cv2.GaussianBlur(lab_low[..., 0], (0, 0), 0.10 * fw)
        lift = np.clip(sm - lab_low[..., 0], 0, 7.0)
    c_img = compose(lab_low[..., 0] + lift * dens * wz)

    a_img = run_stages(ctx)["medium"]

    # --- scoring (frozen strict candidates; key is NOT the gate) -------------
    out: dict = {"id": name, "gate": gate, "keyPx": int(key.sum()),
                 "keyPercentile": key_percentile,
                 "keyHash": hashlib.sha256(key.tobytes()).hexdigest()[:16],
                 "variants": {}}

    def jaw_gradient_change(res: np.ndarray) -> float:
        g0 = cv2.cvtColor(crop.bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
        g1 = cv2.cvtColor(res, cv2.COLOR_BGR2GRAY).astype(np.float32)
        s = 0.10 * fw

        def mag(g):
            m = cv2.GaussianBlur(g, (0, 0), s)
            gx = cv2.Sobel(m, cv2.CV_32F, 1, 0)
            gy = cv2.Sobel(m, cv2.CV_32F, 0, 1)
            return np.sqrt(gx * gx + gy * gy)

        a, b = mag(g0)[zone], mag(g1)[zone]
        return float((b.mean() - a.mean()) / max(a.mean(), 1e-6))

    yy, xx = np.mgrid[0:H, 0:W]
    for tag, res in (("A", a_img), ("B", b_img), ("C", c_img)):
        v = score_result(res, cands, ctx["thr"], fw)
        drift = []
        for c in ctrl:
            mm = (yy - c["y"]) ** 2 + (xx - c["x"]) ** 2 <= c["r"] ** 2
            d = np.abs(res.astype(np.int16) - crop.bgr.astype(np.int16))[mm]
            drift.append({"kind": c.get("kind", "?"),
                          "p95": float(np.percentile(d, 95)) if d.size else None})
        out["variants"][tag] = {
            "weightedQ90R": v.weightedQ90R, "survivalRate": v.survivalRate,
            "excessAreaRatio": v.excessAreaRatio,
            "jawGradChange": jaw_gradient_change(res),
            "controlDrift": drift}

    # --- blinded judgement panels (PNG, per-photo deterministic order) ------
    order = list("ABC")
    seed = int(hashlib.sha256(name.encode()).hexdigest(), 16) % (2**32)
    np.random.default_rng(seed).shuffle(order)
    imgs = {"A": a_img, "B": b_img, "C": c_img}
    zys, zxs = np.nonzero(zone)
    zy0, zy1 = int(zys.min()), int(zys.max())
    zx0, zx1 = int(zxs.min()), int(zxs.max())
    zym = (zy0 + zy1) // 2
    zxm = (zx0 + zx1) // 2
    regions = {
        "full": (0, H, 0, W),
        "upper": (max(zy0 - 10, 0), min(zym + 10, H), max(zx0 - 10, 0), min(zx1 + 10, W)),
        "lower_left": (max(zym - 10, 0), min(zy1 + 10, H), max(zx0 - 10, 0), zxm),
        "lower_right": (max(zym - 10, 0), min(zy1 + 10, H), zxm, min(zx1 + 10, W)),
    }
    pdir = OUT / "panels"
    pdir.mkdir(parents=True, exist_ok=True)
    for rname, (ry0, ry1, rx0, rx1) in regions.items():
        tiles = []
        for lbl, im in [("ORIG", crop.bgr)] + [(x, imgs[v]) for x, v in
                                               zip("XYZ", order)]:
            t = im[ry0:ry1, rx0:rx1]
            if rname != "full":
                t = cv2.resize(t, None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST)
            bar = np.full((30, t.shape[1], 3), 22, np.uint8)
            cv2.putText(bar, lbl, (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                        (255, 255, 255), 2)
            tiles.append(cv2.vconcat([bar, t]))
        cv2.imwrite(str(pdir / f"{name}_{rname}.png"), cv2.hconcat(tiles))
    out["blindOrder"] = {x: v for x, v in zip("XYZ", order)}
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("photos", nargs="+")
    ap.add_argument("--key-percentile", type=float, default=95.0)
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    pairs = {n: (p, g) for n, p, g in discover_pairs()}
    results = []
    for name in args.photos:
        if name not in pairs:
            print(f"unknown photo {name}")
            continue
        r = run_photo(name, *pairs[name], key_percentile=args.key_percentile)
        if r:
            results.append(r)
            pub = {k: v for k, v in r.items() if k != "blindOrder"}
            print(json.dumps(pub, indent=2))
    (OUT / "spike.json").write_text(json.dumps(results, indent=2))
    # The blind mapping lives in its own file; open it only AFTER the verdict.
    (OUT / "blind_mapping.json").write_text(json.dumps(
        {r["id"]: r["blindOrder"] for r in results}, indent=2))
    print(f"\npanels -> {OUT / 'panels'}   (X/Y/Z blinded; mapping sealed in "
          f"blind_mapping.json)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
