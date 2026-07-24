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
    hin = smoothstep(0.0, 0.22, u)
    hout = 1.0 + (0.30 - 1.0) * smoothstep(0.62, 1.0, u)
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


# 좌우 페더 ≥18%·꼬리 잔존 ≤0.40 — 좁은 페더·높은 잔존은 눈꼬리에 컷크리즈처럼
# 경계가 찍힌다(실기기 2026-07-24). 우측 엣지 값 = 꼬리 밖 연장 워시 강도(§16 관례 유지).
# ── "눈 주변 전부" 풀 커버 패밀리 — 위(eye_full_*)와 아래(under_full_*)가 쌍으로
#    설계됨. 같은 접미사끼리 함께 적용하면 눈 둘레 전체를 하나의 컨셉으로 덮는다. ──


def full_wash(u: float, v: float) -> float:
    """전체 워시(위) — 리드 전반 고르게, 꼬리 40% 잔존."""
    vfall = 1.0 - smoothstep(0.25, 0.85, v)
    hin = smoothstep(0.0, 0.20, u)
    hout = 1.0 + (0.28 - 1.0) * smoothstep(0.62, 1.0, u)
    return vfall * hin * hout


def full_smoky(u: float, v: float) -> float:
    """전체 스모키(위) — 높고 진하게, 바깥 가중, 꼬리 60% 잔존."""
    vfall = 1.0 - smoothstep(0.35, 0.95, v)
    outer_gain = 0.8 + 0.2 * smoothstep(0.4, 0.9, u)
    hin = smoothstep(0.0, 0.20, u)
    hout = 1.0 + (0.35 - 1.0) * smoothstep(0.60, 1.0, u)
    return vfall * outer_gain * hin * hout


def full_gradient(u: float, v: float) -> float:
    """전체 그라데(위) — lash에서 급격히 사라지는 세로 그라데, 전 폭."""
    return (1.0 - smoothstep(0.05, 0.60, v)) * smoothstep(0.0, 0.18, u) \
        * (1.0 + (0.35 - 1.0) * smoothstep(0.62, 1.0, u))


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
    edge_hold = 0.40 * smoothstep(0.68, 1.0, u) * (1.0 - smoothstep(0.2, 0.7, v))
    return min(1.0, blob + edge_hold)


def full_wide(u: float, v: float) -> float:
    """전체 와이드(위) — 밴드 끝까지 높게, 꼬리 0.7 잔존. under_full_wide와 세트."""
    vfall = 1.0 - smoothstep(0.45, 1.0, v)
    hin = smoothstep(0.0, 0.18, u)
    hout = 1.0 + (0.40 - 1.0) * smoothstep(0.62, 1.0, u)
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
# 초승달 계약(2026-07-24 전면 재설계): 구판은 "일정 깊이 플랫 + 좌우 좁은 페더"라
# 밴드 캔버스가 그대로 비치는 사각 슬래브였다(실기기 "네모" 회귀의 마스크측 원인).
# 실제 언더 섀도는 lash 곡선을 따라 얇게 붙고 양끝에서 깊이 자체가 0으로 수렴하는
# 초승달이다 — 세기 페더가 아니라 깊이 프로파일 D(u)로 테이퍼한다.
#   coverage = topG(w) · V(w / D(u)) · I(u)
#   D(u): 눈 가로 위치별 최대 깊이(양끝 0 수렴), V: 로컬 깊이 대비 소프트 감쇠
#   (35%까지 풀 → 100%에서 0, 플랫 구간 없음), I(u): 끝단 세기 마감.
# 우측 엣지 잔존은 꼬리 계열(under_tail/under_full_tail)만 — 연장 캔버스(along>1)
# 클램프 샘플이 "꼬리 밖 워시"로 쓰는 관례(상부 §16과 동일).


def _arch(u: float) -> float:
    """양끝 0 수렴 아치(0..1). sin은 u=1에서 -0 진동 → max 클램프(NaN 함정 방어)."""
    return max(0.0, math.sin(math.pi * max(0.0, min(1.0, u))))


def _crescent(u: float, w: float, depth: float, intensity: float = 1.0,
              hold_right: bool = False) -> float:
    """초승달 코어 — depth=이 u에서의 최대 깊이. hold_right=꼬리 워시 우측 보존."""
    if depth <= 1e-4:
        return 0.0
    x = w / depth
    v = 1.0 - smoothstep(0.35, 1.0, x)
    top = smoothstep(0.0, 0.04, w) if w < 0.04 else 1.0  # lash 밀착(미세 소프트만)
    end = 1.0 if hold_right else (1.0 - smoothstep(0.965, 1.0, u))
    return intensity * v * top * smoothstep(0.0, 0.035, u) * end


def under_wash(u: float, w: float) -> float:
    """아래 전반 워시 — lash 따라 얇은 초승달, 중앙~바깥 살짝 깊게."""
    d = 0.34 * _arch(u) ** 0.6 * (0.85 + 0.15 * smoothstep(0.3, 0.8, u))
    return _crescent(u, w, d, 0.88)


def under_outer(u: float, w: float) -> float:
    """아래 바깥 스머지 — 바깥 1/3 뭉치, 안쪽으로 얇게 소멸."""
    d = 0.46 * smoothstep(0.35, 0.80, u) * (1.0 - smoothstep(0.90, 1.0, u))
    return _crescent(u, w, d, 0.95)


def under_tail(u: float, w: float) -> float:
    """아래 꼬리 연결 — 꼬리로 갈수록 깊어지며 우측 워시 잔존(연장 캔버스행)."""
    d = 0.42 * smoothstep(0.45, 0.92, u)
    return _crescent(u, w, d, 0.95, hold_right=True)


def under_smoky_deep(u: float, w: float) -> float:
    """딥 스모키 언더 — 깊은 초승달, 바깥 가중."""
    d = 0.62 * _arch(u) ** 0.45 * (0.8 + 0.2 * smoothstep(0.35, 0.9, u))
    return _crescent(u, w, d, 0.95)


def under_slim(u: float, w: float) -> float:
    """슬림 언더 — lash 바로 밑 얇은 섀도 라인(초승달 최소 깊이)."""
    d = 0.17 * _arch(u) ** 0.4
    return _crescent(u, w, d)


def under_center(u: float, w: float) -> float:
    """센터 언더 — 눈 밑 중앙(애교살 라인) 포인트."""
    d = 0.40 * gauss(u, 0.50, 0.22)
    return _crescent(u, w, d)


# 풀 커버 패밀리의 아래짝 — 위 eye_full_*와 같은 접미사끼리 세트. 전부 초승달
# 계약: "풀"은 좌우 커버 범위가 넓다는 뜻이지 깊이 플랫 슬래브가 아니다.


def under_full_wash(u: float, w: float) -> float:
    d = 0.40 * _arch(u) ** 0.5
    return _crescent(u, w, d, 0.9)


def under_full_smoky(u: float, w: float) -> float:
    d = 0.58 * _arch(u) ** 0.4 * (0.8 + 0.2 * smoothstep(0.35, 0.9, u))
    return _crescent(u, w, d, 0.95)


def under_full_gradient(u: float, w: float) -> float:
    d = 0.46 * _arch(u) ** 0.5
    return _crescent(u, w, d)


def under_full_halo(u: float, w: float) -> float:
    d = 0.50 * gauss(u, 0.50, 0.26)
    return _crescent(u, w, d)


def under_full_tail(u: float, w: float) -> float:
    d = 0.44 * smoothstep(0.40, 0.88, u)
    return _crescent(u, w, d, 1.0, hold_right=True)


def under_deep_wide(u: float, w: float) -> float:
    """딥 와이드 언더 — 깊고 넓은 초승달(더 아래로는 앱의 핏 높이 축으로 스트레치)."""
    d = 0.80 * _arch(u) ** 0.35
    return _crescent(u, w, d, 0.95)


def under_full_wide(u: float, w: float) -> float:
    """전체 와이드(아래) — eye_full_wide와 세트. 깊지만 양끝은 반드시 수렴."""
    d = 0.72 * _arch(u) ** 0.4
    return _crescent(u, w, d, 0.95)


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


# ── ②b 하부 프로파일 아틀라스 (LowerLid.shader _LowerProfileAtlas) ───────────────
# 절차 LowerEsProfile(smoothstep 12종) 폐기의 대체물 — eyeshadowShape 0..11이
# 4×3 타일(각 256×256, 행우선: row=p//4, col=p%4)로 구워진다. 타일 좌표계는
# under_*와 동일(u=눈머리0→눈꼬리1, w=lash0→볼1, PNG 상단=lash — 셰이더 1-v 플립).
# 실루엣은 카탈로그 under_* 함수를 재사용해 카탈로그 마스크와 룩이 일치한다.
#
# 클로저 계약: 전 타일 테두리 3px = 0 (캔버스 사각이 절대 비치지 않고, 셰이더
# 인셋 텍셀까지 0 보장). 예외 — KEEP_RIGHT 타일(꼬리·테일 익스텐드)은 우측
# 컬럼을 살린다: 연장 캔버스(along>1)가 우측 인셋 텍셀(253)을 클램프 샘플해
# "꼬리 밖 워시 강도"로 쓰는 상부 §16 관례의 하부판(셰이더도 연장 워시를 꼬리
# 프로파일에만 허용하는 이중 게이트). 샘플은 타일 안쪽 2.5px 인셋 + mip 없음
# → 이웃 타일 번짐이 구조적으로 없다.


def under_inner(u: float, w: float) -> float:
    """아래 안쪽 스머지 — 눈머리 1/3 뭉치. under_outer의 미러(초승달 계약 준수)."""
    d = 0.44 * gauss(u, 0.20, 0.16)
    return _crescent(u, w, d, 0.95)


def under_point(u: float, w: float) -> float:
    """아래 포인트 — 눈꼬리 근처 작은 얕은 팝(초승달 계약 준수, 우측 엣지 0 수렴)."""
    d = 0.32 * gauss(u, 0.78, 0.13)
    return _crescent(u, w, d, 0.95)


# eyeshadowShape enum(0리드 1크리스 2스모키 3꼬리 4안쪽 5중앙 6바깥 7베이스
# 8메인 9포인트 10와이드 11꼬리연장)의 하부 해석 — under_* 실루엣 매핑.
# 6(바깥)은 런타임에선 마스크 모드(_LowerSmokyMask)가 우선하고 이 타일은 폴백.
ATLAS_PROFILES = [
    under_wash,          # 0 리드 전체 → 언더 전반 워시
    under_slim,          # 1 크리스 집중 → lash 밑 슬림 라인
    under_full_smoky,    # 2 스모키
    under_tail,          # 3 꼬리 포인트
    under_inner,         # 4 안쪽 집중
    under_center,        # 5 중앙 집중
    under_outer,         # 6 바깥 집중 (마스크 모드 폴백)
    under_full_wash,     # 7 베이스 프로파일
    under_full_gradient, # 8 메인 프로파일
    under_point,         # 9 포인트 프로파일
    under_full_wide,     # 10 와이드
    under_full_tail,     # 11 테일 익스텐드 (우측 엣지 워시 잔존)
]
# 꼬리 계열(hold_right 실루엣)만 우측 컬럼 보존 — 연장 캔버스의 워시 값은 셰이더
# 인셋 샘플이 닿는 텍셀(우측에서 3번째, 253)에 실린다. 6(바깥)은 런타임에서 항상
# 마스크 모드(_LowerSmokyMask)로 라우팅되어 타일이 폴백 전용이므로 제외.
ATLAS_KEEP_RIGHT = {3, 11}
ATLAS_COLS, ATLAS_ROWS = 4, 3
ATLAS_TILE = 256
# 테두리 3px — 셰이더 INSET(2.5px)이 클램프하는 텍셀(253)까지 0을 보장해야
# 비꼬리 타일의 연장 유령 워시가 원천 차단된다(2px면 253이 실루엣 값으로 남음).
ATLAS_BORDER = 3
# 캔버스는 1024×1024 POT — NPOT(1024×768)이면 Unity 임포터(nPOTScale)가 세로
# 리샘플해 텍셀 격자가 틀어진다. 4행째(미사용)는 전부 0.
ATLAS_CANVAS_ROWS = 4
ATLAS_OUT = (
    Path(__file__).resolve().parent.parent
    / "apps/unity/MakeupAR/Assets/Resources/lower_profile_atlas.png"
)


def render_lower_atlas() -> Path:
    aw, ah = ATLAS_COLS * ATLAS_TILE, ATLAS_CANVAS_ROWS * ATLAS_TILE
    img = Image.new("RGBA", (aw, ah), (0, 0, 0, 255))
    px = img.load()
    for p, fn in enumerate(ATLAS_PROFILES):
        col, row = p % ATLAS_COLS, p // ATLAS_COLS
        x0, y0 = col * ATLAS_TILE, row * ATLAS_TILE
        for ty in range(ATLAS_TILE):
            w = ty / (ATLAS_TILE - 1)  # PNG 상단 = lash
            for tx in range(ATLAS_TILE):
                u = tx / (ATLAS_TILE - 1)
                g = round(max(0.0, min(1.0, fn(u, w))) * 255.0)
                # 클로저 테두리 — 상·하·좌 항상 0, 우측은 KEEP_RIGHT만 보존.
                on_border = (
                    ty < ATLAS_BORDER or ty >= ATLAS_TILE - ATLAS_BORDER
                    or tx < ATLAS_BORDER
                    or (tx >= ATLAS_TILE - ATLAS_BORDER
                        and p not in ATLAS_KEEP_RIGHT))
                if on_border:
                    g = 0
                px[x0 + tx, y0 + ty] = (g, g, g, 255)
    ATLAS_OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(ATLAS_OUT)
    return ATLAS_OUT


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
        # 상승은 C1 이즈인(p² 계열) — 선형 램프는 WING_START에서 기울기 불연속이라
        # 라인→윙 접합부가 V자로 꺾여 보인다(밴드 세로 스트레치 ~1.4×가 과장).
        yc += wing_rise * (p * p * (3.0 - 2.0 * p))
        # 테이퍼는 더 일찍·완전히 — 0.35~1.0 테이퍼는 세로 스트레치로 두꺼워진 윙 끝이
        # 캔버스 엣지에서 잘린 듯 뭉툭했다. 0.85에서 0 도달 = 캔버스 안에서 뾰족하게 소멸.
        th *= 1.0 - smoothstep(0.20, 0.85, p)
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
    return _liner_alpha(u, v, base_th=0.07, tail_th=0.17, wing_len=0.28, wing_rise=0.42)


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
        *SHAPES, *EXT_SHAPES, *LOWER_SHAPES, *LINERS, *CANON_HIGHLIGHTS,
        "lower_profile_atlas"]
    for name in names:
        if name == "lower_profile_atlas":
            print(f"written: {render_lower_atlas()}")
        else:
            print(f"written: {render(name)}")


if __name__ == "__main__":
    main()
