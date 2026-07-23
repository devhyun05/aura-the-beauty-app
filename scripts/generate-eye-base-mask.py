#!/usr/bin/env python3
"""눈 리드 전반 베이스 워시 아이섀도 디자인 마스크(eye_base.png) 생성.

밴드-로컬 UV 규약(IrisRenderer.BuildEyeshadowBandUV / Eyeshadow.shader §16):
  u(가로): 0=눈앞(좌) → 1=눈꼬리(우). 눈꼬리 밖 연장 구간은 우측 엣지가 클램프
           샘플되므로, 우측 엣지를 0이 아닌 값으로 남기면 '옆' 워시가 은은하게 이어진다.
  v(세로): 0=안검연(하단) → 1=눈썹(상단). PNG 하단 = lash 라인.

모양: lash~20% 풀 강도 → 80%에서 소멸하는 세로 페이드(리드 전반 워시),
      눈앞 15% 페더 인, 눈꼬리 85%부터 우측 엣지 0.45 테이퍼(옆 워시용).

출력: apps/unity/MakeupAR/Assets/StreamingAssets/catalog/mask/eye_base.png (256x256, 그레이스케일)
"""

from pathlib import Path

from PIL import Image

W = H = 256

V_FULL_END = 0.20   # 세로 풀 강도 유지 상한 (lash 기준)
V_FADE_END = 0.80   # 세로 소멸 지점
U_IN_END = 0.15     # 눈앞 페더 인 구간
U_OUT_START = 0.85  # 눈꼬리 테이퍼 시작
U_OUT_EDGE = 0.45   # 우측 엣지 잔존 값 (꼬리 밖 '옆' 워시 강도)


def smoothstep(e0: float, e1: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3.0 - 2.0 * t)


def main() -> None:
    img = Image.new("L", (W, H))
    px = img.load()
    for y in range(H):
        # PIL y=0은 상단이므로 뒤집어 v=0이 하단(lash)이 되게 한다.
        v = (H - 1 - y) / (H - 1)
        vfall = 1.0 - smoothstep(V_FULL_END, V_FADE_END, v)
        for x in range(W):
            u = x / (W - 1)
            hin = smoothstep(0.0, U_IN_END, u)
            hout = 1.0 + (U_OUT_EDGE - 1.0) * smoothstep(U_OUT_START, 1.0, u)
            px[x, y] = round(vfall * hin * hout * 255.0)

    out = (
        Path(__file__).resolve().parent.parent
        / "apps/unity/MakeupAR/Assets/StreamingAssets/catalog/mask/eye_base.png"
    )
    img.save(out)
    print(f"written: {out}")


if __name__ == "__main__":
    main()
