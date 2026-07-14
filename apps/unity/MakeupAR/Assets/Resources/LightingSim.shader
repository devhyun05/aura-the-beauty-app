// 조명 시뮬레이션 (#4) — "매장 조명에선 예뻤는데 밖에서 보니 달랐다"를 미리 확인.
// 완성된 화면(카메라 피드 + 메이크업)을 GrabPass로 통째로 잡아 화이트밸런스·노출·
// 대비·채도 그레이드를 입힌 뒤 불투명으로 다시 그린다. 조명 프리셋별 그레이드 값은
// C#(LightingSimRenderer)이 유니폼으로 넣어주고, 셰이더는 그 값을 적용만 한다.
//
// 큐는 메이크업(≤3022) 위·가이드(4000) 아래(MakeupQueues.Lighting) — 피드+메이크업만
// 그레이드하고 코치 라인(스텐실·대칭)은 그 위에 순색으로 남긴다. 풀스크린 쿼드라
// ZTest Always로 항상 덮고, 원본↔그레이드는 _Intensity로 블렌드(0=무효).
Shader "ARMakeup/LightingSim"
{
    Properties
    {
        _Intensity ("Intensity", Range(0, 1)) = 1
        _WbGain ("White Balance Gain (RGB)", Color) = (1, 1, 1, 1)
        _Exposure ("Exposure", Float) = 1
        _Contrast ("Contrast", Float) = 1
        _Saturation ("Saturation", Float) = 1
    }

    SubShader
    {
        Tags { "Queue" = "Transparent+400" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

        GrabPass { "_SceneGrab" } // 메이크업까지 합성된 화면을 잡는다(_CameraFeed와 별개 이름)

        Pass
        {
            ZWrite Off
            ZTest Always
            Cull Off

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            sampler2D _SceneGrab;
            float _Intensity;
            fixed4 _WbGain;
            float _Exposure;
            float _Contrast;
            float _Saturation;

            struct appdata { float4 vertex : POSITION; };
            struct v2f
            {
                float4 pos : SV_POSITION;
                float4 grabPos : TEXCOORD0;
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.grabPos = ComputeGrabScreenPos(o.pos);
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 screenUV = i.grabPos.xy / i.grabPos.w;
                fixed3 src = tex2D(_SceneGrab, screenUV).rgb;

                fixed3 c = src * _Exposure;      // 노출(밝기)
                c *= _WbGain.rgb;                // 화이트밸런스(색온도/틴트)
                c = (c - 0.5) * _Contrast + 0.5; // 대비
                float luma = dot(c, fixed3(0.299, 0.587, 0.114));
                c = lerp(luma.xxx, c, _Saturation); // 채도
                c = saturate(c);

                return fixed4(lerp(src, c, _Intensity), 1.0);
            }
            ENDCG
        }
    }

    FallBack Off
}
