Shader "ARMakeup/Aegyo"
{
    Properties
    {
        _AegyoColor ("Aegyo Color", Color) = (0.95, 0.82, 0.78, 1)
        _AegyoIntensity ("Aegyo Lift", Range(0, 1)) = 0
        _AegyoShadowIntensity ("Aegyo Shadow", Range(0, 1)) = 0
        _AegyoMode ("Aegyo Mode (0 natural 1 pearl)", Float) = 0
        _AegyoShimmer ("Aegyo Pearl", Range(0, 1)) = 0
    }

    SubShader
    {
        Tags { "Queue" = "Transparent+8" "RenderType" = "Transparent" "IgnoreProjector" = "True" }
        GrabPass { "_CameraFeed" }

        Pass
        {
            ZWrite Off
            ZTest Always
            Cull Off
            Blend SrcAlpha OneMinusSrcAlpha
            Stencil { Ref 1 Comp NotEqual }

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            #include "Occlusion.cginc"

            sampler2D _CameraFeed;
            fixed4 _AegyoColor;
            float _AegyoIntensity;
            float _AegyoShadowIntensity;
            float _AegyoMode;
            float _AegyoShimmer;

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0;
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

            float Bell(float center, float width, float value)
            {
                float x = (value - center) / max(width, 1e-4);
                return exp(-2.2 * x * x);
            }

            void AegyoVerticalProfile(float vertical, out float lift, out float shadow)
            {
                lift = Bell(0.34, 0.19, vertical);
                shadow = Bell(0.69, 0.16, vertical);
                float verticalEdge = smoothstep(0.02, 0.12, vertical)
                                   * (1.0 - smoothstep(0.88, 0.99, vertical));
                lift *= verticalEdge;
                shadow *= verticalEdge;
            }

            float PearlNoise(float2 uv)
            {
                float2 cell = floor(uv * float2(46.0, 22.0));
                return frac(sin(dot(cell, float2(12.9898, 78.233))) * 43758.5453);
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 screenUV = i.grabPos.xy / i.grabPos.w;
                fixed3 feed = tex2D(_CameraFeed, screenUV).rgb;
                float luma = dot(feed, fixed3(0.299, 0.587, 0.114));

                float liftProfile;
                float shadowProfile;
                AegyoVerticalProfile(i.uv.y, liftProfile, shadowProfile);
                float horizontalEdge = smoothstep(0.0, 0.18, i.uv.x)
                                     * (1.0 - smoothstep(0.82, 1.0, i.uv.x));
                float centerVolume = lerp(0.72, 1.0, Bell(0.5, 0.42, i.uv.x));
                liftProfile *= horizontalEdge * centerVolume;
                shadowProfile *= horizontalEdge * centerVolume;

                // 실제 피부 루마·결을 출발점으로 두고 작은 screen lift와 틴트만 더한다.
                fixed3 lumaTint = _AegyoColor.rgb * (luma * 0.92 + 0.08);
                fixed3 liftTarget = lerp(feed, lumaTint, 0.32);
                liftTarget = saturate(liftTarget + (1.0 - feed) * 0.10);
                fixed3 shadowTarget = feed * lerp(fixed3(0.78, 0.72, 0.7),
                                                  _AegyoColor.rgb * 0.62, 0.25);

                float pearlMode = step(0.5, _AegyoMode);
                float pearlPoint = Bell(0.5, 0.24, i.uv.x) * Bell(0.34, 0.16, i.uv.y);
                float sparkleSeed = PearlNoise(i.uv);
                float sparkle = pearlMode * _AegyoShimmer * pearlPoint
                              * smoothstep(0.91, 0.995, sparkleSeed)
                              * (0.65 + 0.35 * sin(_Time.y * 4.0 + sparkleSeed * 18.0));
                liftTarget = saturate(liftTarget + _AegyoColor.rgb * sparkle * 0.9);

                float liftAmount = liftProfile * _AegyoIntensity;
                float shadowAmount = shadowProfile * _AegyoShadowIntensity;
                float total = liftAmount + shadowAmount;
                float alpha = saturate(total);
                fixed3 pigment = (liftTarget * liftAmount + shadowTarget * shadowAmount)
                               / max(total, 1e-4);
                return fixed4(pigment, alpha * OccludeGate(i.grabPos));
            }
            ENDCG
        }
    }
    FallBack Off
}
