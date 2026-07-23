#!/usr/bin/env python3
"""아이섀도/아이라이너 디자인 마스크 패밀리 생성 (밴드-로컬 UV 공간 3종).

① 위 섀도(SHAPES → catalog/mask/eye_*.png, 256x256 그레이스케일):
  IrisRenderer.BuildEyeshadowBandUV / Eyeshadow.shader §16.
  u: 0=눈앞(좌) → 1=눈꼬리(우). 눈꼬리 밖 연장 구간은 우측 엣지 픽셀이
     클램프 샘플되므로, 우측 엣지 값 = 꼬리 밖 '옆' 워시 강도.
  v: 0=안검연(하단) → 1=눈썹(상단). PNG 하단 = lash 라인.

② 아래 섀도(LOWER_SHAPES → catalog/mask/under_*.png, 256x256 그레이스케일):
  LowerLid.shader _LowerSmokyMask(전 하부 룩 공용 실루엣, §16 하부 확장).
  u: 0=안쪽 눈머리(좌) → 1=바깥 눈꼬리(우). 연장 구간 없음.
  v: PNG "상단" = lash 라인(위 섀도와 반대 — 셰이더가 1-v 플립), 아래로 갈수록 볼 방향.
  세로 스트레치는 _LowerShadowHeight 축이 담당.

③ 아이라이너(LINERS → catalog/colorArt/liner_*.png, 512x160 RGBA 알파 라인 아트):
  EyelinerStyleRenderer 밴드 — u: 0=안쪽 눈머리 → 1=바깥 "윙 끝"(눈꼬리 밖 연장 포함,
  WingLenFactor 0.32 ≈ 우측 ~24%가 윙 캔버스). v: 0=lash(하단) → 1=위.
  알파=라인 모양, 색은 _LineColor 틴트(검정으로 그림). Resources/default_eyeliner.png와 동일 규격.

양 눈 공용 한 장(u=1이 해부학적 눈꼬리/윙) — 미러 불필요.
사용: python3 scripts/generate-eyeshadow-masks.py [이름 ...]  (무인자 = 전부)
"""

import math
import sys
from pathlib import Path

from PIL import Image

W = H = 256
OUT_DIR = (
    Path(__file__).resolve().parent.parent
    / "apps/unity/MakeupAR/Assets/StreamingAssets/catalog/mask"
)


def smoothstep(e0: float, e1: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3.0 - 2.0 * t)


def gauss(x: float, center: float, sigma: float) -> float:
    d = (x - center) / sigma
    return math.exp(-0.5 * d * d)


def base(u: float, v: float) -> float:
    """리드 전반 워시 — lash~20% 풀, 80% 소멸, 우측 엣지 0.45(옆 워시)."""
    vfall = 1.0 - smoothstep(0.20, 0.80, v)
    hin = smoothstep(0.0, 0.15, u)
    hout = 1.0 + (0.45 - 1.0) * smoothstep(0.85, 1.0, u)
    return vfall * hin * hout


def crease(u: float, v: float) -> float:
    """쌍꺼풀 라인 강조 — v 0.35~0.65 밴드, 바깥쪽으로 갈수록 살짝 진하게."""
    band = gauss(v, 0.50, 0.16)
    hin = smoothstep(0.0, 0.18, u)
    hout = 1.0 - smoothstep(0.92, 1.0, u)
    outer_gain = 0.75 + 0.25 * smoothstep(0.3, 0.9, u)
    return band * hin * hout * outer_gain


def outer(u: float, v: float) -> float:
    """아우터 C존 — 눈꼬리 아래쪽 뭉치, 우측 엣지 0.5 잔존(꼬리 밖 연결)."""
    blob = gauss(u, 0.85, 0.22) * gauss(v, 0.25, 0.28)
    edge_hold = 0.5 * smoothstep(0.9, 1.0, u) * (1.0 - smoothstep(0.2, 0.75, v))
    return min(1.0, blob + edge_hold)


def halo(u: float, v: float) -> float:
    """센터 할로 — 중앙 밝은 팝, 리드 하부 중심."""
    return gauss(u, 0.50, 0.20) * (1.0 - smoothstep(0.10, 0.70, v))


def wing(u: float, v: float) -> float:
    """윙 — u 0.55부터 꼬리로 갈수록 진해지고 위로 상승, 우측 엣지 0.8(꼬리 연장)."""
    ramp = smoothstep(0.55, 0.95, u)
    lift = 0.15 + 0.35 * smoothstep(0.55, 1.0, u)  # 밴드 중심 v가 꼬리로 갈수록 상승
    band = gauss(v, lift, 0.18)
    return ramp * band


def inner_pop(u: float, v: float) -> float:
    """이너 포인트 — 눈앞머리 작은 글로우."""
    return gauss(u, 0.08, 0.10) * gauss(v, 0.15, 0.18)


def tail_long(u: float, v: float) -> float:
    """눈꼬리 위주 롱 — u 0.45부터 꼬리로 진해지는 낮은 밴드, 우측 엣지 0.85(긴 옆 연장)."""
    ramp = smoothstep(0.45, 0.85, u)
    vfall = 1.0 - smoothstep(0.10, 0.55, v)
    return ramp * vfall


# ── "눈 주변 전부" 풀 커버 패밀리 — 위(eye_full_*)와 아래(under_full_*)가 쌍으로
#    설계됨. 같은 접미사끼리 함께 적용하면 눈 둘레 전체를 하나의 컨셉으로 덮는다. ──


def full_wash(u: float, v: float) -> float:
    """전체 워시(위) — 리드 전반 고르게, 꼬리 40% 잔존."""
    vfall = 1.0 - smoothstep(0.25, 0.85, v)
    hin = smoothstep(0.0, 0.12, u)
    hout = 1.0 + (0.4 - 1.0) * smoothstep(0.9, 1.0, u)
    return vfall * hin * hout


def full_smoky(u: float, v: float) -> float:
    """전체 스모키(위) — 높고 진하게, 바깥 가중, 꼬리 60% 잔존."""
    vfall = 1.0 - smoothstep(0.35, 0.95, v)
    outer_gain = 0.8 + 0.2 * smoothstep(0.4, 0.9, u)
    hin = smoothstep(0.0, 0.10, u)
    hout = 1.0 + (0.6 - 1.0) * smoothstep(0.92, 1.0, u)
    return vfall * outer_gain * hin * hout


def full_gradient(u: float, v: float) -> float:
    """전체 그라데(위) — lash에서 급격히 사라지는 세로 그라데, 전 폭."""
    return (1.0 - smoothstep(0.05, 0.60, v)) * smoothstep(0.0, 0.08, u)


def full_halo(u: float, v: float) -> float:
    """전체 할로(위) — 중앙 팝."""
    return gauss(u, 0.50, 0.24) * (1.0 - smoothstep(0.15, 0.75, v))


def full_tail(u: float, v: float) -> float:
    """전체 꼬리(위) — 꼬리 집중, 아래 under_full_tail과 만나 C존을 이룸."""
    ramp = smoothstep(0.35, 0.85, u)
    vfall = 1.0 - smoothstep(0.10, 0.60, v)
    return ramp * vfall


def outer_wide(u: float, v: float) -> float:
    """아우터 와이드 — 눈꼬리(>) 근처를 넓고 높게. 우측 엣지 0.75로 옆까지 이어짐."""
    blob = gauss(u, 0.85, 0.30) * (1.0 - smoothstep(0.15, 0.75, v))
    edge_hold = 0.75 * smoothstep(0.88, 1.0, u) * (1.0 - smoothstep(0.2, 0.7, v))
    return min(1.0, blob + edge_hold)


def full_wide(u: float, v: float) -> float:
    """전체 와이드(위) — 밴드 끝까지 높게, 꼬리 0.7 잔존. under_full_wide와 세트."""
    vfall = 1.0 - smoothstep(0.45, 1.0, v)
    hin = smoothstep(0.0, 0.08, u)
    hout = 1.0 + (0.7 - 1.0) * smoothstep(0.9, 1.0, u)
    return vfall * hin * hout


SHAPES = {
    "eye_base": base,
    "eye_crease": crease,
    "eye_outer": outer,
    "eye_halo": halo,
    "eye_wing": wing,
    "eye_inner_pop": inner_pop,
    "eye_tail_long": tail_long,
    "eye_full_wash": full_wash,
    "eye_full_smoky": full_smoky,
    "eye_full_gradient": full_gradient,
    "eye_full_halo": full_halo,
    "eye_full_tail": full_tail,
    "eye_outer_wide": outer_wide,
    "eye_full_wide": full_wide,
}


# ── ② 아래 섀도 (w = lash로부터의 깊이: 0=lash → 1=볼 방향 끝) ──────────────────


def under_wash(u: float, w: float) -> float:
    """아래 전반 워시 — lash 바로 밑 은은하게, 깊이 65%에서 소멸. eye_base와 세트."""
    wfall = 1.0 - smoothstep(0.10, 0.65, w)
    hin = smoothstep(0.0, 0.15, u)
    hout = 1.0 - smoothstep(0.88, 1.0, u)
    return 0.9 * wfall * hin * hout


def under_outer(u: float, w: float) -> float:
    """아래 바깥 스머지 — 바깥 1/3 뭉치. eye_outer와 세트."""
    return gauss(u, 0.80, 0.20) * (1.0 - smoothstep(0.05, 0.60, w))


def under_tail(u: float, w: float) -> float:
    """아래 꼬리 연결 — 바깥 끝에서 위 꼬리 워시와 만나도록 우측으로 갈수록 진해짐."""
    ramp = smoothstep(0.50, 0.95, u)
    wfall = 1.0 - smoothstep(0.05, 0.50, w)
    return ramp * wfall


def under_smoky_deep(u: float, w: float) -> float:
    """딥 스모키 언더 — 진하고 깊게, 바깥 가중."""
    wfall = 1.0 - smoothstep(0.20, 0.90, w)
    outer_gain = 0.75 + 0.25 * smoothstep(0.4, 0.9, u)
    hin = smoothstep(0.0, 0.10, u)
    hout = 1.0 - smoothstep(0.92, 1.0, u)
    return wfall * outer_gain * hin * hout


def under_slim(u: float, w: float) -> float:
    """슬림 언더 — lash 바로 밑 얇은 섀도 라인."""
    wfall = 1.0 - smoothstep(0.05, 0.28, w)
    hin = smoothstep(0.0, 0.12, u)
    hout = 1.0 - smoothstep(0.90, 1.0, u)
    return wfall * hin * hout


def under_center(u: float, w: float) -> float:
    """센터 언더 — 눈 밑 중앙(애교살 라인) 포인트."""
    return gauss(u, 0.50, 0.20) * (1.0 - smoothstep(0.05, 0.45, w))


# 풀 커버 패밀리의 아래짝 — 위 eye_full_*와 같은 접미사끼리 세트.


def under_full_wash(u: float, w: float) -> float:
    wfall = 1.0 - smoothstep(0.10, 0.60, w)
    return 0.9 * wfall * smoothstep(0.0, 0.12, u) * (1.0 - smoothstep(0.88, 1.0, u))


def under_full_smoky(u: float, w: float) -> float:
    wfall = 1.0 - smoothstep(0.15, 0.80, w)
    outer_gain = 0.75 + 0.25 * smoothstep(0.4, 0.9, u)
    return 0.95 * wfall * outer_gain * smoothstep(0.0, 0.10, u) * (1.0 - smoothstep(0.92, 1.0, u))


def under_full_gradient(u: float, w: float) -> float:
    return (1.0 - smoothstep(0.05, 0.50, w)) * smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.92, 1.0, u))


def under_full_halo(u: float, w: float) -> float:
    return gauss(u, 0.50, 0.24) * (1.0 - smoothstep(0.05, 0.55, w))


def under_full_tail(u: float, w: float) -> float:
    return smoothstep(0.45, 0.90, u) * (1.0 - smoothstep(0.05, 0.50, w))


def under_deep_wide(u: float, w: float) -> float:
    """딥 와이드 언더 — 밴드 바닥까지 넓게(더 아래로는 앱의 핏 높이 축으로 스트레치)."""
    wfall = 1.0 - smoothstep(0.55, 1.0, w)
    hin = smoothstep(0.0, 0.10, u)
    hout = 1.0 - smoothstep(0.90, 1.0, u)
    return wfall * hin * hout


def under_full_wide(u: float, w: float) -> float:
    """전체 와이드(아래) — eye_full_wide와 세트, 깊게 넓게."""
    wfall = 1.0 - smoothstep(0.50, 0.95, w)
    return wfall * smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.90, 1.0, u))


# ── 연장(§16b 와이드) — 가로 2:1(512x256) 마스크. U∈[0,2]: 좌측 절반=눈(0..1),
#    우측 절반=눈꼬리 밖 연장(1..2). Unity가 종횡비(2:1)로 자동 감지해 x=U/2로 샘플하고
#    연장 게이트를 개방한다 — 즉 연장 마감은 전적으로 마스크 몫이므로 모든 모양은
#    U≈1.9 전에 0으로 사라져야 한다(지오메트리 끝 2.0에서 하드컷 방지). ──


def ext_wing_sweep(U: float, v: float) -> float:
    """윙 스윕 — 리드 워시가 꼬리 밖으로 위로 쓸려 나가며 가늘어짐."""
    body = (1.0 - smoothstep(0.15, 0.70, v)) * smoothstep(0.0, 0.15, U) if U <= 1.0 else 0.0
    lift = 0.15 + 0.45 * smoothstep(0.9, 1.8, U)
    sweep = gauss(v, lift, 0.30 - 0.17 * smoothstep(0.9, 1.8, U)) \
        * smoothstep(0.55, 0.95, min(U, 1.0)) * (1.0 - smoothstep(1.45, 1.88, U))
    return min(1.0, (body if U <= 1.0 else 0.0) + sweep)


def ext_smoky_out(U: float, v: float) -> float:
    """스모키 아웃 — 아우터 스모키가 꼬리 밖까지 번지며 소멸."""
    ramp = smoothstep(0.35, 0.85, min(U, 1.0))
    out_fade = 1.0 - smoothstep(1.15, 1.80, U)
    vfall = 1.0 - smoothstep(0.20, 0.80, v)
    return ramp * out_fade * vfall


def ext_wash_long(U: float, v: float) -> float:
    """롱 워시 — 리드 전반 워시 + 꼬리 밖 낮은 롱 페이드."""
    vfall = 1.0 - smoothstep(0.20, 0.75, v)
    hin = smoothstep(0.0, 0.12, U)
    out_fade = 1.0 - smoothstep(1.30, 1.90, U)
    low_ext = 1.0 - 0.45 * smoothstep(1.0, 1.6, U)  # 연장부는 높이 낮게
    return vfall * hin * out_fade * (low_ext if v > 0.35 else 1.0) * (
        1.0 if U <= 1.0 else 1.0 - smoothstep(0.45, 0.75, v))


def ext_tail_streak(U: float, v: float) -> float:
    """테일 스트릭 — 속눈썹 연장선을 따라 가늘고 길게 뻗는 라인성 섀도."""
    band = gauss(v, 0.12, 0.11)
    ramp = smoothstep(0.50, 0.95, min(U, 1.0))
    out_fade = 1.0 - smoothstep(1.55, 1.92, U)
    return band * ramp * out_fade


EXT_SHAPES = {
    "ext_wing_sweep": ext_wing_sweep,
    "ext_smoky_out": ext_smoky_out,
    "ext_wash_long": ext_wash_long,
    "ext_tail_streak": ext_tail_streak,
}

EXT_W, EXT_H = 512, 256


LOWER_SHAPES = {
    "under_wash": under_wash,
    "under_outer": under_outer,
    "under_tail": under_tail,
    "under_smoky_deep": under_smoky_deep,
    "under_slim": under_slim,
    "under_center": under_center,
    "under_full_wash": under_full_wash,
    "under_full_smoky": under_full_smoky,
    "under_full_gradient": under_full_gradient,
    "under_full_halo": under_full_halo,
    "under_full_tail": under_full_tail,
    "under_deep_wide": under_deep_wide,
    "under_full_wide": under_full_wide,
}


# ── ③ 아이라이너 (알파 라인 아트, 512x160) ──────────────────────────────────────

LINER_W, LINER_H = 512, 160
WING_START = 0.72  # 이 u부터 윙 구간(눈꼬리 근처)


def _liner_alpha(u: float, v: float, base_th: float, tail_th: float,
                 wing_len: float, wing_rise: float,
                 edge0: float = 0.35, edge1: float = 0.5,
                 pre_lift: float = 0.0) -> float:
    """라인 커버리지 — 중심선 y_c(u)와 두께 t(u)의 부드러운 스트로크.

    base_th/tail_th: 눈머리/눈꼬리 두께(밴드 높이 비). wing_len: 윙이 뻗는 u 길이
    (WING_START부터, 끝은 뾰족). wing_rise: 윙 상승량(음수 = 퍼피, 내려감).
    edge0/edge1: 두께 대비 엣지 페더 구간 — 벌리면 번진(스머지) 라인.
    pre_lift: 윙 시작 전 중심선 사전 상승 — 드룹(음수 rise)이 밴드 하단(v=0)에서
    잘리지 않게 내려올 여유를 확보한다.
    """
    yc = 0.10 + pre_lift * smoothstep(0.40, WING_START, u)  # lash에 붙는 라인 중심
    th = base_th + (tail_th - base_th) * smoothstep(0.15, WING_START, u)
    if u > WING_START:
        p = (u - WING_START) / wing_len
        if p > 1.0:
            return 0.0
        yc += wing_rise * p
        th *= 1.0 - smoothstep(0.35, 1.0, p)  # 끝으로 갈수록 뾰족
    if th <= 1e-6:  # 윙 끝 테이퍼가 0에 도달(u=1) — 0나눗셈 가드
        return 0.0
    d = abs(v - yc)
    return 1.0 - smoothstep(th * edge0, th * edge1, d)


def liner_slim(u: float, v: float) -> float:
    return _liner_alpha(u, v, base_th=0.10, tail_th=0.16, wing_len=0.16, wing_rise=0.22)


def liner_bold(u: float, v: float) -> float:
    return _liner_alpha(u, v, base_th=0.16, tail_th=0.30, wing_len=0.26, wing_rise=0.34)


def liner_puppy(u: float, v: float) -> float:
    # 퍼피 — 꼬리가 살짝 내려가며 처지는 라인(내려간 윙)
    return _liner_alpha(u, v, base_th=0.12, tail_th=0.22, wing_len=0.20, wing_rise=-0.16)


def liner_cat(u: float, v: float) -> float:
    # 캣아이 — 가는 몸통에 길고 날카롭게 치켜올린 윙
    return _liner_alpha(u, v, base_th=0.09, tail_th=0.24, wing_len=0.30, wing_rise=0.48)


def liner_tight(u: float, v: float) -> float:
    # 타이트라인 — 가늘고 균일, 윙 거의 없음
    return _liner_alpha(u, v, base_th=0.07, tail_th=0.09, wing_len=0.06, wing_rise=0.08)


def liner_smudge(u: float, v: float) -> float:
    # 스머지 — 두껍고 경계가 넓게 번진 라인
    return _liner_alpha(u, v, base_th=0.22, tail_th=0.34, wing_len=0.20, wing_rise=0.2,
                        edge0=0.1, edge1=0.95)


def liner_long(u: float, v: float) -> float:
    # 롱 윙 — 윙 캔버스 끝(u=1)까지 꽉 채우는 긴 꼬리, 완만한 상승
    return _liner_alpha(u, v, base_th=0.11, tail_th=0.22, wing_len=0.28, wing_rise=0.30)


def liner_cat_long(u: float, v: float) -> float:
    # 롱 캣아이 — 끝까지 뻗으며 높이 치켜올림
    return _liner_alpha(u, v, base_th=0.09, tail_th=0.24, wing_len=0.28, wing_rise=0.55)


def liner_droop(u: float, v: float) -> float:
    # 드룹 — 꼬리가 뚜렷하게 아래로 처짐(퍼피보다 강하게). pre_lift는 lash에서 떠 보이지
    # 않는 선(0.06)까지만 — 하강 잔여분은 팁 테이퍼가 자연스럽게 마감한다.
    return _liner_alpha(u, v, base_th=0.12, tail_th=0.24, wing_len=0.20, wing_rise=-0.28,
                        pre_lift=0.06)


def liner_droop_long(u: float, v: float) -> float:
    # 롱 드룹 — 끝까지 길게 내려가는 꼬리
    return _liner_alpha(u, v, base_th=0.11, tail_th=0.22, wing_len=0.28, wing_rise=-0.32,
                        pre_lift=0.08)


LINERS = {
    "liner_slim": liner_slim,
    "liner_bold": liner_bold,
    "liner_puppy": liner_puppy,
    "liner_cat": liner_cat,
    "liner_tight": liner_tight,
    "liner_smudge": liner_smudge,
    "liner_long": liner_long,
    "liner_cat_long": liner_cat_long,
    "liner_droop": liner_droop,
    "liner_droop_long": liner_droop_long,
}

LINER_OUT_DIR = OUT_DIR.parent / "colorArt"


# ── ④ 부위별 하이라이터 (캐노니컬 얼굴 UV, setRegionMask region="highlighter") ────
# 좌표계: FaceMakeup 캐노니컬 UV — PNG 상단=이마. 기존 존 마스크 실측 앵커(2026-07-24):
#   눈 좌(0.354,0.341)/우(0.644,0.341) · 볼 좌(0.277,0.532)/우(0.722,0.532)
#   입술(0.5,0.692) · 얼굴 bbox y 0.13~0.83, x 0.12~0.88
# 모양을 캐노니컬 위치에 미리 그려 두므로 핏 핸들 없이 바로 해당 부위에 뜬다.
# (x, t) — t = PNG 상단부터의 세로 비율.


def _ell(x: float, t: float, cx: float, cy: float, sx: float, sy: float,
         rot: float = 0.0) -> float:
    """회전 타원 가우시안."""
    dx, dy = x - cx, t - cy
    c, s = math.cos(rot), math.sin(rot)
    rx, ry = dx * c + dy * s, -dx * s + dy * c
    return math.exp(-0.5 * ((rx / sx) ** 2 + (ry / sy) ** 2))


def _mirror(fn, x, t):
    """좌측 정의 모양을 우측에도 미러(캐노니컬은 한 장에 양쪽 모두 그림)."""
    return max(fn(x, t), fn(1.0 - x, t))


def high_cheekbone(x: float, t: float) -> float:
    """광대뼈 — 눈꼬리 아래에서 광대 위를 향하는 사선 슬리버(양측)."""
    return _mirror(lambda a, b: _ell(a, b, 0.265, 0.465, 0.075, 0.028, rot=-0.45), x, t)


def high_nose(x: float, t: float) -> float:
    """콧대 — 미간에서 코끝까지 세로 스트립 + 코끝 살짝 강조."""
    bridge = _ell(x, t, 0.5, 0.48, 0.022, 0.10)
    tip = 0.8 * _ell(x, t, 0.5, 0.615, 0.03, 0.022)
    return min(1.0, bridge + tip)


def high_forehead(x: float, t: float) -> float:
    """이마 중앙 — 넓고 부드러운 타원."""
    return _ell(x, t, 0.5, 0.235, 0.095, 0.055)


def high_browbone(x: float, t: float) -> float:
    """눈썹뼈 — 눈 위 아치(양측)."""
    return _mirror(lambda a, b: _ell(a, b, 0.36, 0.295, 0.06, 0.02, rot=-0.15), x, t)


def high_undereye(x: float, t: float) -> float:
    """눈밑 삼각 — 눈 아래를 밝히는 역삼각 소프트존(양측)."""
    return _mirror(
        lambda a, b: _ell(a, b, 0.35, 0.45, 0.055, 0.045)
        * (1.0 - smoothstep(0.50, 0.56, b)), x, t)


def high_chin(x: float, t: float) -> float:
    """턱끝 — 입술 아래 작은 타원."""
    return _ell(x, t, 0.5, 0.79, 0.045, 0.032)


def high_cupid(x: float, t: float) -> float:
    """큐피드 보우 — 윗입술산 위 미니 포인트."""
    return _ell(x, t, 0.5, 0.662, 0.028, 0.014)


CANON_HIGHLIGHTS = {
    "high_cheekbone": high_cheekbone,
    "high_nose": high_nose,
    "high_forehead": high_forehead,
    "high_browbone": high_browbone,
    "high_undereye": high_undereye,
    "high_chin": high_chin,
    "high_cupid": high_cupid,
}


def render(name: str) -> Path:
    if name in CANON_HIGHLIGHTS:
        # 캐노니컬 얼굴 UV — 앵커를 PNG 상단 기준으로 실측했으므로 플립 없음.
        fn = CANON_HIGHLIGHTS[name]
        img = Image.new("RGBA", (W, H))
        px = img.load()
        for y in range(H):
            t = y / (H - 1)
            for x in range(W):
                g = round(max(0.0, min(1.0, fn(x / (W - 1), t))) * 255.0)
                px[x, y] = (g, g, g, 255)
        out = OUT_DIR / f"{name}.png"
        img.save(out)
        return out
    if name in EXT_SHAPES:
        # 와이드(§16b) — 512x256, U = 가로비율×2. PNG 하단=lash(위 섀도와 동일).
        fn = EXT_SHAPES[name]
        img = Image.new("RGBA", (EXT_W, EXT_H))
        px = img.load()
        for y in range(EXT_H):
            v = (EXT_H - 1 - y) / (EXT_H - 1)
            for x in range(EXT_W):
                U = x / (EXT_W - 1) * 2.0
                g = round(max(0.0, min(1.0, fn(U, v))) * 255.0)
                px[x, y] = (g, g, g, 255)
        out = OUT_DIR / f"{name}.png"
        img.save(out)
        return out
    if name in SHAPES or name in LOWER_SHAPES:
        fn = SHAPES.get(name) or LOWER_SHAPES[name]
        lower = name in LOWER_SHAPES
        # RGBA로 저장 — 팀 기존 마스크(eye_smoky 등)와 동일 규약. 8비트 그레이(L)는
        # Unity LoadImage가 Alpha8로 디코드해 R채널이 비어 마스크가 무효가 된다.
        img = Image.new("RGBA", (W, H))
        px = img.load()
        for y in range(H):
            # 위 섀도: v=0이 PNG 하단(lash). 아래 섀도: w=0이 PNG 상단(lash).
            second = y / (H - 1) if lower else (H - 1 - y) / (H - 1)
            for x in range(W):
                u = x / (W - 1)
                g = round(max(0.0, min(1.0, fn(u, second))) * 255.0)
                px[x, y] = (g, g, g, 255)
        out = OUT_DIR / f"{name}.png"
    elif name in LINERS:
        fn = LINERS[name]
        img = Image.new("RGBA", (LINER_W, LINER_H), (0, 0, 0, 0))
        px = img.load()
        for y in range(LINER_H):
            v = (LINER_H - 1 - y) / (LINER_H - 1)  # v=0이 PNG 하단(lash)
            for x in range(LINER_W):
                u = x / (LINER_W - 1)
                a = round(max(0.0, min(1.0, fn(u, v))) * 255.0)
                px[x, y] = (16, 12, 12, a)  # 거의 검정 — 색은 런타임 _LineColor 틴트
        LINER_OUT_DIR.mkdir(parents=True, exist_ok=True)
        out = LINER_OUT_DIR / f"{name}.png"
    else:
        raise SystemExit(f"unknown shape: {name}")
    img.save(out)
    return out


def main() -> None:
    names = sys.argv[1:] or [
        *SHAPES, *EXT_SHAPES, *LOWER_SHAPES, *LINERS, *CANON_HIGHLIGHTS]
    for name in names:
        print(f"written: {render(name)}")


if __name__ == "__main__":
    main()
