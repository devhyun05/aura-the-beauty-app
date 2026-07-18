// 컬러 콘택트렌즈. 눈동자 랜드마크(468~477)로 만든 디스크 메시에 그려지며,
// GrabPass로 잡은 실제 눈동자 픽셀을 루마 보존 방식으로 틴트한다 — 평평한
// 페인트가 아니라 진짜 홍채 위에 색소가 얹힌 느낌.
//
// 정점 uv.x = 반경(0=중심, 1=테두리), uv.y = 각도(0..1) → 방사 좌표.
//  - 동공(_PupilFrac 이내)은 원본 유지 → 검은 동공이 자연스럽게 남음
//  - 테두리는 _RimSoft로 페이드 → 흰자 경계에서 하드엣지 방지
//  - 테두리 안쪽에 옅은 림버스 링(어두운 테)으로 렌즈 리얼리티 보강
// EyeStencil이 기록한 눈 열림 스텐실=1 영역에서만 렌더된다.
//
// ── 레이어드(#25) ──
// _LensCount > 0 이면 3세부(베이스/내부/림) 레이어드 합성 경로로 분기한다.
// 각 슬롯은 방사 UV 구간[inner,outer]에 색·디자인을 블렌드 모드(0~9: 노말/멀티/스크린/
// 오버레이/소프트라이트/닷지/번/라이튼/다큰/하드라이트)로 실제 홍채(GrabPass 피드) 위에
// 순서대로 얹는다(코드 표는 LensBlend 참조). _LensCount == 0 이면 legacy
// irisColor/irisIntensity 어댑터 경로(아래 원본 코드 그대로 — 하위호환 대수 보존).
Shader "ARMakeup/Iris"
{
    Properties
    {
        _IrisColor ("Iris Color", Color) = (0.36, 0.48, 0.55, 1)
        _IrisIntensity ("Iris Intensity", Range(0, 1)) = 0.0
        _PupilFrac ("Pupil Fraction", Range(0, 0.8)) = 0.42
        _RimSoft ("Rim Softness", Range(0.01, 0.5)) = 0.14
        // 렌즈 디자인 슬롯(#25) — 방사 컬러 아트. 기본 흰색 = 절차 그라데로 대체.
        _LensDesign0 ("Lens Design 0", 2D) = "white" {}
        _LensDesign1 ("Lens Design 1", 2D) = "white" {}
        _LensDesign2 ("Lens Design 2", 2D) = "white" {}
        _LensDesign3 ("Lens Design 3", 2D) = "white" {}
        _LensDesign4 ("Lens Design 4", 2D) = "white" {}
        _LensDesign5 ("Lens Design 5", 2D) = "white" {}
    }

    SubShader
    {
        Tags { "Queue" = "Transparent+11" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

        GrabPass { "_CameraFeed" } // FaceMakeup과 동일 이름 → 프레임당 1회 그랩 공유

        Pass
        {
            ZWrite Off
            ZTest Always
            Cull Off
            Blend Off // 스텐실 영역 내에서 합성된 눈동자 픽셀로 치환
            Stencil { Ref 1 Comp Equal }

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            #include "Occlusion.cginc" // §11 세그 오클루전 게이트 (전역 유니폼)
            #include "Ambient.cginc"   // 저조도 색소 바닥(PigmentBase) — 어둠 렌즈 발광 방지
            #include "Finish.cginc"    // 겹 마감(ApplyFinish)·_CameraFeed 공용 선언(RegionDecal 선례)

            // 렌즈 레이어드(#25) 슬롯 상한 — IrisRenderer.MaxLensLayers와 일치.
            #define LENS_MAX 6

            // _CameraFeed·헤드포즈·MatCap 유니폼은 Finish.cginc가 선언(로컬 중복 제거).
            fixed4 _IrisColor;
            float _IrisIntensity;
            float _PupilFrac;
            float _RimSoft;

            // 레이어드 유니폼 — 슬롯당 색(rgb)+강도(a), 존(inner,outer,blendMode,hasDesign).
            float4 _LensColor[LENS_MAX];
            float4 _LensZone[LENS_MAX];
            // 겹 마감 — .x = finish enum(0새틴/1매트/2듀이), yzw 예약. 겹별 독립(FOUNDATION_FINISHES).
            float4 _LensFinish[LENS_MAX];
            float _LensCount;
            sampler2D _LensDesign0;
            sampler2D _LensDesign1;
            sampler2D _LensDesign2;
            sampler2D _LensDesign3;
            sampler2D _LensDesign4;
            sampler2D _LensDesign5;

            // 슬롯 인덱스는 [unroll] 루프에서 컴파일 상수라 삼항 사슬이 상수 접힘된다
            // (동적 샘플러 인덱싱 회피 — Metal/GLES 이식성).
            #define LENS_DSN(idx, uvc) ( (idx)==0 ? tex2D(_LensDesign0, uvc) : \
                                         (idx)==1 ? tex2D(_LensDesign1, uvc) : \
                                         (idx)==2 ? tex2D(_LensDesign2, uvc) : \
                                         (idx)==3 ? tex2D(_LensDesign3, uvc) : \
                                         (idx)==4 ? tex2D(_LensDesign4, uvc) : \
                                                    tex2D(_LensDesign5, uvc) )

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0; // x = 방사 반경 0..1, y = 각도 0..1
                fixed4 color : COLOR;  // a = 눈 열림 게이트 (감으면 0 → 렌즈 소멸)
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float4 grabPos : TEXCOORD1;
                float gate : TEXCOORD2;
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                o.grabPos = ComputeGrabScreenPos(o.pos);
                o.gate = v.color.a;
                return o;
            }

            // 방사 존 마스크 — [inner,outer] 구간을 소프트 경계로 채운다(smoothstep).
            float LensZoneMask(float radius, float innerR, float outerR)
            {
                float soft = 0.06;
                float lo = smoothstep(innerR - soft, innerR + soft, radius);
                float hi = 1.0 - smoothstep(outerR - soft, outerR + soft, radius);
                return saturate(lo * hi);
            }

            // 블렌드 — 누적 색(base) 위에 소스(src)를 모드별로 합성. 정수 코드는 RN에서
            // lz.z(레이어 존.blendMode)로 넘어온다. 기존 0~3은 결과 바이트 불변(하위호환) —
            // 신규 4~9는 상위 코드부터 검사해 3 이하가 기존 분기로 낙하하도록 덧붙였다.
            // 신규 모드는 base3(=실제 홍채 피드) 위에서 동작하므로 홍채 명암이 그대로 보존된다
            // (노말 모드만 flat src라 luma로 보정 — 기존 관례 유지).
            //  0 노말: 루마 보존 색소(legacy 어댑터와 동일 원리 — 진짜 홍채 위 색소감)
            //  1 멀티: base*src (원래 눈색 비침·어둡게)  2 스크린: 1-(1-base)(1-src) (밝게)
            //  3 오버레이: 대비(base 기준 하프톤 분기)
            //  4 소프트라이트(Pegtop): (1-2s)·b² + 2s·b — 부드러운 대비, 클램프 불필요
            //  5 컬러닷지: base/(1-src) 클램프 — 밝은 쪽 극대(하이라이트 번짐)
            //  6 컬러번:   1-(1-base)/src 클램프 — 어두운 쪽 극대(딥 섀도)
            //  7 라이튼: max(base,src)   8 다큰: min(base,src)
            //  9 하드라이트: 오버레이의 base/src 교환(src 기준 분기)
            // 공식 출처: W3C Compositing Level 1(닷지/번/하드/다큰/라이튼), Pegtop 소프트라이트.
            float3 LensBlend(float mode, float3 base3, float3 src3, float luma)
            {
                if (mode > 8.5) // 9 하드라이트 — src>0.5면 스크린, 아니면 멀티(오버레이의 역)
                {
                    float3 mul = 2.0 * base3 * src3;
                    float3 scr = 1.0 - 2.0 * (1.0 - base3) * (1.0 - src3);
                    return lerp(mul, scr, step(0.5, src3));
                }
                if (mode > 7.5) return min(base3, src3);                       // 8 다큰
                if (mode > 6.5) return max(base3, src3);                       // 7 라이튼
                if (mode > 5.5) // 6 컬러번: src→0에서 0으로 클램프
                    return 1.0 - saturate((1.0 - base3) / max(src3, 1e-4));
                if (mode > 4.5) // 5 컬러닷지: src→1에서 1로 클램프
                    return saturate(base3 / max(1.0 - src3, 1e-4));
                if (mode > 3.5) // 4 소프트라이트(Pegtop — 연속·분기 없음)
                    return (1.0 - 2.0 * src3) * base3 * base3 + 2.0 * src3 * base3;
                if (mode > 2.5)
                {
                    float3 mul = 2.0 * base3 * src3;
                    float3 scr = 1.0 - 2.0 * (1.0 - base3) * (1.0 - src3);
                    return lerp(mul, scr, step(0.5, base3));
                }
                if (mode > 1.5) return 1.0 - (1.0 - base3) * (1.0 - src3);
                if (mode > 0.5) return base3 * src3;
                return src3 * PigmentBase(luma, 1.4, 0.12);
            }

            // 캐치라이트(눈동자 빛반사) 보존 — 실제 컬러렌즈는 각막 아래라 표면 스펙 반사가
            // 렌즈 유무와 무관하게 불변이어야 한다. 렌즈 합성 최종에 피드의 고휘도 스펙을
            // 검출(smoothstep(hi,1,feedLuma) — 립글로스/ApplyFinish 스펙 추출과 동일 계열)해
            // 그 지점만 렌즈 불투명도를 낮춰(피드로 lerp 복귀) 젖은 광택이 렌즈 색 위로 뚫고
            // 나오게 한다. 모든 블렌드 모드 공통 — 노말(불투명 덮기)에서도 최종에 되살리므로
            // 캐치라이트가 안 묻힌다. 레이어 0(미착용)은 legacy 경로라 피드 그대로.
            #define CATCH_LO 0.82   // 캐치라이트 검출 하한(feed 루마) — 실기기 튜닝 대상
            #define CATCH_GAIN 0.85 // 되살림 강도(1=그 지점 피드 완전 노출) — 실기기 튜닝 대상

            fixed4 frag(v2f i) : SV_Target
            {
                float2 screenUV = i.grabPos.xy / i.grabPos.w;
                fixed3 feed = tex2D(_CameraFeed, screenUV).rgb;

                float r = saturate(i.uv.x);
                float luma = dot(feed, fixed3(0.299, 0.587, 0.114));

                // ── 레이어드 경로(#25) ──
                if (_LensCount > 0.5)
                {
                    float2 dsnUV = float2(i.uv.y, r); // (각도, 반경) 방사 매핑
                    float3 col = feed;
                    // 동공 보존 게이트(전 레이어 공통) — 검은 동공이 자연스럽게 남는다.
                    float pupil = smoothstep(_PupilFrac, _PupilFrac + 0.10, r);
                    [unroll]
                    for (int si = 0; si < LENS_MAX; si++)
                    {
                        if ((float)si >= _LensCount) break;
                        float4 lc = _LensColor[si];
                        float4 lz = _LensZone[si];
                        float zone = LensZoneMask(r, lz.x, lz.y);
                        // 디자인: hasDesign이면 텍스처, 아니면 절차 방사 그라데(옅은 깊이감).
                        float grad = 0.92 + 0.16 * r;
                        float3 dsn = lz.w > 0.5 ? LENS_DSN(si, dsnUV).rgb : float3(grad, grad, grad);
                        float3 src = lc.rgb * dsn;
                        // 겹 마감(FOUNDATION_FINISHES 0새틴/1매트/2듀이) — ApplyFinish 레거시 enum
                        // 경로(세부 0). finish=0이면 항등이라 현행 픽셀 동일(하위호환). 듀이(2)는
                        // 레거시 글로시 분기로 젖은 광. 방사 UV(dsnUV)를 sparkleUV로 넘긴다.
                        src = ApplyFinish(src, luma, dsnUV, _LensFinish[si].x, 0.0,
                                          0.0, 0.0, 0.0, 0.0, 0.0, 0.0, screenUV, 0.0);
                        float3 blended = LensBlend(lz.z, col, src, luma);
                        float amt = saturate(lc.a * zone * pupil * i.gate);
                        col = lerp(col, blended, amt);
                    }
                    // 캐치라이트 보존(최종 패스, 블렌드 무관) — 피드 고휘도 스펙을 렌즈 위로
                    // 되살린다. 눈 감으면(i.gate=0) 반사도 사라진다. 스펙 없는 영역은 무영향.
                    float catchlight = smoothstep(CATCH_LO, 1.0, luma) * CATCH_GAIN * i.gate;
                    col = lerp(col, feed, saturate(catchlight));
                    col = lerp(feed, col, OccludeGate(i.grabPos)); // §11 오클루전
                    return fixed4(col, 1.0);
                }

                // ── legacy 어댑터 경로 (irisColor/irisIntensity, 하위호환 — 원본 그대로) ──
                float rim = 1.0 - smoothstep(1.0 - _RimSoft, 1.0, r);   // 테두리 페이드
                float pupilLegacy = smoothstep(_PupilFrac, _PupilFrac + 0.10, r); // 동공 보존
                // 눈 열림 게이트(i.gate)를 곱해 감으면 렌즈가 완전히 사라진다.
                float amtLegacy = _IrisIntensity * rim * pupilLegacy * i.gate;

                // 루마 보존 색소 (FaceMakeup.Tint와 동일 원리)
                fixed3 pigment = _IrisColor.rgb * PigmentBase(luma, 1.4, 0.12);
                fixed3 colLegacy = lerp(feed, pigment, saturate(amtLegacy));

                // 림버스 링: 홍채 바깥 테를 살짝 어둡게 (강도·게이트 비례로만 →
                // 감은 눈에 홍채 테 잔상이 남지 않게 게이트도 곱한다)
                float limbal = 1.0 - 0.35 * smoothstep(0.82, 1.0, r) * _IrisIntensity * i.gate;
                colLegacy *= limbal;

                // §11 오클루전 — Blend Off 치환 셰이더라 알파 대신 피드로 lerp 복귀.
                colLegacy = lerp(feed, colLegacy, OccludeGate(i.grabPos));

                return fixed4(colLegacy, 1.0);
            }
            ENDCG
        }
    }

    FallBack Off
}
