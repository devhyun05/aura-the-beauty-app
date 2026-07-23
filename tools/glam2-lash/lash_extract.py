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
        box=(590, 30, 1140, 290), flip=False, gap_frac=0.0),
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


def straighten(a, curve):
    """뿌리 펴기 — 열별 '수직 시프트'만 사용(회전·기울임 없음 = 털 각도 완전 보존).

    각 열을 (피팅 뿌리 y → 공통 기준선)으로 아래 정렬. 예전 언롤의 각도 회전
    부작용('각도를 왜 멋대로 올렸어' 사고)이 원천적으로 없다.
    """
    h, w = a.shape
    xs = np.arange(w)
    root_y = np.polyval(curve, xs)
    base = root_y.max()  # 가장 낮은 뿌리를 기준선으로 — 전 열이 아래로만 이동
    out = np.zeros_like(a)
    for x in range(w):
        shift = int(round(base - root_y[x]))
        if shift <= 0:
            out[:, x] = a[:, x]
        else:
            out[shift:, x] = a[: h - shift, x]
    return out


def finalize(name, cfg, a):
    """bbox 크롭 → 비례 유지 다운스케일 → 앞쪽 페이드 → 불투명화(1회) → 검증 → 산출."""
    ys, xs = np.where(a > 0.02)
    a = a[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]
    h, w = a.shape
    tw, th = TARGET_W, max(8, round(h * TARGET_W / w))  # 종횡비 그대로(고정 캔버스 금지)
    a = np.asarray(Image.fromarray((a * 255).astype(np.uint8))
                   .resize((tw, th), Image.LANCZOS), dtype=np.float32) / 255.0

    if cfg["gap_frac"] > 0:  # 아래 속눈썹 — 눈 앞쪽 구간 비움
        ramp = np.clip(np.linspace(0, 1, tw) / cfg["gap_frac"], 0, 1)
        a *= ramp[None, :]

    a = np.clip((a - OPACIFY_LO) / (OPACIFY_HI - OPACIFY_LO), 0, 1)  # 불투명화 — 유일한 1회
    a[-1, :] = np.maximum(a[-1, :], (a[-1, :] > 0.15) * 0.6)          # 뿌리 앵커

    validate(name, cfg, a)

    OUT.mkdir(parents=True, exist_ok=True)
    rgba = np.zeros((th, tw, 4), dtype=np.uint8)
    rgba[..., 3] = (a * 255).astype(np.uint8)
    png = OUT / f"lash_glam_{name}.png"
    Image.fromarray(rgba).save(png)
    meta = dict(width=tw, height=th, aspect=round(th / tw, 4),
                note="장착 배수 = 원하는 (속눈썹높이/눈폭) ÷ aspect")
    (OUT / f"lash_glam_{name}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    print(f"  산출: {png}  {tw}x{th} aspect={meta['aspect']}")


def validate(name, cfg, a):
    """실수 차단 검사 — 하나라도 실패하면 산출하지 않는다."""
    h, w = a.shape
    fails = []
    span = a.max(axis=0) > 0.2                       # 도안이 실제 차지하는 가로 구간
    lo = int(w * cfg["gap_frac"])                    # 의도된 앞쪽 공백은 제외
    root_row = a[-3:, :].max(axis=0) > 0.3
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
        save_fit_overlay(name, cfg, a, curve)
        if mode == "apply":
            finalize(name, cfg, straighten(a, curve))
    if mode != "apply":
        print("→ 오버레이 육안 승인 후 `apply`로 실행.")


if __name__ == "__main__":
    main()
