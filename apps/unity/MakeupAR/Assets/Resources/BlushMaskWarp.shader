Shader "Hidden/ARMakeup/BlushMaskWarp"
{
    Properties
    {
        _MainTex ("Mask", 2D) = "black" {}
    }

    SubShader
    {
        Cull Off ZWrite Off ZTest Always

        Pass
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            #include "UnityCG.cginc"

            sampler2D _MainTex;
            float4 _WarpRight0;
            float4 _WarpRight1;
            float4 _WarpLeft0;
            float4 _WarpLeft1;

            float ReadControl(float4 lower, float4 upper, int index)
            {
                if (index == 0) return lower.x;
                if (index == 1) return lower.y;
                if (index == 2) return lower.z;
                if (index == 3) return lower.w;
                if (index == 4) return upper.x;
                if (index == 5) return upper.y;
                if (index == 6) return upper.z;
                return upper.w;
            }

            float SampleProfile(float4 lower, float4 upper, float t)
            {
                float position = frac(t) * 8.0;
                int lo = (int)floor(position);
                int hi = lo == 7 ? 0 : lo + 1;
                return lerp(ReadControl(lower, upper, lo),
                            ReadControl(lower, upper, hi), frac(position));
            }

            fixed4 frag(v2f_img input) : SV_Target
            {
                bool anatomicalLeft = input.uv.x < 0.5;
                float2 center = anatomicalLeft ? float2(0.277, 0.468) : float2(0.723, 0.468);
                float2 delta = input.uv - center;
                float t = atan2(delta.y, delta.x) / (UNITY_PI * 2.0);
                if (t < 0.0) t += 1.0;
                float amount = anatomicalLeft
                    ? SampleProfile(_WarpLeft0, _WarpLeft1, t)
                    : SampleProfile(_WarpRight0, _WarpRight1, t);
                float2 sourceUv = center + delta / max(0.8, 1.0 + amount);
                return tex2D(_MainTex, sourceUv);
            }
            ENDCG
        }
    }
}
