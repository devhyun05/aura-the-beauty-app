// 눈썹 스타일 — 미리 그린(또는 사용자 임포트) 눈썹 털 텍스처를 눈썹 아치에 워프해
// 렌더한다. StyleRenderer가 눈썹 밴드 메시에 텍스처 UV(가로=눈썹 길이, 세로=폭)를
// 매핑하므로, 텍스처 결이 실제 눈썹 곡선을 따라 휜다.
//
// 털 모양은 텍스처에서 뽑고, 색은 _BrowColor로 틴트(그레이스케일 에셋 + 어떤 색이든).
// _LumaKey=0: 알파 채널 = 털 모양(투명 배경 PNG). _LumaKey=1: 어두운 픽셀 = 털
// (흰 배경에 그린 그림/JPG). 임포트 시 StyleRenderer가 알파 유무 보고 자동 설정.
Shader "ARMakeup/BrowStyle"
{
    Properties
    {
        _BrowStyleTex ("Brow Style", 2D) = "black" {}
        _BrowColor ("Brow Color", Color) = (0.26, 0.19, 0.14, 1)
        _BrowIntensity ("Brow Intensity", Range(0, 1)) = 0.0
        _LumaKey ("Luma Key (0=alpha 1=dark)", Float) = 0.0
        // 마감(Tier B) — 0=새틴(기본, 기존 출력) 1=매트 2=듀이. ApplyFinish 레거시 경로.
        _StyleFinish ("Style Finish (0 satin 1 matte 2 dewy)", Float) = 0
        // W1에서 제품 제형 축 폐지. _BrowStyleTex(모양 텍스처)가 스타일을 전담한다.
        _StyleTexture ("Deprecated Style Texture", Float) = -1
        _BrowCoverageMode ("Coverage Mode (0 legacy 1 coverage)", Float) = 0
        _BrowCoverageDown ("Lower Coverage Expansion", Range(-0.25, 0.75)) = 0
        _BrowStyleVMin ("Style Alpha Crop Min V", Range(0, 1)) = 0
        _BrowStyleVMax ("Style Alpha Crop Max V", Range(0, 1)) = 1
    }

    SubShader
    {
        Tags { "Queue" = "Transparent+9" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

        GrabPass { "_CameraFeed" }

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
            #include "Ambient.cginc"   // 저조도 색소 바닥(BROW_KNEE) — 어둠 눈썹 발광 방지
            #include "Finish.cginc"    // 마감(ApplyFinish) 공용 — _CameraFeed도 여기서 선언
            #include "BrowCoverage.cginc"
            #include "BrowResponse.cginc"

            sampler2D _BrowStyleTex;
            fixed4 _BrowColor;
            float _BrowIntensity;
            float _LumaKey;
            float _StyleFinish; // 마감(Tier B) — 0=새틴=기존 출력(하위호환)
            float _StyleTexture; // 폐기된 구 payload 호환 자리(항상 무변조)
            float _BrowCoverageMode;
            float _BrowCoverageDown;
            float _BrowStyleVMin;
            float _BrowStyleVMax;

            inline float2 BrowStyleSampleUV(float2 bandUv)
            {
                float active = BrowCoverageActive(_BrowCoverageMode);
                float croppedV = lerp(_BrowStyleVMin, _BrowStyleVMax, bandUv.y);
                return float2(bandUv.x, lerp(bandUv.y, croppedV, active));
            }

            struct appdata { float4 vertex : POSITION; float2 uv : TEXCOORD0; float browSide : TEXCOORD3; };
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; float4 grabPos : TEXCOORD1; float browSide : TEXCOORD2; };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                o.grabPos = ComputeGrabScreenPos(o.pos);
                o.browSide = v.browSide;
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 screenUV = i.grabPos.xy / i.grabPos.w;
                fixed3 feed = tex2D(_CameraFeed, screenUV).rgb;
                float3 exposure = BrowResponseExposure(i.browSide);
                fixed3 normalizedFeed = BrowResponseNormalizeFeed(feed, exposure);
                float normalizedLuma = BrowResponseLuma(normalizedFeed);
                fixed4 tex = tex2D(_BrowStyleTex, BrowStyleSampleUV(i.uv));
                // 털 모양 = 알파(투명 PNG) 또는 1-밝기(흰 배경 그림). 색은 선택색으로,
                // 카메라 루마 살짝 반영해 자연스럽게.
                float texLuma = dot(tex.rgb, fixed3(0.299, 0.587, 0.114));
                float shape = lerp(tex.a, 1.0 - texLuma, saturate(_LumaKey));
                // 스타일 제형 축은 W1에서 폐지됐다. 아래 invalid template -1은 구 payload 값과
                // 무관하게 ZERO 번들을 반환해 body/grain/coverage/edge를 모두 무변조로 둔다.
                float stTexE, stTexG, stTexC, stTexB;
                // W1에서 스타일 제형 축은 폐지됐다. 유효 templateId가 아닌 -1로 항상 무변조한다.
                TexBundleFromEnum(-1.0, _StyleTexture, stTexE, stTexG, stTexC, stTexB);
                float amt = shape
                    * BrowStyleCoverageEdge(i.uv.y, _BrowCoverageMode, _BrowCoverageDown)
                    * _BrowIntensity;
                amt = TexEdge(TexCoverage(saturate(amt), stTexC), stTexE); // 제형 커버·엣지
                fixed3 pigment = _BrowColor.rgb * PigmentBaseKnee(normalizedLuma, 0.7, 0.45, BROW_KNEE);
                pigment = TexBody(pigment, normalizedLuma, stTexB); // 제형 발색 body
                // 마감 — 0=새틴=무변형(ApplyFinish 레거시 경로, 세부 6값 0). 텍스처
                // 눈썹이라 시머 게인 0. sparkleUV=밴드 uv.
                pigment = ApplyFinish(pigment, normalizedLuma, i.uv, _StyleFinish, 0,
                                      0, 0, 0, 0, 0, 0, screenUV, _PearlLightGain);
                pigment = TexGrain(pigment, i.uv, stTexG); // 제형 그레인
                pigment = BrowResponseReapplyExposure(pigment, exposure);
                // §11 오클루전 — face-skin 양성 게이트(§14 화이트리스트 불필요, Occlusion.cginc 주석).
                return fixed4(pigment, amt * OccludeGate(i.grabPos));
            }
            ENDCG
        }
    }

    FallBack Off
}
