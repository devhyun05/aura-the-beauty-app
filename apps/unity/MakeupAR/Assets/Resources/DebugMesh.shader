// 캘리브레이션용: 얼굴 메시를 반투명 단색으로 표시해 화면 정렬을 확인한다.
Shader "ARMakeup/DebugMesh"
{
    Properties
    {
        _Color ("Color", Color) = (1, 0, 0.8, 0.35)
        [Enum(UnityEngine.Rendering.CullMode)] _Cull ("Cull", Float) = 1 // Front (실측 확정)
    }

    SubShader
    {
        Tags { "Queue" = "Transparent" "RenderType" = "Transparent" }

        Pass
        {
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            Cull [_Cull]

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            fixed4 _Color;

            struct v2f
            {
                float4 pos : SV_POSITION;
                float fade : TEXCOORD0;
            };

            v2f vert(float4 vertex : POSITION, float2 uv1 : TEXCOORD1)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(vertex);
                o.fade = uv1.x; // 이마 연장 밴드 페이드 — 실제 효과 범위를 그대로 보여준다
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                return fixed4(_Color.rgb, _Color.a * lerp(0.15, 1.0, saturate(i.fade)));
            }
            ENDCG
        }
    }
}
