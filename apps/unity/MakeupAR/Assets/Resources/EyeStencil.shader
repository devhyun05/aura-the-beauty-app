// 눈 열림(상·하안검) 폴리곤을 스텐실 버퍼에만 기록한다 (색/깊이 미기록).
// Iris.shader가 이 스텐실=1 영역에서만 렌더되어, 렌즈가 눈꺼풀·흰자 밖으로
// 번지지 않고 깜빡일 때 자연스럽게 사라진다 (폴리곤이 접히며 면적 0 → 가림).
Shader "ARMakeup/EyeStencil"
{
    SubShader
    {
        Tags { "Queue" = "Transparent+10" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

        Pass
        {
            ZWrite Off
            ZTest Always
            Cull Off
            ColorMask 0
            Stencil { Ref 1 Comp Always Pass Replace }

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            struct appdata { float4 vertex : POSITION; };
            struct v2f { float4 pos : SV_POSITION; };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                return o;
            }

            fixed4 frag(v2f i) : SV_Target { return 0; }
            ENDCG
        }
    }

    FallBack Off
}
