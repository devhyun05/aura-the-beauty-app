// 반반 모드 (split face) — "완성본 절반 vs 맨얼굴 절반" 비교. 메이크업 셰이더를 하나도
// 건드리지 않는다: FramePresenter가 보관한 시간 동기 무필터 원본(_SourceTex)을
// 풀스크린으로 다시 그려, 얼굴 중심축 기준 "맨얼굴 쪽 절반"에만 원본을 불투명 복원한다.
// 메이크업 쪽 절반은 알파 0이라 그대로 둔다. 경계는 SPLIT_FEATHER로 부드럽게.
//
// 중심축·모드는 전역 유니폼(SplitMaskRenderer가 프레임당 기록):
//   _SplitMode  0=전체(끔) 1=왼쪽 메이크업 2=오른쪽 메이크업
//   _SplitLine  xy=중심축 위 한 점, zw=화면 오른쪽 방향 법선(둘 다 화면 UV 공간)
//
// 큐는 메이크업(≤3022)·조명(3400) 위, 코치 가이드(4000) 아래
// (MakeupQueues.SplitMask) — 맨얼굴 쪽에는 어떤 필터 레이어도 남지 않는다.
Shader "ARMakeup/SplitMask"
{
    Properties
    {
        [HideInInspector] _SourceTex ("Unfiltered Camera Frame", 2D) = "black" {}
        [HideInInspector] _ViewportToImageU ("Viewport To Image U", Vector) = (1, 0, 0, 0)
        [HideInInspector] _ViewportToImageV ("Viewport To Image V", Vector) = (0, 1, 0, 0)
    }

    SubShader
    {
        Tags { "Queue" = "Transparent+900" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

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

            sampler2D _SourceTex;
            float4 _ViewportToImageU;
            float4 _ViewportToImageV;
            float _SplitMode;
            float4 _SplitLine; // xy=점, zw=법선(화면 오른쪽)

            #define SPLIT_FEATHER 0.012

            struct appdata { float4 vertex : POSITION; };
            struct v2f
            {
                float4 pos : SV_POSITION;
                float4 screen : TEXCOORD0; // 분할선 판정·원본 역매핑(화면 UV)
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.screen = ComputeScreenPos(o.pos);
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 vp = i.screen.xy / i.screen.w;
                float s = dot(vp - _SplitLine.xy, _SplitLine.zw); // >0 = 화면 오른쪽

                // 맨얼굴(원본 복원) 마스크: 왼쪽 메이크업(mode1)=오른쪽 복원, 오른쪽(mode2)=왼쪽 복원.
                float bare = 0.0;
                if (_SplitMode > 1.5)      bare = smoothstep(SPLIT_FEATHER, -SPLIT_FEATHER, s);
                else if (_SplitMode > 0.5) bare = smoothstep(-SPLIT_FEATHER, SPLIT_FEATHER, s);

                float3 vp1 = float3(vp, 1.0);
                float2 sourceUV = float2(
                    dot(_ViewportToImageU.xyz, vp1),
                    dot(_ViewportToImageV.xyz, vp1));
                float inBounds =
                    step(0.0, sourceUV.x) * step(sourceUV.x, 1.0) *
                    step(0.0, sourceUV.y) * step(sourceUV.y, 1.0);
                fixed3 feed = tex2D(_SourceTex, saturate(sourceUV)).rgb;
                bare *= inBounds;
                return fixed4(feed, bare);
            }
            ENDCG
        }
    }

    FallBack Off
}
