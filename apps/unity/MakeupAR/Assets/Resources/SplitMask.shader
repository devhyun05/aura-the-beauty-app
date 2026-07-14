// 반반 모드 (split face) — "완성본 절반 vs 맨얼굴 절반" 비교. 메이크업 셰이더를 하나도
// 건드리지 않는다: 모든 메이크업이 공유하는 원본 피드(_CameraFeed, 메이크업 이전 grab)를
// 풀스크린으로 다시 잡아, 얼굴 중심축 기준 "맨얼굴 쪽 절반"에만 원본을 불투명 복원한다.
// 메이크업 쪽 절반은 알파 0이라 그대로 둔다. 경계는 SPLIT_FEATHER로 부드럽게.
//
// 중심축·모드는 전역 유니폼(SplitMaskRenderer가 프레임당 기록):
//   _SplitMode  0=전체(끔) 1=왼쪽 메이크업 2=오른쪽 메이크업
//   _SplitLine  xy=중심축 위 한 점, zw=화면 오른쪽 방향 법선(둘 다 화면 UV 공간)
//
// 큐는 메이크업(≤3022) 위·조명(3400) 아래(MakeupQueues.SplitMask) — 복원된 맨얼굴도
// 조명 그레이드를 함께 받고, 코치 라인은 그 위에 남는다.
Shader "ARMakeup/SplitMask"
{
    SubShader
    {
        Tags { "Queue" = "Transparent+100" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

        GrabPass { "_CameraFeed" } // 메이크업 이전 원본(FaceMakeup가 먼저 grab → 재사용)

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

            sampler2D _CameraFeed;
            float _SplitMode;
            float4 _SplitLine; // xy=점, zw=법선(화면 오른쪽)

            #define SPLIT_FEATHER 0.012

            struct appdata { float4 vertex : POSITION; };
            struct v2f
            {
                float4 pos : SV_POSITION;
                float4 grab : TEXCOORD0;   // _CameraFeed 샘플
                float4 screen : TEXCOORD1; // 분할선 판정(화면 UV)
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.grab = ComputeGrabScreenPos(o.pos);
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

                fixed3 feed = tex2D(_CameraFeed, i.grab.xy / i.grab.w).rgb;
                return fixed4(feed, bare);
            }
            ENDCG
        }
    }

    FallBack Off
}
