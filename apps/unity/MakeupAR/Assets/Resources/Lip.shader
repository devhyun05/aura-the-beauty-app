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
            Blend SrcAlpha OneMinusSrcAlpha

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            sampler2D _CameraFeed;
            fixed4 _LipColor;
            float _LipIntensity;

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0; // x = 반경(0 바깥→1 안쪽)
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float4 grabPos : TEXCOORD1;
            };

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

                // 바깥 경계(uv.x≈0, 피부 전환)만 소프트 페더, 나머지는 꽉 채움.
                // 안쪽(uv.x=1)은 입 라인이라 하드 경계 유지(치아 침범 방지).
                float amt = smoothstep(0.0, 0.14, i.uv.x) * _LipIntensity;

                // 루마 보존 색소 (FaceMakeup.Tint와 동일 원리)
                float luma = dot(feed, fixed3(0.299, 0.587, 0.114));
                fixed3 pigment = _LipColor.rgb * (luma * 1.5 + 0.15);

                return fixed4(pigment, amt);
            }
            ENDCG
        }
    }

    FallBack Off
}
