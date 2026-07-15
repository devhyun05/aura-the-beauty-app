// 동적 아이섀도우 밴드. 상안검 lash 라인 위에 눈썹 방향으로 확장한 초승달
// 메시(IrisRenderer)에 그려지며, GrabPass로 잡은 실제 눈두덩 픽셀을 루마 보존
// 방식으로 틴트한다 — 평평한 페인트가 아니라 색소가 얹힌 느낌(FaceMakeup과 동일 룩).
//
// 정점 uv:
//  - uv.x = 세로 위치(0 = lash 라인 진함, 1 = 최상단 페이드). smoothstep falloff로
//    정적 마스크의 소프트 블러를 대체한다.
//  - uv.y = 가로 농도 가중(바깥 눈꼬리 1.0 → 안쪽 앞머리 0.45).
//
// 알파 블렌드(SrcAlpha)와 이중 적용되지 않도록 색소를 amt 알파로만 출력한다
// (lerp(feed,pigment,amt) + 알파 amt는 amt²가 되어 너무 옅어짐).
Shader "ARMakeup/Eyeshadow"
{
    Properties
    {
        _EyeshadowColor ("Eyeshadow Color", Color) = (0.69, 0.42, 0.31, 1)
        _EyeshadowIntensity ("Eyeshadow Intensity", Range(0, 1)) = 0.0
        // 마감(finish): 0=새틴(기본) 1=매트 2=글로시 3=시머. 피드 luma만(신규의존0).
        _EyeshadowFinish ("Finish (0 satin 1 matte 2 gloss 3 shimmer)", Float) = 0
        _EyeshadowShimmer ("Shimmer Gain", Range(0, 1)) = 0.5
        // ── 제형 스튜디오(#21) — 마감 세부 파라미터. 전부 0 = enum 기존 동작(하위호환). ──
        _EyeshadowGlossLo ("Eyeshadow Finish Gloss Lo", Range(0, 1)) = 0
        _EyeshadowGlossGain ("Eyeshadow Finish Gloss Gain", Range(0, 1)) = 0
        _EyeshadowShimmerSize ("Eyeshadow Finish Shimmer Size", Range(0, 1)) = 0
        _EyeshadowShimmerDensity ("Eyeshadow Finish Shimmer Density", Range(0, 1)) = 0
        _EyeshadowMatte ("Eyeshadow Finish Matte", Range(0, 1)) = 0
        _EyeshadowSheen ("Eyeshadow Finish Velvet Sheen", Range(0, 1)) = 0
        _EyeshadowMaterial ("Eyeshadow Material (0 none 1 velvet 2 metal 3 holo)", Float) = 0
        _EyeshadowMaterialStrength ("Eyeshadow Material Strength", Range(0, 1)) = 0
        // 입자 레이어(글리터) 9축 — density 0=끔.
        _EsParticleSize ("Es Particle Size", Range(0,1)) = 0.4
        _EsParticleDensity ("Es Particle Density", Range(0,1)) = 0
        _EsParticleBrightness ("Es Particle Brightness", Range(0,1)) = 0.7
        _EsParticleColor ("Es Particle Color", Color) = (1,0.95,0.85,1)
        _EsParticleTwinkle ("Es Particle Twinkle", Range(0,1)) = 1
        _EsParticleShape ("Es Particle Shape", Range(0,1)) = 0
        _EsParticleFeather ("Es Particle Feather", Range(0,1)) = 0
        _EsParticleParallax ("Es Particle Parallax", Range(0,1)) = 0
        _EsParticleConfetti ("Es Particle Confetti", Range(0,1)) = 0
        // 질감 맵(#22) — 픽셀별 광 지도(R 광게인·G 시머밀도). 기본 white + _HasFinishMap 0
        // = 변조 없음(스칼라 그대로, 하위호환). setTextureMap 브리지로 런타임 임포트.
        _EyeshadowFinishMap ("Eyeshadow Finish Map (R gloss G shimmer)", 2D) = "white" {}
        _EyeshadowHasFinishMap ("Eyeshadow Has Finish Map", Float) = 0
        // ── R2 그라데이션 (설계 §3.1 색축) ── 스톱B 기본 = _EyeshadowColor 기본과 동일,
        // _EyeshadowGradient 기본 0 = 끔 = 기존 출력.
        _EyeshadowColor2 ("Eyeshadow Gradient Stop B (lid)", Color) = (0.69, 0.42, 0.31, 1)
        _EyeshadowGradient ("Eyeshadow Gradient", Range(0, 1)) = 0
        // 모양: 0..8 베이스/메인/포인트×안쪽·중앙·바깥, 9 크리스, 10 스모키, 11 와이드.
        _EyeshadowShape ("Shape (0..11 anatomical presets)", Float) = 0
        // 디자이너 모양 마스크(§16) — 밴드-로컬 UV(uv2: u=눈앞0→눈꼬리1, v=안검연0→눈썹1)로
        // 샘플하는 흑백/알파 존 스텐실. .r = 존 세기 → 커버리지(amt)에 곱해 절차 밴드 위에
        // 디자이너 그라데/글리터 형태를 얹는다. 기본 white + _HasDesign 0 = 변조 없음
        // (하위호환 — 미임포트 시 절차 밴드 그대로, 바이트 동일). setRegionMask 브리지로 임포트.
        _EyeshadowDesign ("Eyeshadow Design Mask (band-local uv2)", 2D) = "white" {}
        _EyeshadowHasDesign ("Eyeshadow Has Design", Float) = 0
    }

    SubShader
    {
        // 얼굴 메이크업(3000) 뒤, 홍채(+11)·아이라이너(+12)보다 앞 → 라이너가 위에 얹힘
        Tags { "Queue" = "Transparent+9" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

        GrabPass { "_CameraFeed" } // FaceMakeup/Iris와 동일 이름 → 프레임당 1회 그랩 공유

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
            #include "Finish.cginc"    // 마감(ApplyFinish) 공용 — 제형 스튜디오 세부 파라미터
            #include "Ambient.cginc"   // 저조도 색소 바닥(PigmentBase) — 어둠 발광 방지

            // _CameraFeed / _CameraFeed_TexelSize 는 Finish.cginc(1곳)에서 선언 — A15 방향 게인이 공유.
            fixed4 _EyeshadowColor;
            float _EyeshadowIntensity;
            float _EyeshadowFinish;
            float _EyeshadowShimmer;
            // 제형 스튜디오(#21) 마감 세부 — 0 = enum 기존 동작(하위호환).
            float _EyeshadowGlossLo;
            float _EyeshadowGlossGain;
            float _EyeshadowShimmerSize;
            float _EyeshadowShimmerDensity;
            float _EyeshadowMatte;
            float _EyeshadowSheen;
            float _EyeshadowMaterial;
            float _EyeshadowMaterialStrength;
            float _EsParticleSize; float _EsParticleDensity; float _EsParticleBrightness;
            fixed4 _EsParticleColor; float _EsParticleTwinkle; float _EsParticleShape;
            float _EsParticleFeather; float _EsParticleParallax; float _EsParticleConfetti;
            sampler2D _EyeshadowFinishMap;   // 질감 맵(#22) — R 광게인·G 시머밀도 변조
            float _EyeshadowHasFinishMap;    // 0 = 맵 없음(스칼라 그대로, 하위호환)
            fixed4 _EyeshadowColor2;   // R2 그라데 스톱B (리드=속눈썹 라인 진한 색)
            float _EyeshadowGradient;  // R2 그라데 강도 0..1 (0=끔=기존)
            float _EyeshadowShape;     // 모양: 0..11 해부학적 위치 프리셋
            sampler2D _EyeshadowDesign; // 디자이너 모양 마스크(§16) — 밴드-로컬 uv2로 샘플
            float _EyeshadowHasDesign;  // 0 = 마스크 없음(절차 밴드 그대로, 하위호환)

            // ── 멀티밴드(A14 ①) — 최대높이 메시 1장에 밴드별 세로 cutoff로 N밴드(≤4)를
            // over 합성한다(드로우콜 1, 큐 재번호 불필요). Properties 없이 유니폼만
            // (SetVectorArray/SetInt로 세팅). _EsLayerCount==0 이면 이하 단일 경로 그대로
            // (레거시 저장물·스칼라 — 픽셀 동일). 제형 세부(GlossLo 등)·질감맵·디자인 마스크는
            // v1에서 밴드 공통(스칼라 유니폼) — 배열화는 후속.
            #define ES_MAX 4
            float4 _EsLayerColor[ES_MAX];  // rgb=색, a=밴드 강도
            float4 _EsLayerColor2[ES_MAX]; // 그라데 스톱B (리드=속눈썹 라인 진한 색)
            float4 _EsLayerParam[ES_MAX];  // x=세로 cutoff(자기높이/최대높이) y=finish z=shape w=gradient
            int _EsLayerCount;             // >0 = 멀티밴드 경로, 0 = 레거시 단일 경로
            float _EdgeFeather;            // 세로 cutoff 페더 폭(기본 0.45 — 현 0.55~1.0 폭 ≈ 0.45)

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;   // 재질(MatCap)용
                float2 uv : TEXCOORD0;  // x=세로(0 lash→1 위), y=가로 농도 가중(절차 프로파일)
                float2 uv2 : TEXCOORD1; // 밴드-로컬 (u,v): u=눈앞0→눈꼬리1, v=안검연0→눈썹1
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float4 grabPos : TEXCOORD1;
                float2 bandUV : TEXCOORD2; // 디자이너 마스크 샘플용 밴드-로컬 좌표
                float3 vnormal : TEXCOORD3; // 뷰공간 법선(재질)
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                o.grabPos = ComputeGrabScreenPos(o.pos);
                o.bandUV = v.uv2;
                o.vnormal = normalize(mul((float3x3)UNITY_MATRIX_IT_MV, v.normal));
                if (o.vnormal.z < 0.0) o.vnormal = -o.vnormal; // 카메라 향하는 반구로
                return o;
            }

            float EyeshadowBell(float center, float width, float x)
            {
                float d = abs(x - center) / max(width, 1e-4);
                return 1.0 - smoothstep(0.45, 1.0, d);
            }

            // vertical = lash 0 → brow 1, anatomicalX = inner 0 → outer corner 1 → tail 1.28.
            // 양쪽 눈 모두 같은 해부학 축을 쓰므로 앞/중앙/뒤 프리셋이 자동 미러링된다.
            float EyeshadowShapeWeight(float shape, float vertical, float anatomicalX)
            {
                float baseV = 1.0 - smoothstep(0.62, 1.0, vertical);
                float mainV = EyeshadowBell(0.42, 0.58, vertical);
                float pointV = EyeshadowBell(0.34, 0.3, vertical);
                float innerW = EyeshadowBell(0.18, 0.42, anatomicalX);
                float centerW = EyeshadowBell(0.52, 0.42, anatomicalX);
                float outerW = EyeshadowBell(0.84, 0.52, anatomicalX);

                float verticalWeight = baseV;
                float horizontalWeight = 1.0;
                if (shape < 2.5)
                {
                    horizontalWeight = shape < 0.5 ? 1.0 : (shape < 1.5 ? innerW : outerW);
                }
                else if (shape < 5.5)
                {
                    verticalWeight = mainV;
                    horizontalWeight = shape < 3.5 ? innerW : (shape < 4.5 ? centerW : outerW);
                }
                else if (shape < 8.5)
                {
                    verticalWeight = pointV;
                    horizontalWeight = shape < 6.5 ? innerW : (shape < 7.5 ? centerW : outerW);
                }
                else if (shape < 9.5)
                {
                    verticalWeight = smoothstep(0.3, 0.5, vertical)
                                   * (1.0 - smoothstep(0.68, 0.92, vertical));
                    horizontalWeight = EyeshadowBell(0.52, 0.62, anatomicalX);
                }
                else if (shape < 10.5)
                {
                    verticalWeight = 1.0 - smoothstep(0.82, 1.1, vertical);
                    horizontalWeight = lerp(0.72, 1.0, saturate(anatomicalX));
                }
                else
                {
                    verticalWeight = 1.0 - smoothstep(0.72, 1.04, vertical);
                    horizontalWeight = lerp(0.78, 1.0, saturate(anatomicalX));
                }

                float tailT = saturate((anatomicalX - 1.0) / 0.28);
                float tailFade = 1.0 - smoothstep(0.0, 1.0, tailT);
                float usesTail = (abs(shape - 2.0) < 0.25 || abs(shape - 5.0) < 0.25
                               || abs(shape - 8.0) < 0.25 || abs(shape - 10.0) < 0.25
                               || abs(shape - 11.0) < 0.25) ? 1.0 : 0.0;
                float noTailGate = 1.0 - smoothstep(0.96, 1.02, anatomicalX);
                return verticalWeight * horizontalWeight * tailFade
                     * lerp(noTailGate, 1.0, usesTail);
            }

            // 마감(finish)은 Finish.cginc의 ApplyFinish 공용 함수로 이관(립·아이섀도·블러셔
            // 공유). sparkleUV는 눈두덩 메시 uv(2D)라 시머가 눈꺼풀에 접착된다(스크린 고정 아님).

            fixed4 frag(v2f i) : SV_Target
            {
                float2 screenUV = i.grabPos.xy / i.grabPos.w;
                fixed3 feed = tex2D(_CameraFeed, screenUV).rgb;

                // ── 멀티밴드(A14 ①) — 아래(uv.x=0 lash)에서 위로 N밴드 over 합성. 배열
                // 순서 = 그리는 순서(뒤 밴드가 위). _EsLayerCount==0이면 이 블록을 건너뛰어
                // 아래 단일 경로 그대로(레거시 — 픽셀 동일).
                if (_EsLayerCount > 0)
                {
                    float vxm = saturate(i.uv.x);   // 0 lash → 1 위(브로우 쪽)
                    float lumaM = dot(feed, fixed3(0.299, 0.587, 0.114));

                    // 질감 맵(#22)·디자인 마스크(§16) — 밴드 공통(단일 경로와 동일 계산).
                    fixed4 esFinishMapM = tex2D(_EyeshadowFinishMap, i.uv);
                    float esGlossGainM = _EyeshadowGlossGain;
                    float esShimmerDensityM = _EyeshadowShimmerDensity;
                    ModulateFinishByMap(esFinishMapM, _EyeshadowHasFinishMap, esGlossGainM, esShimmerDensityM);
                    float2 designUV = float2(saturate(i.bandUV.x), saturate(i.bandUV.y));
                    float designGate = _EyeshadowHasDesign > 0.5 ? tex2D(_EyeshadowDesign, designUV).r : 1.0;

                    fixed3 accum = fixed3(0, 0, 0); // over 프리멀티 누적색
                    float accumA = 0.0;             // over 누적 알파
                    [unroll]
                    for (int b = 0; b < ES_MAX; b++)
                    {
                        if (b >= _EsLayerCount) break;
                        float cutoff = _EsLayerParam[b].x;  // 세로 cutoff = 자기높이/최대높이
                        float finishB = _EsLayerParam[b].y; // 마감 enum(0새틴..3시머)
                        float shapeB = _EsLayerParam[b].z;  // 모양 enum(0리드..3꼬리)
                        float gradB = _EsLayerParam[b].w;   // 그라데 강도

                        float localV = vxm / max(cutoff, 1e-4);
                        float shapeMask = EyeshadowShapeWeight(shapeB, localV, i.bandUV.x);
                        float amt = shapeMask * _EsLayerColor[b].a; // a = 밴드 강도

                        // 색·세로 그라데(§3.1) — 리드(uv.x=0)=스톱B 진한 색 → 위=스톱A.
                        // gradB=0이면 lerp 항등 → 단색.
                        fixed3 shadowBase = lerp(_EsLayerColor[b].rgb, _EsLayerColor2[b].rgb,
                                                 (1.0 - vxm) * gradB);
                        fixed3 pigment = shadowBase * PigmentBase(lumaM, 1.5, 0.15);
                        pigment = ApplyFinish(pigment, lumaM, i.uv, finishB, _EyeshadowShimmer,
                                              _EyeshadowGlossLo, esGlossGainM, _EyeshadowShimmerSize,
                                              esShimmerDensityM, _EyeshadowMatte, _EyeshadowSheen,
                                              screenUV, _PearlLightGain); // A15 방향 게인
                        pigment = ApplyMaterial(pigment, lumaM, screenUV, i.vnormal, _EyeshadowMaterial, _EyeshadowMaterialStrength);

                        // over — 밴드 b를 누적 위에 얹는다(배열 뒤=위). 프리멀티 누적 후
                        // 최종에서 언프리멀티 → 알파 블렌드(SrcAlpha)가 N밴드 스택을 재현.
                        accum = pigment * amt + accum * (1.0 - amt);
                        accumA = amt + accumA * (1.0 - amt);
                    }
                    fixed3 outColor = accumA > 1e-5 ? accum / accumA : accum;
                    // §11 오클루전 + 디자인 커버리지 게이트(공통) — 단일 경로와 동일.
                    return fixed4(outColor, accumA * designGate * OccludeGate(i.grabPos));
                }

                float vx = saturate(i.uv.x); // 0 lash → 1 위(브로우 쪽)
                float amt = EyeshadowShapeWeight(_EyeshadowShape, vx, i.bandUV.x)
                          * _EyeshadowIntensity;

                // 디자이너 모양 마스크(§16) — 밴드-로컬 uv2로 존 스텐실을 샘플해 커버리지에
                // 곱한다(디자이너 그라데/글리터 형태를 절차 밴드 위에 얹음). _HasDesign=0이면
                // 분기 스킵 → 절차 밴드 그대로(하위호환, 미임포트 시 바이트 동일).
                if (_EyeshadowHasDesign > 0.5)
                {
                    amt *= tex2D(_EyeshadowDesign,
                                 float2(saturate(i.bandUV.x), saturate(i.bandUV.y))).r;
                }

                // 루마 보존 색소 (FaceMakeup.Tint와 동일). 알파 블렌드가 단일 amt로
                // dest(스무딩된 피부)와 섞어 lerp(dest, pigment, amt)를 만든다.
                float luma = dot(feed, fixed3(0.299, 0.587, 0.114));
                // R2 세로 그라데(§3.1) — uv.x = 세로(0 lash→1 위). 리드(속눈썹 라인)=스톱B
                // 진한 색 → 크리스(위)=기존 색으로 풀리는 세로 축(vfall 페이드와 같은 축을
                // 공유하되 알파가 아니라 색만 섞는다). _EyeshadowGradient=0이면 lerp가
                // 항등 → 기존 출력과 픽셀 동일(하위호환).
                fixed3 shadowBase = lerp(_EyeshadowColor.rgb, _EyeshadowColor2.rgb,
                                         (1.0 - saturate(i.uv.x)) * _EyeshadowGradient);
                fixed3 pigment = shadowBase * PigmentBase(luma, 1.5, 0.15);
                // 질감 맵(#22) — 밴드 uv로 광 게인·시머 밀도를 픽셀별 변조(눈꺼풀 접착).
                // 맵 없으면(_HasFinishMap=0) 계수 1.0 → 스칼라 그대로(하위호환).
                fixed4 esFinishMap = tex2D(_EyeshadowFinishMap, i.uv);
                float esGlossGain = _EyeshadowGlossGain;
                float esShimmerDensity = _EyeshadowShimmerDensity;
                ModulateFinishByMap(esFinishMap, _EyeshadowHasFinishMap, esGlossGain, esShimmerDensity);
                pigment = ApplyFinish(pigment, luma, i.uv, _EyeshadowFinish, _EyeshadowShimmer,
                                      _EyeshadowGlossLo, esGlossGain, _EyeshadowShimmerSize,
                                      esShimmerDensity, _EyeshadowMatte, _EyeshadowSheen,
                                      screenUV, _PearlLightGain); // A15 방향 게인
                pigment = ApplyMaterial(pigment, luma, screenUV, i.vnormal, _EyeshadowMaterial, _EyeshadowMaterialStrength);
                pigment = ApplyGrain(pigment, i.uv);   // 매트 파우더 입자감(전역, 0=무변조)
                // 입자(글리터) — 밴드 위 반짝. coverage=1(출력 알파 amt가 게이트, 이중 게이트 방지).
                pigment = ApplyParticles(pigment, luma, i.uv, screenUV,
                                         _EsParticleSize, _EsParticleDensity, _EsParticleBrightness,
                                         _EsParticleColor.rgb, _EsParticleTwinkle, _EsParticleShape,
                                         _EsParticleFeather, _EsParticleParallax, _EsParticleConfetti, 1.0);

                // §11 오클루전 — 손·머리카락이 앞이면 그 픽셀 색소 제외(세그 없으면 1).
                return fixed4(pigment, amt * OccludeGate(i.grabPos));
            }
            ENDCG
        }
    }

    FallBack Off
}
