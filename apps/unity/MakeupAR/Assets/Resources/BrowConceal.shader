// 눈썹 완전 교체(BrowConceal) — 눈썹 제품 스택 맨 아래에서 자연 눈썹과 주변 잔털을
// 실제 이마 피부 패치로 복원한다. 이후 고정 렌더 큐(3014~3018)가 새 눈썹을 그리므로
// 사용자가 지우개와 눈썹을 어떤 순서로 선택해도 결과는 항상 "지우고 그리기"다.
//
// browConcealIntensity는 사용자가 직접 선택한 지우개만 제어한다. 눈썹 제품 선택은
// 이 패스를 자동으로 켜지 않으며, 제품을 제거해도 명시적인 지우개 레이어는 유지한다.
//
// BrowLightener(균일 _SkinColor — CPU가 이마 랜드마크 평균 1색)와 달리, GrabPass
// 피드에서 눈썹 밴드와 같은 크기의 이마 피부 패치를 샘플해 칠한다. 샘플 패치의
// 하·상 좌표는 BrowRenderer가 TEXCOORD1(uv1)에 기록하므로 피부 결·조명 변화가
// 세로 방향으로도 유지된다.
//
// 신규 셰이더로 만든 근거: BrowLightener.shader는 제품 스택(옅은 눈썹)이 현역으로
// 쓰는 셰이더라 오프셋 샘플·정점 채널을 추가하면 기존 제품 거동이 바뀐다(침습).
// 별도 파일 = 기존 눈썹 제품 침습 0. 페더 패턴은 BrowLightener에서 재사용하고,
// 잔털 판정은 현 위치 피부와의 국소 RGB/루마 대비를 사용한다.
Shader "ARMakeup/BrowConceal"
{
    Properties
    {
        _BrowIntensity ("Conceal Intensity", Range(0, 1)) = 0.0
        // 구 전문가 payload/머티리얼 호환 필드. 완전 교체 경로는 절대 루마 대신
        // 현 위치 피부 대비를 사용한다.
        _HairLo ("Hair Luma Lo", Range(0, 1)) = 0.32
        _HairHi ("Hair Luma Hi", Range(0, 1)) = 0.70
        // 밴드 가장자리 페더 폭(uv 비율) — 컨실 경계가 피부에 녹아들게. // 실기기 튜닝 대상
        _FeatherV ("Vertical Feather", Range(0, 0.4)) = 0.34
        _FeatherH ("Horizontal Feather", Range(0, 0.4)) = 0.24
        // 레거시 진단/호환 필드. 교체 경로에서는 새 눈썹 내부도 먼저 완전히 지운다.
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
                float2 naturalRange : TEXCOORD4; // 실제 자연 눈썹의 컨실 uv 하·상 범위
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float4 grabPos : TEXCOORD1;
                float4 skinGrabPos : TEXCOORD2;
                float2 targetRange : TEXCOORD3;
                float browSide : TEXCOORD4;
                float2 naturalRange : TEXCOORD5;
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
                o.naturalRange = v.naturalRange;
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

            inline fixed3 SampleBrowSkin(
                float2 screenUV, float2 skinUV, float verticalT, float3 exposure,
                out fixed3 localTargetTone)
            {
                // 눈썹 바로 위의 실제 이마 피부를 앵커로 잡는다. 고정 피부색을 칠하지
                // 않으므로 조명·홍조·명암이 현재 얼굴 피부와 이어진다.
                float2 up = skinUV - screenUV;
                float2 side = float2(-up.y, up.x);
                // skinUV 전체 거리(넓은 밴드 한 높이 이상)를 그대로 쓰면 이마의
                // 다른 조명대가 복사될 수 있다. 경계 바로 바깥의 가까운 피부를 쓴다.
                // 밴드 아래 픽셀은 위쪽 피부까지 더 멀리 건너뛰어야 중간의 눈썹 털을
                // 재복사하지 않는다. 확장 밴드의 깨끗한 윗변으로 각 픽셀을 투영한다.
                float upperDistance = lerp(0.92, 0.12, saturate(verticalT));
                float2 upperUV = saturate(screenUV + up * upperDistance);

                // BrowRenderer의 전체 skinUV는 밴드 한 높이 이상 위라 이마가 짧거나
                // 앞머리가 가까우면 헤어라인까지 닿는다. 실제 복사 픽셀은 각 프래그먼트의
                // 눈썹 바로 위쪽인 upperUV에서만 가져와 먼 헤어라인 질감 유입을 막는다.
                // 큰 명암 구조를 버리고 미세 피부결만 추출해 절사 평균 피부톤에 더한다.
                fixed3 patch = BrowResponseNormalizeFeed(
                    tex2D(_CameraFeed, upperUV).rgb, exposure);
                fixed3 patchTone = patch;
                patchTone += BrowResponseNormalizeFeed(
                    tex2D(_CameraFeed, saturate(upperUV + side * 0.06)).rgb, exposure);
                patchTone += BrowResponseNormalizeFeed(
                    tex2D(_CameraFeed, saturate(upperUV - side * 0.06)).rgb, exposure);
                patchTone += BrowResponseNormalizeFeed(
                    tex2D(_CameraFeed, saturate(upperUV + up * 0.04)).rgb, exposure);
                patchTone *= 0.25;

                fixed3 upperCenter = BrowResponseNormalizeFeed(
                    tex2D(_CameraFeed, upperUV).rgb, exposure);
                fixed3 upperSideA = BrowResponseNormalizeFeed(
                    tex2D(_CameraFeed, saturate(upperUV + side * 0.05)).rgb, exposure);
                fixed3 upperSideB = BrowResponseNormalizeFeed(
                    tex2D(_CameraFeed, saturate(upperUV - side * 0.05)).rgb, exposure);
                fixed3 upperWideA = BrowResponseNormalizeFeed(
                    tex2D(_CameraFeed, saturate(upperUV + side * 0.11)).rgb, exposure);
                fixed3 upperWideB = BrowResponseNormalizeFeed(
                    tex2D(_CameraFeed, saturate(upperUV - side * 0.11)).rgb, exposure);
                // 다섯 점의 채널별 절사 평균. 최저(앞머리/관자 털)와 최고(과노출
                // 하이라이트)를 버리고 중간 세 점만 평균해 세로 피부톤 띠를 줄인다.
                fixed3 upperMin = min(
                    upperCenter, min(min(upperSideA, upperSideB), min(upperWideA, upperWideB)));
                fixed3 upperMax = max(
                    upperCenter, max(max(upperSideA, upperSideB), max(upperWideA, upperWideB)));
                fixed3 upperTone = (
                    upperCenter + upperSideA + upperSideB + upperWideA + upperWideB
                    - upperMin - upperMax) / 3.0;
                // 아래쪽 표본은 눈꺼풀·아이라인까지 닿을 수 있으므로 피부 복원 톤은
                // 눈썹 바로 위의 검증된 피부만 사용한다.
                localTargetTone = upperTone;
                // 패치의 큰 명암 구조(헤어라인·그림자)는 절대 복사하지 않고, 피부결
                // 크기의 미세 성분만 ±1.2%로 제한해 목표 피부톤 위에 얹는다.
                // 이렇게 하면 블러처럼 평평해지지 않으면서 검은 털/박스가 재유입되지 않는다.
                fixed3 microDetail = clamp(
                    patch - patchTone, fixed3(-0.012, -0.012, -0.012),
                    fixed3(0.012, 0.012, 0.012));
                return saturate(localTargetTone + microDetail);
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 screenUV = i.grabPos.xy / i.grabPos.w;
                fixed3 feed = tex2D(_CameraFeed, screenUV).rgb;
                float3 exposure = BrowResponseExposure(i.browSide);
                fixed3 normalizedFeed = BrowResponseNormalizeFeed(feed, exposure);

                // 위(이마 방향) 오프셋 UV의 실제 피부 픽셀 — 이 세로줄이 칠할 색.
                float2 skinUV = saturate(i.skinGrabPos.xy / i.skinGrabPos.w);
                fixed3 localTargetTone;
                fixed3 sampledSkin = SampleBrowSkin(
                    screenUV, skinUV, i.uv.x, exposure, localTargetTone);
                float skinLuma = BrowResponseLuma(sampledSkin);
                // 절대 루마 상한을 넓히면 중간 밝기 피부까지 털로 오인해 컨실 띠가
                // 생긴다. 같은 세로줄의 실제 이마 피부와 비교한 국소 어두움만 쓰면
                // 피부 결은 통과하고 옅은 잔털까지 선택적으로 복원할 수 있다.
                float replacement = saturate(_BrowIntensity);
                // 복사해 올 이마 패치는 결·조명 때문에 현 위치보다 밝을 수 있다.
                // 그 패치와 직접 비교하면 깨끗한 피부까지 털로 오인해 사각형이 된다.
                // 털 판정은 눈썹 바로 위의 실제 피부 절사 평균만 기준으로 삼는다.
                // 붉은기·그림자는 루마만 보면 털처럼 어두울 수 있지만, 보통 RGB
                // 세 채널이 동시에 내려가지는 않는다. 세 채널 모두 주변 피부보다
                // 어두운 양만 사용해 콧대/미간의 붉은 피부를 사각 패치로 오인하지 않는다.
                fixed3 localDelta = localTargetTone - normalizedFeed;
                float localDarkness = max(
                    0.0, min(localDelta.r, min(localDelta.g, localDelta.b)));
                float hair = smoothstep(
                    lerp(0.075, 0.018, replacement),
                    lerp(0.24, 0.095, replacement),
                    localDarkness);

                // 완전 지우기에서도 페더를 좁히지 않는다. 이전 0.10/0.03 강제 축소는
                // 복사 피부 패치의 사각 외곽을 짧은 거리에서 드러내는 직접 원인이었다.
                float featherV = max(_FeatherV, 0.34);
                float featherH = max(_FeatherH, 0.24);
                float vEdge = smoothstep(0.0, featherV, i.uv.x)
                            * (1.0 - smoothstep(1.0 - featherV, 1.0, i.uv.x));
                float hEdge = smoothstep(0.0, featherH, i.uv.y)
                            * (1.0 - smoothstep(1.0 - featherH, 1.0, i.uv.y));

                // 눈썹 컨실 template(14) 시드 번들. body/grain=피부색소, coverage/edge=커버 amt.
                // -1=레거시 무변조, enum 0은 현재 단일 제품 시드다.
                float ccTexE, ccTexG, ccTexC, ccTexB;
                TexBundleFromEnum(14.0, _ConcealTexture, ccTexE, ccTexG, ccTexC, ccTexB);
                // 새 눈썹 실루엣 안도 예외 없이 먼저 지운다. 고정 렌더 큐가 그 위에
                // 제품을 올리므로 원래 털이 비치거나 모양이 섞이지 않는다.
                // 자연 눈썹 실측 범위는 전체 커버 알파를 확보해 옅은 털까지 지운다.
                // 그 바깥 확장 밴드에서는 hair 게이트만 열어 주변 잔털을 추가로 잡는다.
                // 페이드는 실제 털 경계 안이 아니라 바깥의 깨끗한 피부에서 끝낸다.
                // 따라서 눈썹 상·하 외곽 털이 어두운 박스 선처럼 남지 않는다.
                float naturalValid = step(1e-4, i.naturalRange.y - i.naturalRange.x);
                float naturalCore = naturalValid
                    * smoothstep(
                        i.naturalRange.x - 0.14, i.naturalRange.x - 0.025, i.uv.x)
                    * (1.0 - smoothstep(
                        i.naturalRange.y + 0.025, i.naturalRange.y + 0.14, i.uv.x))
                    // 자연 눈썹 강제 교체도 넓어진 깨끗한 피부 런웨이에서 사방으로
                    // 0까지 녹인다. 이 항이 없으면 마지막 삼각형 경계가 박스 선이 된다.
                    // 제곱 페더는 외곽의 낮은 알파를 더 빠르게 0으로 내려 피부톤 차가
                    // 아주 조금만 있어도 보이던 얇은 직선 경계를 제거한다.
                    * (vEdge * vEdge) * (hEdge * hEdge);
                float strayCoverage = hair * vEdge * hEdge;
                float amt = max(strayCoverage, naturalCore) * saturate(_BrowIntensity);
                amt = TexEdge(TexCoverage(saturate(amt), ccTexC), ccTexE); // 제형 커버·엣지

                // 실측 자연 눈썹은 털 색이 옅거나 조명을 받아도 완전히 지우고,
                // 넓은 제곱 페더로 실제 피부에 연결한다.
                // naturalCore 자체가 사방으로 페더되므로 피부 패치의 외곽선은 남지 않는다.
                // 실측 범위 바깥 잔털만 RGB 털 판정으로 선택한다.
                float patchConfidence = max(
                    naturalCore, smoothstep(0.018, 0.095, localDarkness));
                fixed3 concealedSkin = sampledSkin;
                concealedSkin = TexBody(concealedSkin, skinLuma, ccTexB); // 제형 발색 body
                // 마감 — 0=새틴=무변형(ApplyFinish 레거시 경로, 세부 6값 0). 스킨톤
                // 컨실이라 시머 게인 0. sparkleUV=밴드 uv.
                concealedSkin = ApplyFinish(concealedSkin, skinLuma, i.uv, _ConcealFinish, 0,
                                            0, 0, 0, 0, 0, 0, screenUV, _PearlLightGain);
                concealedSkin = TexGrain(concealedSkin, i.uv, ccTexG); // 제형 그레인
                fixed3 pig = lerp(normalizedFeed, concealedSkin, patchConfidence);
                pig = BrowResponseReapplyExposure(pig, exposure);
                // §11 오클루전 — 앞머리/손 위에 피부색 컨실을 칠하지 않는다.
                return fixed4(pig, amt * OccludeGate(i.grabPos));
            }
            ENDCG
        }
    }

    FallBack Off
}
