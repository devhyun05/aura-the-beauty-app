Shader "Hidden/MakeupAR/FoundationMaskWrite"
{
    // Writes the foundation coverage mask by rendering REAL world-space
    // geometry (the ARFace mesh and the neck skirt) via
    // CommandBuffer.DrawRenderer into the mask RT.
    //
    // ORIENTATION FIX: mid-camera-pass, the bound view/projection is the
    // camera's BACKBUFFER-oriented projection; redirecting to an RT does NOT
    // re-apply the platform RT y-flip (Metal), so UnityObjectToClipPos would
    // write the mask vertically inverted. We therefore bypass the GPU VP
    // state entirely: _FoundationMaskVP is set per frame from C# as
    // GL.GetGPUProjectionMatrix(camera.projectionMatrix, renderIntoTexture:
    // true) * camera.worldToCameraMatrix, which bakes the correct RT
    // convention (equivalent to negating proj[1,1] on Metal). The flipped
    // projection reverses triangle winding — Cull Off below makes that moot.
    //
    // _MaskTex:
    //   - face renderer: the calibrated canonical-UV skin mask (eyes, brows
    //     and lips excluded, hairline faded) sampled through the face UVs.
    //   - neck renderer: a vertical gradient sampled through the strip UVs.
    // BlendOp Max unions face and neck without the jaw ever doubling up.
    Properties
    {
        _MaskTex ("Mask", 2D) = "white" {}
        _MaskStrength ("Mask Strength", Range(0, 1)) = 1
        _HalfFaceMode ("Half Face Mode", Float) = 0
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" "Queue" = "Geometry" }
        Cull Off
        ZWrite Off
        ZTest Always
        BlendOp Max
        Blend One One

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            sampler2D _MaskTex;
            float _MaskStrength;
            // Half-face makeup: 0 = off (exact no-op), 1 = keep face UV x < 0.5,
            // 2 = keep x > 0.5. Zeroes the written mask on the excluded half so
            // the foundation composite (and mask-scaled skin smoothing) only
            // covers one facial half.
            float _HalfFaceMode;
            // RT-convention view-projection supplied by the compositor;
            // unity_ObjectToWorld is still set per-renderer by DrawRenderer
            // at execution time, so anchor tracking is unaffected.
            float4x4 _FoundationMaskVP;

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
            };

            v2f vert(appdata input)
            {
                v2f output;
                float4 worldPos = mul(unity_ObjectToWorld, input.vertex);
                output.pos = mul(_FoundationMaskVP, worldPos);
                output.uv = input.uv;
                return output;
            }

            fixed4 frag(v2f input) : SV_Target
            {
                // Half-face gate: multiply the written mask value by halfGate.
                // Uses input.uv.x = canonical face UV (x=0.5 centerline) for
                // the face renderer. mode 1 keeps x < 0.5, mode 2 keeps x > 0.5;
                // mode 0 (off) leaves halfGate = 1 -> exact no-op. (Note: the
                // neck strip renderer uses its own strip UVs, so its split is
                // only approximate — acceptable per the simple/consistent gate.)
                float halfGate = 1.0;
                if (_HalfFaceMode > 0.5)
                {
                    bool keepLeft = _HalfFaceMode < 1.5;
                    bool onKeptSide = keepLeft ? (input.uv.x < 0.5) : (input.uv.x > 0.5);
                    halfGate = onKeptSide ? 1.0 : 0.0;
                }

                float value = saturate(tex2D(_MaskTex, input.uv).r * _MaskStrength * halfGate);
                // Channel contract consumed by ScreenSpaceFoundation.shader:
                //   R = final foundation mask from the calibrated UV mask
                //   G = exclusion/debug inverse of the calibrated mask
                //   B = raw region weight (same as R in this UV-driven path)
                //   A = pure projected ARFace surface coverage
                return fixed4(value, saturate(1.0 - value), value, 1.0);
            }
            ENDCG
        }
    }

    FallBack Off
}
