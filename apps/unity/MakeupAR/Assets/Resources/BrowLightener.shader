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

            sampler2D _CameraFeed;
            fixed4 _SkinColor;
            float _BrowIntensity;
            float _HairLo;
            float _HairHi;

            struct appdata { float4 vertex : POSITION; float2 uv : TEXCOORD0; };
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; float4 grabPos : TEXCOORD1; };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                o.grabPos = ComputeGrabScreenPos(o.pos);
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 screenUV = i.grabPos.xy / i.grabPos.w;
                fixed3 feed = tex2D(_CameraFeed, screenUV).rgb;

                float luma = dot(feed, fixed3(0.299, 0.587, 0.114));
                // 어두운 털에만 피부색을 덮는다. 진할수록 완전 커버(옅은 눈썹).
                float hair = 1.0 - smoothstep(_HairLo, _HairHi, luma);

                float vEdge = smoothstep(0.0, 0.16, i.uv.x) * (1.0 - smoothstep(0.84, 1.0, i.uv.x));
                float hEdge = smoothstep(0.0, 0.12, i.uv.y) * (1.0 - smoothstep(0.88, 1.0, i.uv.y));

                float amt = hair * vEdge * hEdge * _BrowIntensity;

                // 피부색 자체를 얹되, 원래 명암을 살짝 반영해 완전 평면 페인트 방지.
                fixed3 skin = _SkinColor.rgb * (0.85 + 0.3 * luma);
                // §11 오클루전 — 앞머리/손 위에 피부색을 칠하지 않는다(라이트너는 특히 치명적).
                return fixed4(skin, amt * OccludeGate(i.grabPos));
            }
            ENDCG
        }
    }

    FallBack Off
}
