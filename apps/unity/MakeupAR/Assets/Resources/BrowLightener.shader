// 눈썹 라이트너. 어두운 눈썹 털을 주변 피부톤(_SkinColor, CPU에서 샘플)으로 덮어
// 눈썹을 흐리게/옅게 만든다 — "옅은 눈썹" 또는 다른 모양을 그리기 전 밑작업.
//
// 마스카라/파우더가 "색을 더하는" 것과 반대로, 라이트너는 "털을 빼는" 방향이다.
// 어두운 픽셀(털)에만 피부색을 얹어(SrcAlpha) 대비를 낮춘다. 밝은 피부는 안 건드림.
//
// 스택 최하단(+5)에서 먼저 깔린다.
Shader "ARMakeup/BrowLightener"
{
    Properties
    {
        _SkinColor ("Skin Color", Color) = (0.86, 0.72, 0.62, 1) // CPU가 매 프레임 갱신
        _BrowIntensity ("Lighten Intensity", Range(0, 1)) = 0.0
        _HairLo ("Hair Luma Lo", Range(0, 1)) = 0.32
        _HairHi ("Hair Luma Hi", Range(0, 1)) = 0.70
        // 마감(Tier B) — 0=새틴(기본, 기존 출력) 1=매트 2=듀이. ApplyFinish 레거시 경로.
        _LightenerFinish ("Lightener Finish (0 satin 1 matte 2 dewy)", Float) = 0
        // 제형(텍스처) — browLightener template(15). -1=필드 부재/레거시 무변조.
        _LightenerTexture ("Lightener Texture (domain enum)", Float) = -1
        _BrowCoverageMode ("Coverage Mode (0 legacy 1 coverage)", Float) = 0
        _BrowCoverageDown ("Lower Coverage Expansion", Range(-0.25, 0.75)) = 0
    }

    SubShader
    {
        Tags { "Queue" = "Transparent+5" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

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
            #include "Finish.cginc"    // 마감(ApplyFinish) 공용 — _CameraFeed도 여기서 선언
            #include "BrowCoverage.cginc"
            #include "BrowResponse.cginc"

            fixed4 _SkinColor;
            float _BrowIntensity;
            float _HairLo;
            float _HairHi;
            float _LightenerFinish; // 마감(Tier B) — 0=새틴=기존 출력(하위호환)
            float _LightenerTexture; // 브로우 라이트너 template(15): -1=레거시 무변조, 0=단일 제품 시드
            float _BrowCoverageMode;
            float _BrowCoverageDown;

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
                // 어두운 털에만 피부색을 덮는다. 진할수록 완전 커버(옅은 눈썹).
                float hair = BrowResponseHair(normalizedLuma, _HairLo, _HairHi);

                float vEdge = BrowVerticalEdge(
                    i.uv.x, 0.16, 0.16, _BrowCoverageMode, _BrowCoverageDown);
                float hEdge = smoothstep(0.0, 0.12, i.uv.y) * (1.0 - smoothstep(0.88, 1.0, i.uv.y));

                // 브로우 라이트너 template(15) 시드 번들. body/grain=피부색소, coverage/edge=커버 amt.
                // -1=레거시 무변조, enum 0은 현재 단일 제품 시드다.
                float ltTexE, ltTexG, ltTexC, ltTexB;
                TexBundleFromEnum(15.0, _LightenerTexture, ltTexE, ltTexG, ltTexC, ltTexB);
                float amt = hair * vEdge * hEdge * _BrowIntensity;
                amt = TexEdge(TexCoverage(saturate(amt), ltTexC), ltTexE); // 제형 커버·엣지

                // 피부색 자체를 얹되, 원래 명암을 살짝 반영해 완전 평면 페인트 방지.
                fixed3 skin = _SkinColor.rgb * (0.85 + 0.3 * normalizedLuma);
                skin = TexBody(skin, normalizedLuma, ltTexB); // 제형 발색 body
                // 마감 — 0=새틴=무변형(ApplyFinish 레거시 경로, 세부 6값 0). 피부톤
                // 커버라 시머 게인 0. sparkleUV=밴드 uv.
                skin = ApplyFinish(skin, normalizedLuma, i.uv, _LightenerFinish, 0,
                                   0, 0, 0, 0, 0, 0, screenUV, _PearlLightGain);
                skin = TexGrain(skin, i.uv, ltTexG); // 제형 그레인
                skin = BrowResponseReapplyExposure(skin, exposure);
                // §11 오클루전 — 앞머리/손 위에 피부색을 칠하지 않는다(라이트너는 특히 치명적).
                return fixed4(skin, amt * OccludeGate(i.grabPos));
            }
            ENDCG
        }
    }

    FallBack Off
}
