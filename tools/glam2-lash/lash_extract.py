#!/usr/bin/env python3
"""글램 2.0 속눈썹 추출기 — 비파괴 원칙 + 뿌리 펴기 + 기계 검증 내장.

세션에서 반복된 실수를 코드가 잡는다:
  · 상하반전 누락(2회)      → 방향 검사(뿌리 질량이 아래쪽인지)
  · 뿌리 아치 잔존           → 뿌리 곡선 피팅 + 수직 시프트 펴기(각도 보존)
  · 이중 불투명화            → 불투명화는 여기서 정확히 1회만
  · 종횡비 유실              → 사이드카 JSON에 기록 + 배수 제안
  · 털 잘림                  → 가장자리 잉크 검사
검사 실패 시 결과물을 내보내지 않는다(경고가 아니라 차단).

사용:
  python3 lash_extract.py fit      # 뿌리 곡선 피팅 → 육안 게이트 오버레이만 저장
  python3 lash_extract.py apply    # (게이트 승인 후) 펴기+추출+검증 → PNG/JSON 산출
산출: out/ 아래. Unity 반영은 별도 복사(사람 확인 후).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
REFS = REPO / "docs/unity-ar/glam2-refs"
OUT = Path(__file__).resolve().parent / "out"

# ── 소스 정의 (검증된 레시피의 크롭 박스 그대로) ──────────────────────────────
SOURCES = {
    "upper": dict(
        src=REFS / "속눈썹 샘플/다운로드.png",
        box=(565, 30, 1140, 290), flip=False, gap_frac=0.0,
        ann_dx=25),  # x0 590→565 잘림 방지(검증기 적발). 주석은 옛 박스 기준 → +25px 이동
    "lower": dict(
        src=REFS / "속눈썹 샘플/1a9bec9d78817015ce809bdc9b3d63a6.jpg",
        box=(5, 380, 1194, 1040), flip=True, gap_frac=0.40),
}
SUPER = 4          # 초해상 배수(안티앨리어스 보존)
ALPHA_FLOOR = 0.04
OPACIFY_LO, OPACIFY_HI = 0.14, 0.44  # (a-lo)/(hi-lo) — 여기서 1회만. 셰이더는 중립(0/1) 유지!
TARGET_W = 512


def load_alpha(cfg):
    """크롭 → 초해상 → 절대밝기 알파((bg-g)/(bg-ink)). 비파괴: 밀도보강·늘림 없음."""
    img = Image.open(cfg["src"]).convert("L").crop(cfg["box"])
    img = img.resize((img.width * SUPER, img.height * SUPER), Image.LANCZOS)
    g = np.asarray(img, dtype=np.float32)
    bg = np.percentile(g, 90)
    ink = np.percentile(g, 2)
    a = np.clip((bg - g) / max(bg - ink, 20.0), 0.0, 1.0)
    a[a < ALPHA_FLOOR] = 0.0
    if cfg["flip"]:
        a = a[::-1, :]  # 규약: 뿌리=텍스처 아랫줄(v0) — 아래 속눈썹 원본은 위가 뿌리
    return a


def fit_root_curve(a, q=0.95, deg=3):
    """열별 '가장 아래 잉크 y'를 모아 2차 곡선 피팅 — 뿌리 라인 추정.

    털 끝이 아래로 삐치는 노이즈를 피하려고 열별 하위 잉크 위치의 분위수 기반
    로버스트 피팅(2차 다항 + 잔차 2.5σ 컷 1회 재피팅)을 쓴다.
    """
    h, w = a.shape
    xs, ys = [], []
    for x in range(w):
        col = np.where(a[:, x] > 0.25)[0]
        if len(col) < 3:
            continue
        xs.append(x)
        ys.append(np.quantile(col, q))  # 아래쪽 잉크(뿌리 근처)
    xs = np.asarray(xs, dtype=np.float32)
    ys = np.asarray(ys, dtype=np.float32)
    if len(xs) < 20:
        raise SystemExit("FAIL: 뿌리 후보 픽셀 부족 — 크롭 박스/알파 임계 확인")
    for _ in range(2):
        c = np.polyfit(xs, ys, deg)
        r = ys - np.polyval(c, xs)
        keep = np.abs(r - r.mean()) < 2.5 * max(r.std(), 1e-3)
        xs, ys = xs[keep], ys[keep]
    return c, (xs, ys)


def save_fit_overlay(name, cfg, a, curve):
    """육안 게이트 산출물 — 원본 크롭 위에 피팅 곡선(빨강)·뿌리 후보(노랑) 표시."""
    h, w = a.shape
    rgb = np.stack([255 - a * 255] * 3, axis=-1).astype(np.uint8)
    xs = np.arange(w)
    ys = np.clip(np.polyval(curve, xs).astype(int), 0, h - 1)
    for dx in (-1, 0, 1):
        rgb[np.clip(ys + dx, 0, h - 1), xs] = [255, 40, 40]
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / f"gate-rootfit-{name}.png"
    Image.fromarray(rgb).resize((w // SUPER, h // SUPER), Image.LANCZOS).save(p)
    print(f"  게이트 오버레이 저장: {p}")


def load_user_rootline(name, a, curve, ann_dx=0):
    """게이트 이미지에 사용자가 굵은 빨간 펜으로 그린 뿌리선을 추출한다(정답지).

    내가 그린 얇은 피팅선은 동일 파라미터로 재계산해 ±4px 마스킹으로 제거하고,
    남은 빨간 픽셀(사용자 펜)을 열별 중앙값→보간→스무딩해 전해상도 뿌리선으로 만든다.
    스트로크가 없으면 None(피팅 곡선 사용).
    """
    p = OUT / f"gate-annotated-{name}.png"
    if not p.exists():
        p = OUT / f"gate-rootfit-{name}.png"
    if not p.exists():
        return None
    img = np.asarray(Image.open(p).convert("RGB"), dtype=np.int16)
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    red = (r > 140) & (r - g > 50) & (r - b > 50)
    h, w = red.shape
    xs = np.arange(w)
    # 저장 시 1/SUPER 축소된 좌표계 + 주석은 옛 크롭 기준(ann_dx 이동)
    my_y = np.polyval(curve, (xs + ann_dx) * SUPER) / SUPER
    stroke = red & (np.abs(np.arange(h)[:, None] - my_y[None, :]) > 4.0)
    if stroke.sum() < 50:
        return None
    ys = np.full(w, np.nan)
    for x in range(w):
        col = np.where(stroke[:, x])[0]
        if len(col):
            ys[x] = np.median(col)
    valid = ~np.isnan(ys)
    ys = np.interp(xs, xs[valid], ys[valid])          # 펜 끊김 보간(범위 밖은 끝값 유지)
    k = 15
    ys = np.convolve(np.pad(ys, k // 2, mode="edge"), np.ones(k) / k, mode="valid")[:w]
    print(f"  사용자 뿌리선 사용: {p.name} (열 {valid.sum()}/{w} 표시됨)")
    return np.interp(np.arange(a.shape[1]), xs * SUPER + ann_dx * SUPER, ys * SUPER)


def straighten(a, root_y):
    """뿌리 펴기 — 열별 수직 시프트, 소수점+선형 보간(정수 반올림 계단·지그재그 제거).

    회전 없음 = 털 각도 보존. 뿌리선 아래 잉크(처지는 꼬리 결)는 자르지 않고 전부
    보존한다 — 렌더러가 뿌리줄(rootV)을 눈 라인에 맞추고 그 아래를 눈 라인 밖으로
    그린다(리본 확장). 반환: (결과, 뿌리줄 y 인덱스).
    """
    h, w = a.shape
    base = float(root_y.max())
    pad = int(np.ceil((base - root_y).max())) + 1  # 아래로 밀려나는 내용 수용
    out = np.zeros((h + pad, w), dtype=np.float32)
    yy = np.arange(h + pad, dtype=np.float32)
    src = np.arange(h, dtype=np.float32)
    for x in range(w):
        s = base - root_y[x]
        out[:, x] = np.interp(yy - s, src, a[:, x], left=0.0, right=0.0)
    kept = out.sum() / max(a.sum(), 1e-6)
    print(f"  펴기(보간): 기준선 y={base:.1f}, 잉크 보존율 {kept * 100:.1f}%")
    return out, int(round(base))


def finalize(name, cfg, a, root_row):
    """bbox 크롭 → 비례 유지 다운스케일 → 앞쪽 페이드 → 불투명화(1회) → 검증 → 산출.

    root_row(뿌리줄 y)는 크롭·리사이즈를 따라 추적해 rootV(아랫변에서 뿌리까지의
    높이 비율)로 사이드카에 기록 — 렌더러가 이 줄을 눈 라인에 맞춘다.
    """
    ys, xs = np.where(a > 0.02)
    y0 = ys.min()
    a = a[y0: ys.max() + 1, xs.min(): xs.max() + 1]
    h, w = a.shape
    root_idx = int(np.clip(root_row - y0, 0, h - 1))
    tw, th = TARGET_W, max(8, round(h * TARGET_W / w))  # 종횡비 그대로(고정 캔버스 금지)
    a = np.asarray(Image.fromarray((a * 255).astype(np.uint8))
                   .resize((tw, th), Image.LANCZOS), dtype=np.float32) / 255.0
    r = int(np.clip(round((root_idx + 0.5) * th / h - 0.5), 0, th - 1))

    if cfg["gap_frac"] > 0:  # 아래 속눈썹 — 눈 앞쪽 구간 비움
        ramp = np.clip(np.linspace(0, 1, tw) / cfg["gap_frac"], 0, 1)
        a *= ramp[None, :]

    a = np.clip((a - OPACIFY_LO) / (OPACIFY_HI - OPACIFY_LO), 0, 1)  # 불투명화 — 유일한 1회
    a[r, :] = np.maximum(a[r, :], (a[r, :] > 0.15) * 0.6)             # 뿌리줄 앵커

    validate(name, cfg, a, r)

    OUT.mkdir(parents=True, exist_ok=True)
    rgba = np.zeros((th, tw, 4), dtype=np.uint8)
    rgba[..., 3] = (a * 255).astype(np.uint8)
    png = OUT / f"lash_glam_{name}.png"
    Image.fromarray(rgba).save(png)
    root_v = round((th - 1 - r) / th, 4)
    meta = dict(width=tw, height=th, aspect=round(th / tw, 4), rootV=root_v,
                note="장착 배수 = 원하는 (속눈썹높이/눈폭) ÷ aspect; rootV = 뿌리줄 높이 비율(아랫변 0)")
    (OUT / f"lash_glam_{name}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    print(f"  산출: {png}  {tw}x{th} aspect={meta['aspect']} rootV={root_v}")


def validate(name, cfg, a, r):
    """실수 차단 검사 — 하나라도 실패하면 산출하지 않는다. r = 뿌리줄 인덱스."""
    h, w = a.shape
    fails = []
    span = a.max(axis=0) > 0.2                       # 도안이 실제 차지하는 가로 구간
    lo = int(w * cfg["gap_frac"])                    # 의도된 앞쪽 공백은 제외
    root_row = a[max(0, r - 1): r + 2, :].max(axis=0) > 0.3
    cover = root_row[lo:][span[lo:]].mean() if span[lo:].any() else 0.0
    if cover < 0.55:
        fails.append(f"뿌리 정렬 부족: 아랫줄 잉크 커버 {cover:.2f} < 0.55 (펴기 실패?)")
    bot = a[int(h * 0.7):, :].mean()
    top = a[: int(h * 0.3), :].mean()
    if bot <= top:
        fails.append(f"방향 의심: 아래 질량({bot:.3f}) ≤ 위 질량({top:.3f}) — 상하반전 확인")
    for edge, m in (("좌", a[:, 0].max()), ("우", a[:, -1].max()), ("상", a[0, :].max())):
        if m > 0.5:
            fails.append(f"{edge}측 가장자리 잉크 {m:.2f} — 크롭이 털을 자름")
    if fails:
        for f in fails:
            print(f"  FAIL[{name}]: {f}")
        raise SystemExit(1)
    print(f"  검증 통과[{name}]: 뿌리커버 {cover:.2f}, 질량 하{bot:.3f}/상{top:.3f}")


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "fit"
    for name, cfg in SOURCES.items():
        print(f"[{name}] {cfg['src'].name}")
        a = load_alpha(cfg)
        curve, _ = fit_root_curve(a)
        if mode == "apply":
            user = load_user_rootline(name, a, curve, cfg.get("ann_dx", 0))
            root_y = user if user is not None else np.polyval(curve, np.arange(a.shape[1]))
            flat, root_row = straighten(a, root_y)
            finalize(name, cfg, flat, root_row)
        else:
            save_fit_overlay(name, cfg, a, curve)
    if mode != "apply":
        print("→ 오버레이 육안 승인 후 `apply`로 실행.")


if __name__ == "__main__":
    main()
