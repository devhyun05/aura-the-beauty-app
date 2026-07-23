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
        ann_dx=25,   # x0 590→565 잘림 방지(검증기 적발). 주석은 옛 박스 기준 → +25px 이동
        tail_refit=0.55, pen_extend=True,  # 꼬리: 펜 끝(67%)부터 32° 연장(승인 초록선 0723)
        rot_scale=0.9,                     # 꼬리 세움 배율 — v14 100%는 과교정(솟구침)
        tail_align=True, front_shift=0.0,  # 우측 성긴 여백 크롭만. 통째 이동은 렌더러 슬라이드가 담당(텍스처 이동은 종횡비 축소 부작용)
        strand_trim=[(3, 0.7)],            # 눈꼬리에서 3번째 가닥 -30%(사용자 0723, 가위질)
        tip_trim={"tail": (0.4, 0.7), "front": (0.12, 0.75)},  # 기둥 테이퍼 대체(휨 방지)
        min_cover=0.45),                   # 꼬리 연장 구간 제외 후 재측정 기준
    "lower": dict(
        src=REFS / "속눈썹 샘플/1a9bec9d78817015ce809bdc9b3d63a6.jpg",
        box=(5, 380, 1194, 1040), flip=True, gap_frac=0.40,
        tail_refit=0.70,   # 꼬리(바깥 30%): 뿌리선을 승인 초록선(42° 직선 연장)으로 교정
        strand_trim=[(1, 0.6)],  # 바깥 끝 가닥 -40%(사용자 0723) — 렌더러 테이퍼 대체(휨 방지)
        min_cover=0.40),   # 성긴 스파이크 도안 — 뿌리줄 간격이 넓어 커버 하한 완화
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


def tail_extend_pen(a, root_y):
    """위 도안 꼬리 — 펜 끝부터 펜의 마지막 하강 방향으로 직선 연장(승인 초록선 0723).

    펜이 도안 끝 전(67%)에 끊겨 그 뒤가 수평 연장돼 있었고, 그 선이 큰 꼬리
    클러스터의 몸통을 관통(아래에서 겪은 뿌리·가닥 혼동과 동일). 펜 끝은 값이
    평평해지는 지점으로 검출, 기울기는 그 직전 6% 구간에서 측정(32°).
    """
    h, w = a.shape
    d = np.gradient(root_y)
    x0 = int(w * 0.55)
    flat = np.where(np.abs(d[x0:]) < 0.01)[0]
    x_end = x0 + flat[0] if len(flat) else int(w * 0.85)
    span = max(int(w * 0.06), 8)
    slope = (root_y[x_end - 5] - root_y[x_end - 5 - span]) / span
    xs = np.arange(w)
    out = root_y.copy()
    out[x_end:] = np.clip(root_y[x_end] + slope * (xs[x_end:] - x_end), 0, h - 1)
    print(f"  꼬리 펜연장(승인 초록선): x≥{x_end}/{w} 직선 {np.degrees(np.arctan(slope)):.0f}°")
    return out


def tail_band_refit(a, root_y, start_frac):
    """아래 도안 꼬리 교정 v2 — 밴드 신뢰 구간의 진행 방향으로 직선 연장.

    꼬리 끝쪽엔 밴드 자체가 없다(마지막 부착 이후는 자유 가닥). 잉크 기반 추정은
    2회 모두 실패 — 아래-분위수는 가닥 몸통 관통, 최상단 잉크(윗면)는 위층 가닥
    실루엣 오인(사용자 판정 0723 ×2). 그래서 잉크를 보지 않고, 신뢰 구간(start까지
    사용자 펜)의 기울기를 그대로 직선 연장한다 — 렌더러 꼬리 접선 탈출과 동일 원리.
    그 오른쪽 가닥은 전부 '뿌리선 아래 내용'이 되어 리본이 눈꼬리 밖으로 눕혀 그린다.
    """
    h, w = a.shape
    x0 = int(w * start_frac)
    # 기울기 = 사용자 펜의 하강 구간(x0~펜 끝) 방향(42°, 사용자 승인 0723 '초록선').
    # 완만 구간(65~70%) 기울기(18°)는 부착 대각선보다 얕아 기각. 펜 끝은 값이
    # 평평해지는 지점(수평 연장 시작)으로 검출.
    d = np.gradient(root_y)
    flat = np.where(np.abs(d[x0:]) < 0.01)[0]
    x_end = x0 + flat[0] if len(flat) else int(w * 0.85)
    slope = (root_y[x_end - 5] - root_y[x0]) / max(x_end - 5 - x0, 1)
    xs = np.arange(w)
    out = root_y.copy()
    out[x0:] = np.clip(root_y[x0] + slope * (xs[x0:] - x0), 0, h - 1)
    print(f"  꼬리 재피팅(승인 초록선): x≥{start_frac:.0%} 직선 연장 {np.degrees(np.arctan(slope)):.0f}°")
    return out


def hybrid_flatten(a, root_y, start_frac, rot_scale=1.0):
    """shift+꼬리 국소 회전 하이브리드(승인 0723) — '미끄럼틀과 막대기' 문제 해결.

    수직 시프트는 절대각을 보존해, 42° 밴드에 나란히 눕던 꼬리 가닥이 펴는 순간
    밴드에서 42° 뻗치는 자세로 변조된다(꼬리로 갈수록 길어져 보임 — 사용자 판정).
    각 열의 샘플 광선을 수직(=shift)에서 밴드 법선(=국소 회전)으로 블렌드:
    start 이전 blend 0 → 중앙 무변화, 꼬리에서 1 → 가닥이 밴드와 함께 회전.
    전면 언롤과 달리 영향 범위가 승인 초록선 구간과 일치한다.
    """
    h, w = a.shape
    k = 121
    ry = np.convolve(np.pad(root_y, k // 2, mode="edge"), np.ones(k) / k, mode="valid")[:w]
    dy = np.gradient(ry)
    tx = 1.0 / np.sqrt(1.0 + dy * dy)
    ty_ = dy * tx
    nx, ny = -ty_, tx
    fl = ny > 0
    nx = np.where(fl, -nx, nx)
    ny = np.where(fl, -ny, ny)                    # '위(y 감소)' 정렬
    # 회전 전환 위치·폭(0723 수정): 넓은 램프(15%)는 긴 가닥 하나에 걸쳐 차등 회전
    # → 가닥 곡률을 상쇄해 일자로 폄(사용자 판정 '마지막 가닥 부자연'). 가닥 사이
    # 틈(주변 5% 창에서 잉크 최소 열)을 찾아 2.5% 폭으로 짧게 전환 — 어떤 가닥도
    # 전환 구간에 걸치지 않게 해 통째 균일 회전(곡률 보존).
    x0 = int(w * start_frac)
    win = max(int(w * 0.05), 4)
    seg = a[:, max(x0 - win, 0): x0 + win].sum(axis=0)
    x_gap = max(x0 - win, 0) + int(np.argmin(seg))
    # rot_scale: 회전 상한 다이얼(0=시프트, 1=밴드 기울기 100%). v14 과교정(전부 기립,
    # 늘어지는 꼬리 성격 소실 — 사용자 판정)의 절충용. 위 도안은 부분 세움을 쓴다.
    blend = np.clip((np.arange(w) - x_gap) / max(w * 0.025, 2.0), 0, 1) * rot_scale
    print(f"  회전 전환: 틈 x={x_gap}/{w}, 램프 2.5%, 회전 배율 {rot_scale:.0%}")
    rx = nx * blend
    ryv = -1.0 * (1 - blend) + ny * blend         # 수직↔법선 블렌드
    norm = np.sqrt(rx * rx + ryv * ryv)
    rx /= norm
    ryv /= norm
    kup = int(np.max(ry)) + 2
    kdn = int(h - np.min(ry)) + 2
    ks = np.arange(-kdn, kup + 1)
    px = np.arange(w)[None, :] + rx[None, :] * ks[:, None]
    py = ry[None, :] + ryv[None, :] * ks[:, None]
    x0i = np.floor(px).astype(int)
    y0i = np.floor(py).astype(int)
    fx = (px - x0i).astype(np.float32)
    fy = (py - y0i).astype(np.float32)

    def g(yy, xx):
        valid = (xx >= 0) & (xx < w) & (yy >= 0) & (yy < h)
        o = np.zeros(px.shape, dtype=np.float32)
        o[valid] = a[yy[valid], xx[valid]]
        return o

    v = (g(y0i, x0i) * (1 - fx) * (1 - fy) + g(y0i, x0i + 1) * fx * (1 - fy)
         + g(y0i + 1, x0i) * (1 - fx) * fy + g(y0i + 1, x0i + 1) * fx * fy)
    out = v[::-1, :]
    ang = np.degrees(np.arctan(np.abs(dy)))
    print(f"  하이브리드 펴기: 꼬리 회전 최대 {ang[x0:].max():.0f}°, 중앙 무변화(blend 0)")
    return out, kup


def unroll(a, root_y):
    """곡선 언롤 — 뿌리 곡선을 따라 '굴려서' 편다(수직 시프트의 승격판).

    각 출력 열은 뿌리 곡선 위의 호길이 등간격 점에서 곡선의 법선 방향으로 샘플링.
    보존되는 것 = 가닥의 밴드 대비 상대 각도(장착 시 눈 곡선이 되돌려 회전 →
    꼬리 가닥도 눈 흐름을 타고 자연스럽게 돎). 수직 시프트의 절대각 보존은
    "휜 밴드에 눕던 꼬리 가닥"을 수평 뻗침으로 만들었음(사용자 판정 0723 v10).
    반환: (결과, 뿌리줄 y 인덱스).
    """
    h, w = a.shape
    # 접선 안정화 — 뿌리선을 넓게 스무딩해 미세 요철이 회전 지터로 증폭되는 것 방지
    k = 121
    ry = np.convolve(np.pad(root_y, k // 2, mode="edge"), np.ones(k) / k, mode="valid")[:w]
    dy = np.gradient(ry)
    ds = np.sqrt(1.0 + dy * dy)
    s = np.concatenate([[0.0], np.cumsum(ds)])[:w]  # 각 x의 호길이
    W = int(round(s[-1]))
    sj = np.linspace(0.0, s[-1], W)
    X = np.interp(sj, s, np.arange(w, dtype=np.float64))
    Y = np.interp(X, np.arange(w), ry)
    d_ = np.interp(X, np.arange(w), dy)
    tx = 1.0 / np.sqrt(1.0 + d_ * d_)
    ty = d_ * tx
    nx, ny = -ty, tx
    flip = ny > 0                     # '위(y 감소)' 방향으로 부호 정렬
    nx = np.where(flip, -nx, nx)
    ny = np.where(flip, -ny, ny)
    kup = int(np.max(ry)) + 2         # 뿌리 위(털 방향) 샘플 범위
    kdn = int(h - np.min(ry)) + 2     # 뿌리 아래(처지는 결) 범위
    ks = np.arange(-kdn, kup + 1)
    px = X[None, :] + nx[None, :] * ks[:, None]
    py = Y[None, :] + ny[None, :] * ks[:, None]
    x0 = np.floor(px).astype(int)
    y0 = np.floor(py).astype(int)
    fx = (px - x0).astype(np.float32)
    fy = (py - y0).astype(np.float32)

    def g(yy, xx):
        valid = (xx >= 0) & (xx < w) & (yy >= 0) & (yy < h)
        o = np.zeros(px.shape, dtype=np.float32)
        o[valid] = a[yy[valid], xx[valid]]
        return o

    v = (g(y0, x0) * (1 - fx) * (1 - fy) + g(y0, x0 + 1) * fx * (1 - fy)
         + g(y0 + 1, x0) * (1 - fx) * fy + g(y0 + 1, x0 + 1) * fx * fy)
    out = v[::-1, :]                  # 행 0 = 최상단, 뿌리줄 = kup행
    ang = np.degrees(np.arctan(np.abs(dy)))
    print(f"  언롤: 폭 {w}→{W}(호길이), 밴드 기울기 최대 {ang.max():.0f}° 중앙값 {np.median(ang):.0f}°")
    return out, kup


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


def trim_heights(a, r, cfg):
    """길이 다듬기 v2 — '가위질'(높이 상한선 위 지우기, 부드러운 페이드 컷).

    v1(세로 압축)과 기둥 테이퍼는 배율이 구간별로 달라 걸친 가닥을 휘게 만들었다
    (사용자 판정 0723 — 코드 주석의 '차등 길이 → 계단' 교훈 재위반). 지우기는
    끝만 잘리고 몸통은 무변형. 스케일 프로파일 S(x) = 꼬리 램프 × 앞머리 램프 ×
    표적 가닥 딥(사인 창으로 경계 매끈)을 합성해 상한선을 만든다.
    """
    h, w = a.shape
    hprof = np.zeros(w)
    for x in range(w):
        col = np.where(a[:max(r, 1), x] > 0.25)[0]
        hprof[x] = (r - col.min()) if len(col) else 0
    k = 15
    hs = np.convolve(np.pad(hprof, k // 2, mode="edge"), np.ones(k) / k, mode="valid")[:w]

    S = np.ones(w)
    tt = cfg.get("tip_trim", {})
    if "tail" in tt:   # 오른쪽(꼬리) 구간 1→min 램프
        frac, mn = tt["tail"]
        x0 = int(w * (1 - frac))
        S[x0:] *= np.linspace(1, mn, w - x0)
    if "front" in tt:  # 왼쪽(앞머리) 구간 min→1 램프
        frac, mn = tt["front"]
        x1 = max(int(w * frac), 1)
        S[:x1] *= np.linspace(mn, 1, x1)
    # 표적 가닥(오른쪽 n번째 봉우리) — 사인 창 딥(경계 1, 중심 scale)
    trims = cfg.get("strand_trim", [])
    if trims:
        peaks = [x for x in range(12, w - 12)
                 if hs[x] == hs[x - 12:x + 13].max() and hs[x] > 0.45 * hs.max()]
        merged = []
        for x in sorted(peaks, reverse=True):
            if not merged or merged[-1] - x >= 15:
                merged.append(x)
        for nth, scale in trims:
            if nth > len(merged):
                print(f"  경고: 봉우리 {len(merged)}개뿐 — {nth}번째 트림 생략")
                continue
            p = merged[nth - 1]
            lo, hi = p, p
            while lo > 0 and hs[lo] > 0.55 * hs[p]:
                lo -= 1
            while hi < w - 1 and hs[hi] > 0.55 * hs[p]:
                hi += 1
            t = (np.arange(lo, hi + 1) - lo) / max(hi - lo, 1)
            S[lo:hi + 1] *= 1 - (1 - scale) * np.sin(np.pi * t)
            print(f"  가닥 컷: 오른쪽 {nth}번째 봉우리 x[{lo}:{hi}] 상한 ×{scale}")
    if np.all(S >= 0.999):
        return a
    # 상한선 위 지우기(페이드 폭 = 높이의 10%)
    ys = np.arange(h, dtype=np.float32)[:, None]
    cut = r - (S * hs)[None, :]
    fade = np.maximum(hs * 0.10, 2.0)[None, :]
    return a * np.clip((ys - cut) / fade, 0, 1)


def finalize(name, cfg, a, root_row):
    """bbox 크롭 → 비례 유지 다운스케일 → 앞쪽 페이드 → 불투명화(1회) → 검증 → 산출.

    root_row(뿌리줄 y)는 크롭·리사이즈를 따라 추적해 rootV(아랫변에서 뿌리까지의
    높이 비율)로 사이드카에 기록 — 렌더러가 이 줄을 눈 라인에 맞춘다.
    """
    ys, xs = np.where(a > 0.02)
    y0 = ys.min()
    a = a[y0: ys.max() + 1, xs.min(): xs.max() + 1]
    # 꼬리 정렬+통째 이동(사용자 0723): ①오른쪽 성긴 여백 크롭 — 진한 꼬리 클러스터가
    # u=1(=연장 레일 끝)에 정렬돼 연장 구간에 실제 내용이 실린다(v17 무연장·v18 스미어의
    # 공통 원인 제거) ②왼쪽 투명 패드 — 내용 전체를 꼬리 쪽으로 이동(앞머리 공백은
    # 아이라인이 커버, 사용자 승인).
    if cfg.get("tail_align"):
        strong = np.where(a.max(axis=0) > 0.35)[0]
        if len(strong):
            a = a[:, : strong[-1] + 2]
        pad = int(a.shape[1] * cfg.get("front_shift", 0.0))
        if pad > 0:
            a = np.concatenate([np.zeros((a.shape[0], pad), a.dtype), a], axis=1)
        print(f"  꼬리 정렬: 우측 성긴 여백 크롭 + 좌측 이동 패드 {pad}px")
    h, w = a.shape
    root_idx = int(np.clip(root_row - y0, 0, h - 1))
    tw, th = TARGET_W, max(8, round(h * TARGET_W / w))  # 종횡비 그대로(고정 캔버스 금지)
    a = np.asarray(Image.fromarray((a * 255).astype(np.uint8))
                   .resize((tw, th), Image.LANCZOS), dtype=np.float32) / 255.0
    r = int(np.clip(round((root_idx + 0.5) * th / h - 0.5), 0, th - 1))

    if cfg["gap_frac"] > 0:  # 아래 속눈썹 — 눈 앞쪽 구간 비움
        ramp = np.clip(np.linspace(0, 1, tw) / cfg["gap_frac"], 0, 1)
        a *= ramp[None, :]

    if cfg.get("strand_trim") or cfg.get("tip_trim"):
        a = trim_heights(a, r, cfg)

    # 결(농도) 채널 — 불투명화 '전'의 잉크 농도를 정규화해 RGB에 베이크(0723 승인).
    # 알파=윤곽(가시성 철벽), R=농도(한올 결). 셰이더 _GrainAmt가 반영량을 조절:
    # 0=현 실루엣(하위호환), 1=원본 농담 전부. 95퍼센타일 정규화라 최진 부분은 1 유지.
    ink = a[a > 0.05]
    dens_hi = np.percentile(ink, 95) if ink.size else 1.0
    dens = np.clip(a / max(dens_hi, 1e-3), 0, 1)

    a = np.clip((a - OPACIFY_LO) / (OPACIFY_HI - OPACIFY_LO), 0, 1)  # 불투명화 — 유일한 1회
    a[r, :] = np.maximum(a[r, :], (a[r, :] > 0.15) * 0.6)             # 뿌리줄 앵커

    validate(name, cfg, a, r)

    OUT.mkdir(parents=True, exist_ok=True)
    rgba = np.zeros((th, tw, 4), dtype=np.uint8)
    d8 = (dens * 255).astype(np.uint8)
    rgba[..., 0] = d8
    rgba[..., 1] = d8
    rgba[..., 2] = d8
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
    hi = int(w * cfg.get("tail_refit", 1.0))         # 꼬리 연장 구간(밴드 없음)도 제외
    root_row = a[max(0, r - 1): r + 2, :].max(axis=0) > 0.3
    sel = span[lo:hi]
    cover = root_row[lo:hi][sel].mean() if sel.any() else 0.0
    # 기준은 도안 소유 — 성긴 스파이크 도안(lower)은 뿌리줄에 간격이 많아 커버가
    # 원래 낮다. 이전 0.60~0.76은 꼬리 가닥 몸통이 뿌리줄을 가로지르며 부풀린 값
    # (뿌리·가닥 혼동의 부산물)이었음이 0723 교정에서 드러남.
    min_cover = cfg.get("min_cover", 0.55)
    if cover < min_cover:
        fails.append(f"뿌리 정렬 부족: 아랫줄 잉크 커버 {cover:.2f} < {min_cover} (펴기 실패?)")
    bot = a[int(h * 0.7):, :].mean()
    top = a[: int(h * 0.3), :].mean()
    if bot <= top:
        fails.append(f"방향 의심: 아래 질량({bot:.3f}) ≤ 위 질량({top:.3f}) — 상하반전 확인")
    # 우측 검사는 tail_align(꼬리를 u=1에 정렬 — 의도적으로 끝에 잉크) 시 면제
    edges = [("좌", a[:, 0].max()), ("상", a[0, :].max())]
    if not cfg.get("tail_align"):
        edges.append(("우", a[:, -1].max()))
    for edge, m in edges:
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
            if cfg.get("pen_extend"):
                root_y = tail_extend_pen(a, root_y)      # 위: 펜 끝부터 32° 연장
            elif cfg.get("tail_refit"):
                root_y = tail_band_refit(a, root_y, cfg["tail_refit"])  # 아래: 70%부터 42°
            if cfg.get("tail_refit"):
                # 꼬리 국소 회전(승인 0723) — 중앙은 shift와 동일, 꼬리만 밴드와 함께 회전
                flat, root_row = hybrid_flatten(
                    a, root_y, cfg["tail_refit"], cfg.get("rot_scale", 1.0))
            else:
                # 전면 언롤은 기각(사용자 0723) → shift 유지
                flat, root_row = straighten(a, root_y)
            finalize(name, cfg, flat, root_row)
        else:
            save_fit_overlay(name, cfg, a, curve)
    if mode != "apply":
        print("→ 오버레이 육안 승인 후 `apply`로 실행.")


if __name__ == "__main__":
    main()
