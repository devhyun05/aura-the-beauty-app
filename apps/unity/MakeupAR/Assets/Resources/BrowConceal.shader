// 눈썹 지우기(BrowConceal) — 눈썹 제품 스택 맨 아래(밑작업)에 깔리는 스킨톤 컨실
// 레이어. 큐 순서(MakeupQueues.BrowConceal < 제품들)로 "지우고 그 위에 그리기"가
// 자동 성립한다.
//
// 시맨틱: 이 기능은 "전체 지우개"(자연 눈썹 전체 컨실)가 1급 기능이다. 설계 §15의
// 삐침 정리(커버 영역 = 자연눈썹 ∩ ¬새눈썹모양 — 새 모양을 정점 채널에 베이크한
// protect 구멍)는 미구현 후속이며, 여기선 그 전역 근사로 제품 최대 강도
// (_BrowProductMax)에 비례해 컨실을 감쇠만 한다 — 컨실을 최대로 깔고 반투명 제품을
// 얹을 때 새 모양 안쪽까지 피부로 덮여 워시드아웃되는 것(§15의 밑동 자국)을 완화.
// 컨실 단독(제품 0)일 땐 감쇠 0 = 완전 지우개 유지.
//
// BrowLightener(균일 _SkinColor — CPU가 이마 랜드마크 평균 1색)와 달리, GrabPass
// 피드에서 "그 세로줄 바로 위 이마 픽셀"을 샘플해 칠한다 — 샘플점 월드 좌표는
// BrowRenderer가 정점 채널 TEXCOORD1(uv1)에 매 프레임 기록. 균일 1색 페인트가
// 남기는 자국 없이 이마 조명 그라데이션을 그대로 따라간다.
//
// 신규 셰이더로 만든 근거: BrowLightener.shader는 제품 스택(옅은 눈썹)이 현역으로
// 쓰는 셰이더라 오프셋 샘플·정점 채널을 추가하면 기존 제품 거동이 바뀐다(침습).
// 별도 파일 = 기존 눈썹 제품 침습 0. 루마 게이트·페더 패턴은 BrowLightener 재사용.
Shader "ARMakeup/BrowConceal"
{
    Properties
    {
        _BrowIntensity ("Conceal Intensity", Range(0, 1)) = 0.0
        // 털 판정 루마 게이트 — 어두운 털 픽셀일수록 강하게 덮고 밝은 피부는 통과.
        // BrowLightener와 동일 기본값. // 실기기 튜닝 대상
        _HairLo ("Hair Luma Lo", Range(0, 1)) = 0.32
        _HairHi ("Hair Luma Hi", Range(0, 1)) = 0.70
        // 밴드 가장자리 페더 폭(uv 비율) — 컨실 경계가 피부에 녹아들게. // 실기기 튜닝 대상
        _FeatherV ("Vertical Feather", Range(0, 0.4)) = 0.20
        _FeatherH ("Horizontal Feather", Range(0, 0.4)) = 0.12
        // 눈썹 제품 최대 강도(CPU: max(마스카라, 파우더, 펜슬, 스타일)) — 전역 근사
        // protect. 진한 제품일수록 그 아래 컨실을 감쇠(계수는 PROTECT_DAMP).
        _BrowProductMax ("Brow Product Max", Range(0, 1)) = 0.0
        // 마감(Tier B) — 0=새틴(기본, 기존 출력) 1=매트 2=듀이. ApplyFinish 레거시 경로.
        _ConcealFinish ("Conceal Finish (0 satin 1 matte 2 dewy)", Float) = 0
        // 제형(텍스처) — browConceal template(14). -1=필드 부재/레거시 무변조.
        _ConcealTexture ("Conceal Texture (domain enum)", Float) = -1
        _BrowCoverageMode ("Coverage Mode (0 legacy 1 coverage)", Float) = 0
        _BrowCoverageDown ("Lower Coverage Expansion", Range(-0.25, 0.75)) = 0
        _BrowProtectStyleTex ("Style Silhouette", 2D) = "black" {}
        _BrowProtectStyleVMin ("Style Crop Min V", Range(0, 1)) = 0
        _BrowProtectStyleVMax ("Style Crop Max V", Range(0, 1)) = 1
        _BrowProtectStyleLumaKey ("Style Luma Key", Range(0, 1)) = 0
        _BrowProtectStyleWeight ("Style Protect Weight", Range(0, 1)) = 0
        _BrowProtectPowderWeight ("Powder Protect Weight", Range(0, 1)) = 0
        _BrowProtectPencilWeight ("Pencil Protect Weight", Range(0, 1)) = 0
    }

    SubShader
    {
        // 태그 큐는 폴백일 뿐 — 실제 큐는 BrowRenderer가 MakeupQueues.BrowConceal 지정.
        Tags { "Queue" = "Transparent+11" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

        GrabPass { "_CameraFeed" } // 공유 이름 — 프레임당 1회 dedupe (MakeupQueues 주석 참조)

        Pass
        {
            ZWrite Off
            ZTest Always
            Cull Off
            Blend SrcAlpha OneMinusSrcAlpha

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            #include "Occlusion.cginc" // §11 세그 오클루전 게이트 (전역 유니폼)
            #include "Finish.cginc"    // 마감(ApplyFinish) 공용 — _CameraFeed도 여기서 선언
            #include "BrowCoverage.cginc"
            #include "BrowResponse.cginc"

            // 칠하는 피부색에 원래 명암을 살짝 반영 — 완전 평면 페인트 방지
            // (BrowLightener의 0.85 + 0.3·luma 패턴). // 실기기 튜닝 대상
            #define SHADE_BASE 0.85
            #define SHADE_LUMA_GAIN 0.3
            // 제품 강도 비례 컨실 감쇠 계수(전역 근사 protect — 워시드아웃 완화).
            // 1이면 제품 최대 강도 1에서 컨실 완전 소거. // 실기기 튜닝 대상
            #define PROTECT_DAMP 0.6

            float _BrowIntensity;
            float _HairLo;
            float _HairHi;
            float _FeatherV;
            float _FeatherH;
            float _BrowProductMax;
            float _ConcealFinish; // 마감(Tier B) — 0=새틴=기존 출력(하위호환)
            float _ConcealTexture; // 눈썹 컨실 template(14): -1=레거시 무변조, 0=단일 제품 시드
            float _BrowCoverageMode;
            float _BrowCoverageDown;
            sampler2D _BrowProtectStyleTex;
            float _BrowProtectStyleVMin;
            float _BrowProtectStyleVMax;
            float _BrowProtectStyleLumaKey;
            float _BrowProtectStyleWeight;
            float _BrowProtectPowderWeight;
            float _BrowProtectPencilWeight;

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0;      // x=세로(0하→1상), y=가로(0바깥→1안)
                float3 skinPos : TEXCOORD1; // 피부 샘플점 월드 좌표(CPU가 이마 방향 오프셋 계산)
                float2 targetRange : TEXCOORD2; // 새 눈썹 실루엣의 컨실 uv 하·상 범위
                float browSide : TEXCOORD3;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float4 grabPos : TEXCOORD1;
                float4 skinGrabPos : TEXCOORD2;
                float2 targetRange : TEXCOORD3;
                float browSide : TEXCOORD4;
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                o.grabPos = ComputeGrabScreenPos(o.pos);
                // 피부 샘플점도 같은 투영을 태워 그랩 UV로 — 플랫폼 Y플립 등 일관 처리.
                o.skinGrabPos = ComputeGrabScreenPos(UnityObjectToClipPos(float4(v.skinPos, 1.0)));
                o.targetRange = v.targetRange;
                o.browSide = v.browSide;
                return o;
            }

            inline float2 BrowTargetUV(float2 concealUv, float2 targetBounds, out float valid)
            {
                float targetWidth = max(targetBounds.y - targetBounds.x, 0.0);
                valid = step(1e-4, targetWidth);
                return float2(concealUv.y,
                    saturate((concealUv.x - targetBounds.x) / max(targetWidth, 1e-4)));
            }

            inline float BrowStyleProtectMask(float2 targetUv)
            {
                float sampleV = lerp(_BrowProtectStyleVMin, _BrowProtectStyleVMax, targetUv.y);
                fixed4 style = tex2D(_BrowProtectStyleTex, float2(targetUv.x, sampleV));
                float styleLuma = dot(style.rgb, fixed3(0.299, 0.587, 0.114));
                float silhouette = lerp(style.a, 1.0 - styleLuma,
                    saturate(_BrowProtectStyleLumaKey));
                // BrowStyle.shader와 같은 coverage edge. 투명 털 사이 구멍은 그대로 0이다.
                return saturate(silhouette)
                    * BrowStyleCoverageEdge(targetUv.y, _BrowCoverageMode, _BrowCoverageDown);
            }

            inline float BrowPowderProtectMask(float2 targetUv)
            {
                // 파우더는 실제로 밴드를 채우므로 밴드 내부만 부드럽게 보호한다.
                float vertical = smoothstep(0.0, 0.08, targetUv.y)
                    * (1.0 - smoothstep(0.92, 1.0, targetUv.y));
                float horizontal = smoothstep(0.0, 0.06, targetUv.x)
                    * (1.0 - smoothstep(0.94, 1.0, targetUv.x));
                return vertical * horizontal;
            }

            inline float BrowPencilProtectMask(float2 targetUv)
            {
                // 펜슬 정점 알파를 직접 공유할 수 없으므로 밴드 전체를 비우지 않는다.
                // 뿌리 분포 구간 안의 성긴 결만 최대 0.28로 보수적으로 보호한다.
                float roots = smoothstep(0.04, 0.12, targetUv.y)
                    * (1.0 - smoothstep(0.66, 0.76, targetUv.y));
                float strokePhase = abs(frac(targetUv.x * 31.0 + targetUv.y * 2.5) - 0.5);
                float sparseStrokes = 1.0 - smoothstep(0.08, 0.18, strokePhase);
                return roots * sparseStrokes * 0.28;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 screenUV = i.grabPos.xy / i.grabPos.w;
                fixed3 feed = tex2D(_CameraFeed, screenUV).rgb;
                float3 exposure = BrowResponseExposure(i.browSide);
                fixed3 normalizedFeed = BrowResponseNormalizeFeed(feed, exposure);
                float normalizedLuma = BrowResponseLuma(normalizedFeed);
                // 루마 게이트 — 어두운 털일수록 강하게 덮는다(§15 재사용 패턴).
                float hair = BrowResponseHair(normalizedLuma, _HairLo, _HairHi);

                // 위(이마 방향) 오프셋 UV의 실제 피부 픽셀 — 이 세로줄이 칠할 색.
                float2 skinUV = i.skinGrabPos.xy / i.skinGrabPos.w;
                fixed3 skin = BrowResponseNormalizeFeed(tex2D(_CameraFeed, skinUV).rgb, exposure);

                float vEdge = smoothstep(0.0, _FeatherV, i.uv.x)
                            * (1.0 - smoothstep(1.0 - _FeatherV, 1.0, i.uv.x));
                float hEdge = smoothstep(0.0, _FeatherH, i.uv.y)
                            * (1.0 - smoothstep(1.0 - _FeatherH, 1.0, i.uv.y));

                // 눈썹 컨실 template(14) 시드 번들. body/grain=피부색소, coverage/edge=커버 amt.
                // -1=레거시 무변조, enum 0은 현재 단일 제품 시드다.
                float ccTexE, ccTexG, ccTexC, ccTexB;
                TexBundleFromEnum(14.0, _ConcealTexture, ccTexE, ccTexG, ccTexC, ccTexB);
                float amt = hair * vEdge * hEdge * _BrowIntensity;
                // 전역 근사 protect — 위에 얹을 제품이 진할수록 컨실을 약화해
                // "피부 덮고 반투명 제품" 이중 처리(워시드아웃)를 완화. 제품 0이면
                // 감쇠 0 = 완전 지우개.
                float legacyProductDamp = 1.0 - _BrowProductMax * PROTECT_DAMP;
                // profile 0은 기존 전역 감쇠를 정확히 유지한다. 새 커버 모드는 바깥
                // 자연 털을 충분히 지우고, 아래의 공간 protect가 새 제품 내부만 비운다.
                amt *= lerp(
                    legacyProductDamp, 1.0, BrowCoverageActive(_BrowCoverageMode));
                float targetValid;
                float2 targetUv = BrowTargetUV(i.uv, i.targetRange, targetValid);
                float styleProtect = BrowStyleProtectMask(targetUv)
                    * saturate(_BrowProtectStyleWeight);
                float powderProtect = BrowPowderProtectMask(targetUv)
                    * saturate(_BrowProtectPowderWeight);
                float pencilProtect = BrowPencilProtectMask(targetUv)
                    * saturate(_BrowProtectPencilWeight);
                // 제품별 알파의 합집합. 스타일 PNG의 투명한 털 사이는 보호하지 않아
                // 컨실이 그 사이로 보이는 실제 자연 털을 계속 억제한다.
                float targetProtect = targetValid * (1.0
                    - (1.0 - styleProtect) * (1.0 - powderProtect) * (1.0 - pencilProtect));
                amt *= 1.0 - targetProtect;
                amt = TexEdge(TexCoverage(saturate(amt), ccTexC), ccTexE); // 제형 커버·엣지

                fixed3 pig = skin * (SHADE_BASE + SHADE_LUMA_GAIN * normalizedLuma);
                pig = TexBody(pig, normalizedLuma, ccTexB); // 제형 발색 body
                // 마감 — 0=새틴=무변형(ApplyFinish 레거시 경로, 세부 6값 0). 스킨톤
                // 컨실이라 시머 게인 0. sparkleUV=밴드 uv.
                pig = ApplyFinish(pig, normalizedLuma, i.uv, _ConcealFinish, 0,
                                  0, 0, 0, 0, 0, 0, screenUV, _PearlLightGain);
                pig = TexGrain(pig, i.uv, ccTexG); // 제형 그레인
                pig = BrowResponseReapplyExposure(pig, exposure);
                // §11 오클루전 — 앞머리/손 위에 피부색 컨실을 칠하지 않는다.
                return fixed4(pig, amt * OccludeGate(i.grabPos));
            }
            ENDCG
        }
    }

    FallBack Off
}
