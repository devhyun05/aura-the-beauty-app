// 립 틴트. 입술 외곽·내곽 랜드마크(스냅)로 만든 링(도넛) 메시에 그려지며,
// GrabPass로 잡은 실제 입술 픽셀을 루마 보존 방식으로 틴트한다 — 평평한 페인트가
// 아니라 색소가 얹힌 느낌(FaceMakeup 립과 동일 룩).
//
// 칠한 UV 마스크(대략적 타원)를 대체한다: 링은 외곽↔내곽 랜드마크 사이의 버밀리언
// 그 자체라, 경계가 실제 입술에 맞고(스필 없음), 안쪽 윤곽이 입 안쪽·치아를 애초에
// 제외한다(입 벌려도 링은 입술만). 색 기반 판별의 치아/스필/입술산 한계를 기하로 해소.
//
// 정점 uv.x = 반경(0 = 바깥 버밀리언 경계, 1 = 안쪽 입 라인). 바깥만 살짝 페더해
// 피부 전환을 부드럽게.
Shader "ARMakeup/Lip"
{
    Properties
    {
        _LipColor ("Lip Color", Color) = (0.79, 0.31, 0.43, 1)
        _LipIntensity ("Lip Intensity", Range(0, 1)) = 0.0
        // 마감(finish): 0=새틴(기본, 현재 룩) 1=매트 2=글로시 3=시머.
        // 피드 luma만 사용 — 신규 의존 0 (설계 섹션 13 ①②⑤). _LipShimmer = 시머 게인.
        _LipFinish ("Lip Finish (0 satin 1 matte 2 gloss 3 shimmer)", Float) = 0
        _LipShimmer ("Lip Shimmer Gain", Range(0, 1)) = 0.5
        // 제형 텍스처(배치 A ①) — 엣지 하드니스/커버로 제형감. 0=립스틱(현행 룩).
        _LipTexture ("Lip Texture (0 lipstick 1 velvet 2 water)", Float) = 0
        // ── 제형 스튜디오(#21) — 마감 세부 파라미터. 전부 0 = 미지정 = enum 기존 동작
        // (Finish.cginc가 다섯 값 합 0이면 레거시 경로로 분기, 하위호환 대수 검증).
        // _GlossLumaLo(아래 립글로스 톱코트 임계)와는 다른 값 — 이건 마감(finish)의 광 임계.
        _LipGlossLo ("Lip Finish Gloss Lo", Range(0, 1)) = 0
        _LipGlossGain ("Lip Finish Gloss Gain", Range(0, 1)) = 0
        _LipShimmerSize ("Lip Finish Shimmer Size", Range(0, 1)) = 0
        _LipShimmerDensity ("Lip Finish Shimmer Density", Range(0, 1)) = 0
        _LipMatte ("Lip Finish Matte", Range(0, 1)) = 0
        _LipSheen ("Lip Finish Velvet Sheen", Range(0, 1)) = 0
        _LipMaterial ("Lip Material (0 none 1 velvet 2 metal 3 holo)", Float) = 0
        _LipMaterialStrength ("Lip Material Strength", Range(0, 1)) = 0
        // 입자 레이어(글리터) 9축 — density 0=끔.
        _LipParticleSize ("Lip Particle Size", Range(0,1)) = 0.4
        _LipParticleDensity ("Lip Particle Density", Range(0,1)) = 0
        _LipParticleBrightness ("Lip Particle Brightness", Range(0,1)) = 0.7
        _LipParticleColor ("Lip Particle Color", Color) = (1,0.95,0.85,1)
        _LipParticleTwinkle ("Lip Particle Twinkle", Range(0,1)) = 1
        _LipParticleShape ("Lip Particle Shape", Range(0,1)) = 0
        _LipParticleFeather ("Lip Particle Feather", Range(0,1)) = 0
        _LipParticleParallax ("Lip Particle Parallax", Range(0,1)) = 0
        _LipParticleConfetti ("Lip Particle Confetti", Range(0,1)) = 0
        // 질감 맵(#22) — 픽셀별 광 지도(R 광게인·G 시머밀도). 기본 white + _HasFinishMap 0
        // = 변조 없음(스칼라 그대로, 하위호환). setTextureMap 브리지로 런타임 임포트.
        _LipFinishMap ("Lip Finish Map (R gloss G shimmer)", 2D) = "white" {}
        _LipHasFinishMap ("Lip Has Finish Map", Float) = 0
        // ── R2 그라데이션 (설계 §3.1 색축) ── 스톱B 기본 = _LipColor 기본과 동일,
        // _LipGradient 기본 0 = 끔. 립라이너 머티리얼(동일 셰이더 공유)은 이 유니폼을
        // 만지지 않으므로 기본 0으로 기존 룩 그대로 남는다.
        _LipColor2 ("Lip Gradient Stop B (inner)", Color) = (0.79, 0.31, 0.43, 1)
        _LipGradient ("Lip Gradient", Range(0, 1)) = 0
        // ── 베이스립(맨 아래 커버) ── luma 보존 커버 — 커버리지만큼 입술 원색을
        // 베이스색(누드/스킨톤) 쪽으로 보간. 파운데이션과 같은 계열 공식(립 메시 한정).
        // 기본 0 = 끔 = 기존 픽셀 동일. 립라이너 머티리얼은 이 유니폼을 안 만짐(기본 0).
        _LipBaseColor ("Lip Base Cover Color (nude)", Color) = (0.85, 0.66, 0.60, 1)
        _LipBaseIntensity ("Lip Base Cover", Range(0, 1)) = 0
        // ── 립글로스(맨 위 광) ── 마감(_LipFinish)과 독립된 가산 스펙 하이라이트
        // (피드 luma 상위 증폭) + 틴트색. 기본 흰색 = 무색 광, 기본 강도 0 = 끔.
        // 매트 마감 위에도 얹힌다. 립라이너는 기본 0이라 무영향.
        _LipGlossColor ("Lip Gloss Color", Color) = (1, 1, 1, 1)
        _LipGlossIntensity ("Lip Gloss", Range(0, 1)) = 0
        _GlossLumaLo ("Gloss Luma Lo", Range(0, 1)) = 0.6 // 광 하한 — 이상 luma에서 반짝 // 실기기 튜닝 대상
    }

    SubShader
    {
        // 얼굴 메이크업(3000) 뒤, 눈 오버레이(+9~12)보다 앞. 립·눈은 안 겹침.
        Tags { "Queue" = "Transparent+8" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

        GrabPass { "_CameraFeed" } // FaceMakeup/눈 오버레이와 동일 이름 → 프레임당 1회 그랩 공유

        Pass
        {
            ZWrite Off
            ZTest Always
            Cull Off
            Blend One OneMinusSrcAlpha // 프리멀티드 — 립글로스 가산 광이 A→0에서도 유효

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            #include "Occlusion.cginc" // §11 세그 오클루전 게이트 (전역 유니폼)
            #include "Finish.cginc"    // 마감(ApplyFinish) 공용 — 제형 스튜디오 세부 파라미터
            #include "Ambient.cginc"   // 저조도 색소 바닥(PigmentBase) — 어둠 발광 방지

            // _CameraFeed / _CameraFeed_TexelSize 는 Finish.cginc(1곳)에서 선언 — A15 방향 게인이 공유.
            fixed4 _LipColor;
            float _LipIntensity;
            float _LipFinish;
            float _LipShimmer;
            float _LipTexture; // 제형 텍스처(①) 0=립스틱 1=벨벳틴트 2=워터틴트
            // 제형 스튜디오(#21) 마감 세부 — 0 = enum 기존 동작(하위호환).
            float _LipGlossLo;
            float _LipGlossGain;
            float _LipShimmerSize;
            float _LipShimmerDensity;
            float _LipMatte;
            float _LipSheen;
            float _LipMaterial;
            float _LipMaterialStrength;
            float _LipParticleSize; float _LipParticleDensity; float _LipParticleBrightness;
            fixed4 _LipParticleColor; float _LipParticleTwinkle; float _LipParticleShape;
            float _LipParticleFeather; float _LipParticleParallax; float _LipParticleConfetti;
            sampler2D _LipFinishMap;   // 질감 맵(#22) — R 광게인·G 시머밀도 변조
            float _LipHasFinishMap;    // 0 = 맵 없음(스칼라 그대로, 하위호환)
            fixed4 _LipColor2;   // R2 그라데 스톱B (안쪽=입 라인 진한 색)
            float _LipGradient;  // R2 그라데 강도 0..1 (0=끔=기존)
            fixed4 _LipBaseColor;     // 베이스립 커버 색(누드/스킨톤)
            float _LipBaseIntensity;  // 베이스립 커버리지 0..1 (0=끔=기존)
            fixed4 _LipGlossColor;    // 립글로스 광 틴트색(기본 흰=무색)
            float _LipGlossIntensity; // 립글로스 강도 0..1 (0=끔=기존)
            float _GlossLumaLo;       // 글로스 luma 하한
            // 제형 텍스처(①) — 엣지 하드니스 상한/커버로 제형감. 0=립스틱은 현행값(하위호환).
            #define LIP_TEX_VELVET_EDGE 0.20    // 벨벳틴트: 엣지 소프트(smoothstep 상한↑) // 실기기 튜닝 대상
            #define LIP_TEX_WATER_EDGE 0.28     // 워터틴트: 엣지 더 소프트 // 실기기 튜닝 대상
            #define LIP_TEX_WATER_COV_DOWN 0.30 // 워터틴트: 메인 틴트 커버 하향 // 실기기 튜닝 대상

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;   // 재질(MatCap)용
                float2 uv : TEXCOORD0; // x = 반경(0 바깥→1 안쪽)
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float4 grabPos : TEXCOORD1;
                float3 vnormal : TEXCOORD2; // 뷰공간 법선(재질)
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                o.grabPos = ComputeGrabScreenPos(o.pos);
                o.vnormal = normalize(mul((float3x3)UNITY_MATRIX_IT_MV, v.normal));
                if (o.vnormal.z < 0.0) o.vnormal = -o.vnormal; // 카메라 향하는 반구로
                return o;
            }

            // 마감(finish)은 Finish.cginc의 ApplyFinish 공용 함수로 이관(립·아이섀도·블러셔
            // 공유). 스파클 좌표는 립 메시 uv가 1D(반경)라 스크린 좌표(screenUV)를 넘긴다.

            fixed4 frag(v2f i) : SV_Target
            {
                float2 screenUV = i.grabPos.xy / i.grabPos.w;
                fixed3 feed = tex2D(_CameraFeed, screenUV).rgb;

                // 바깥 경계(uv.x≈0, 피부 전환)만 소프트 페더, 나머지는 꽉 채움.
                // 안쪽(uv.x=1)은 입 라인이라 하드 경계 유지(치아 침범 방지). edge는 세 레이어
                // (베이스/틴트/글로스) 공통 경계 마스크.
                // 제형 텍스처(①) — 엣지 상한을 텍스처별로: 0=립스틱(현행 0.14) 1=벨벳틴트
                // (상한↑=소프트) 2=워터틴트(더 소프트 + 커버↓). select는 상수 lerp(분기 없음).
                // 텍스처 0이면 edgeHi=0.14·커버 배수 1 → 기존 픽셀과 바이트 동일(하위호환).
                float texVelvet = saturate(1.0 - abs(_LipTexture - 1.0)); // 1 at velvet
                float texWater = saturate(_LipTexture - 1.0);             // 1 at water
                float edgeHi = lerp(0.14, LIP_TEX_VELVET_EDGE, texVelvet);
                edgeHi = lerp(edgeHi, LIP_TEX_WATER_EDGE, texWater);
                float lipTexCov = 1.0 - texWater * LIP_TEX_WATER_COV_DOWN;
                float edge = smoothstep(0.0, edgeHi, i.uv.x);

                float luma = dot(feed, fixed3(0.299, 0.587, 0.114));

                // ── 합성 순서: 피드 → ① 베이스 커버 → ② 메인 틴트 → ③ Finish → ④ 글로스.
                // 각 레이어를 "피드 위 반투명 오버"로 스택하고, 결과를 SrcAlpha 한 번으로
                // 내보내기 위해 합성 알파 A(레이어 합집합)와 프리멀티 색을 직접 계산한다.
                // 이렇게 하면 _LipBaseIntensity=_LipGlossIntensity=0일 때 A=aTint, 프리멀티
                // 색=pigment 로 정확히 축약 → 기존 픽셀과 완전 동일(하위호환).

                // ② 메인 틴트 색소(루마 보존, FaceMakeup.Tint 원리) — 피드 luma 기준(원본
                // 불변). R2 그라데(§3.1): uv.x(0 바깥→1 안쪽)로 스톱B 혼합, _LipGradient=0=끔.
                fixed3 lipBase = lerp(_LipColor.rgb, _LipColor2.rgb, i.uv.x * _LipGradient);
                fixed3 pigment = lipBase * PigmentBase(luma, 1.5, 0.15);
                // 질감 맵(#22) — 링 uv(x=반경)로 광 게인·시머 밀도를 픽셀별 변조.
                // 맵 없으면(_HasFinishMap=0) 계수 1.0 → 스칼라 그대로(하위호환).
                fixed4 lipFinishMap = tex2D(_LipFinishMap, i.uv);
                float lipGlossGain = _LipGlossGain;
                float lipShimmerDensity = _LipShimmerDensity;
                ModulateFinishByMap(lipFinishMap, _LipHasFinishMap, lipGlossGain, lipShimmerDensity);
                pigment = ApplyFinish(pigment, luma, screenUV, _LipFinish, _LipShimmer,
                                      _LipGlossLo, lipGlossGain, _LipShimmerSize,
                                      lipShimmerDensity, _LipMatte, _LipSheen,
                                      screenUV, _PearlLightGain); // A15 방향 게인(맨얼굴 피드 루마 그라디언트)
                // 재질 아키타입(벨벳/메탈/홀로) — matType=0 또는 강도=0이면 pigment 그대로.
                // 립은 법선 미계산 → 정면 기본값(0,0,1). (추후 립 메시 법선 시 대체)
                pigment = ApplyMaterial(pigment, luma, screenUV, i.vnormal, _LipMaterial, _LipMaterialStrength);
                pigment = ApplyGrain(pigment, i.uv);   // 매트 파우더 입자감(전역, 0=무변조)

                // ① 베이스 커버 색(누드/스킨톤, luma 보존) — 틴트 아래 반투명 레이어.
                fixed3 baseTone = _LipBaseColor.rgb * PigmentBase(luma, 1.5, 0.15);

                // 두 레이어 알파: 틴트 aTint=edge·intensity(=원본 amt), 베이스 aBase.
                // 제형 텍스처(①) 워터틴트만 메인 틴트 커버를 낮춘다(lipTexCov=1이면 원본).
                float aTint = edge * _LipIntensity * lipTexCov;
                float aBase = edge * _LipBaseIntensity;
                // 베이스(아래) 위에 틴트(위)를 over 합성한 결과를 피드 위 단일 (색, A)로.
                //   out = pigment·aTint + (1−aTint)·(baseTone·aBase + (1−aBase)·feed)
                // ⇒ 합집합 알파 A = 1−(1−aTint)(1−aBase),  프리멀티 numer = pigment·aTint
                //    + (1−aTint)·aBase·baseTone.  aBase=0이면 A=aTint·numer=pigment·aTint →
                //    아래에서 색=pigment 로 정확 축약(하위호환).
                // 프리멀티드 색 — 베이스(아래)+틴트(위) over 합성(Blend One OneMinusSrcAlpha).
                // A=합집합 알파, premult=α로 미리 곱한 색. 아래 Blend에서 screen = premult
                // + feed·(1−A) 로 합성돼, 모두 0이면 A=0·premult=0 → screen=feed(하위호환).
                float A = 1.0 - (1.0 - aTint) * (1.0 - aBase);
                fixed3 premult = pigment * aTint + (1.0 - aTint) * aBase * baseTone;

                // ④ 립글로스(맨 위) — 마감과 독립된 가산 광. 프리멀티 색에 직접 더한다.
                // A는 안 올려 목적지 피드가 살아있으므로, 클리어 글로스 단독(틴트·베이스 0)도
                // feed 위에 밝힘으로 얹힌다(SrcAlpha였다면 검정 위 블렌드로 오히려 어두워짐 —
                // 적대 리뷰 confirmed). 강도 0이면 무가산 → 기존과 동일.
                float glossAmt = edge * smoothstep(_GlossLumaLo, 1.0, luma) * _LipGlossIntensity;
                premult += _LipGlossColor.rgb * glossAmt;
                // 입자(글리터) — 립 위 반짝. premult에 가산(립글로스와 동일, 알파 불변).
                // c=0으로 호출해 순수 반짝 기여만 얻어 더한다. coverage=edge(립 모양).
                premult += ApplyParticles(fixed3(0,0,0), luma, i.uv, screenUV,
                                          _LipParticleSize, _LipParticleDensity, _LipParticleBrightness,
                                          _LipParticleColor.rgb, _LipParticleTwinkle, _LipParticleShape,
                                          _LipParticleFeather, _LipParticleParallax, _LipParticleConfetti, edge);

                // §11 오클루전 — 프리멀티라 색·알파를 같은 계수로 감쇠(세그 없으면 1).
                float occ = OccludeGate(i.grabPos);
                return fixed4(premult * occ, A * occ);
            }
            ENDCG
        }
    }

    FallBack Off
}
