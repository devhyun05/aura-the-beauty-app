using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

/// <summary>
/// Screen-space foundation compositor for the Built-in Render Pipeline.
///
/// Final architecture — everything happens INSIDE the AR camera's own
/// render via one CommandBuffer at CameraEvent.BeforeForwardAlpha:
///
///   1. SetRenderTarget(maskRT) + Clear
///   2. DrawRenderer(face mask renderer)   — ARFace mesh, world space
///   3. DrawRenderer(neck mask renderer)   — jawline-extruded skirt
///   4. Blit(composite material -> CameraTarget)
///
/// Because CommandBuffer.DrawRenderer executes with the AR camera's FINAL
/// view/projection matrices (including any before-render IMU pose update),
/// the mask is synchronized with the rendered frame by construction — for
/// rotation AND translation. No helper camera, no matrix copying, no manual
/// Camera.Render() (which is unsupported mid-render and fails silently on
/// Metal). This removes the tilt-induced vertical slip that survived every
/// matrix-copy approach.
///
/// ARKit's face-anchor lag and any calibration offset are compensated in
/// the SAMPLING step instead: the composite shader offsets/scales the mask
/// lookup by an EMA-predicted shift plus the Vision-measured bias/scale.
/// </summary>
public sealed class FoundationScreenSpaceCompositor : MonoBehaviour
{
    private const int MaskLayer = 31;
    private const int MaskBaseWidth = 384;

    // Temporal smoothing of the face-local vertices. ARKit face vertices
    // carry per-frame estimation noise that shows up as silhouette
    // trembling along the mask edge (jaw, temples). The POSE (transform)
    // is never smoothed — rigid tracking stays exact — only the local
    // deformation is low-passed. 0.35 settles in ~2-3 frames: invisible
    // on real expressions, kills the shimmer.
    private const float VertexSmoothing = 0.35f;
    private const CameraEvent CompositeEvent = CameraEvent.BeforeForwardAlpha;
    private const string CommandBufferName = "FoundationScreenSpaceComposite";
    private const float DiagnosticsIntervalSeconds = 0.75f;

    // Anchor-lag compensation.
    private const float MotionPredictionFrames = 4.0f;
    private const float MotionPredictionMaxUvShift = 0.065f;
    private const float VelocitySmoothing = 0.45f;
    private const float VisionBiasSmoothing = 0.35f;
    private const float VisionBiasMaxUvShift = 0.055f;
    private const long VisionMatchMaxAgeMs = 450;
    // Must span the Vision capture+inference latency (~150-300ms).
    private const int ProjectionHistoryCapacity = 24;

    // Neck skirt geometry (face-local space, relative to face height).
    private const int NeckColumns = 24;
    private const int NeckMinColumns = 8;
    private const float NeckLengthFaceHeightFactor = 0.38f;
    private const float NeckTaper = 0.88f;
    private const float NeckBackOffsetMeters = 0.02f;

    // Orientation is now deterministic at the WRITE side: the mask-write
    // shader receives _FoundationMaskVP built with GL.GetGPUProjectionMatrix
    // (renderIntoTexture: true), so the RT always stores GL-convention
    // content (v=0 = bottom) regardless of the GPU state mid-camera-pass.
    // Sampling therefore needs NO flip. Runtime A/B without rebuilding:
    // foundation debug mode 8 ("방향반전") inverts this in the shader.
    private const bool MaskSampleFlipY = false;

    private RenderTexture maskTexture;
    private Material maskWriteFaceMaterial;
    private Material maskWriteNeckMaterial;
    private Material compositeMaterial;
    private Texture2D neckGradientTexture;

    // Milestone 1 — screen-space lip coverage. A SECOND mask RT (higher res
    // than the foundation mask so the lip edge stays crisp) written by a second
    // FoundationMaskWrite material whose _MaskTex is the baked lip region mask.
    // Reuses the SAME faceMaskRenderer/ARFace mesh — only the material + RT are
    // new. Bound to the composite material as _LipMaskTex; the composite shader
    // reads it in ApplyLipTint. All lip resources are null-guarded.
    private const int LipMaskWidth = 768;
    private const int LipMaskHeight = 1024;
    private RenderTexture lipMaskTexture;
    private Material maskWriteLipMaterial;

    public Texture LipMaskTexture => lipMaskTexture;

    private GameObject faceMaskObject;
    private MeshRenderer faceMaskRenderer;
    private Mesh faceMaskMesh;
    private GameObject neckMaskObject;
    private MeshRenderer neckMaskRenderer;
    private Mesh neckMaskMesh;

    private Camera boundCamera;
    private CommandBuffer compositeCommandBuffer;
    private bool compositeAttached;
    private bool faceMeshReadyThisFrame;
    private bool loggedMaskVpDiagnostics;
    private float nextDiagnosticsLogAt;
    private string lastMaskWriteTransformMode = "default_rt_flip";

    private Vector2 previousFaceCenterUv;
    private bool hasPreviousFaceCenterUv;
    private Vector2 smoothedVelocityUv;
    private Vector2 visionBiasUv;
    private bool hasVisionBias;
    private float visionScaleY = 1.0f;
    private readonly long[] historyTimesMs = new long[ProjectionHistoryCapacity];
    private readonly Vector2[] historyCenters = new Vector2[ProjectionHistoryCapacity];
    private readonly float[] historyHalfHeights = new float[ProjectionHistoryCapacity];
    private int historyCount;
    private int historyNext;

    private readonly List<Vector3> meshVertices = new List<Vector3>(1280);
    private readonly List<Vector2> meshUvs = new List<Vector2>(1280);
    private readonly List<int> meshTriangles = new List<int>(4096);
    private Vector3[] smoothedVertices;
    private TrackableId smoothedFaceId;

    // Camera-pose timing offset for the mask projection, selectable at
    // runtime through the foundation debug mode so the right value can be
    // found LIVE on device without a rebuild per guess:
    //   default       : 0     — current camera matrix (geometry-locked)
    //   debug mode 40 : +55ms — PAST pose; pick if the mask LEADS the face
    //                            while the phone moves
    //   debug mode 41 : -35ms — extrapolated FUTURE pose; pick if the mask
    //                            TRAILS the face
    //   debug mode 42 : +90ms — stronger past-pose variant
    // (25-30 are taken by the mask clip-transform probes.)
    // Once a winner is confirmed on device, hardcode it as the default.
    private const int PoseHistoryCapacity = 16;
    private readonly float[] poseHistoryTimes = new float[PoseHistoryCapacity];
    private readonly Vector3[] poseHistoryPositions = new Vector3[PoseHistoryCapacity];
    private readonly Quaternion[] poseHistoryRotations = new Quaternion[PoseHistoryCapacity];
    private int poseHistoryCount;
    private int poseHistoryNext;
    private float activeMaskPoseDelaySeconds;

    private static float ResolveMaskPoseDelaySeconds(int debugMode)
    {
        switch (debugMode)
        {
            case 40:
                return 0.055f;
            case 41:
                return -0.035f;
            case 42:
                return 0.09f;
            default:
                return 0.0f;
        }
    }

    public bool MaskReady { get; private set; }
    public Texture MaskTexture => maskTexture;

    private void OnDestroy()
    {
        DetachCommandBuffer();
        if (maskTexture != null)
        {
            maskTexture.Release();
            Destroy(maskTexture);
        }

        if (lipMaskTexture != null)
        {
            lipMaskTexture.Release();
            Destroy(lipMaskTexture);
        }
    }

    /// <summary>
    /// Called by the controller every frame the screen-space foundation is
    /// active. Updates the world-space mask geometry, the sampling
    /// compensation uniforms and (re)attaches the command buffer.
    /// </summary>
    public bool UpdateCompositor(
        Camera arCamera,
        ARFace face,
        Material foundationCompositeMaterial,
        Texture2D uvSkinMask)
    {
        if (arCamera == null
            || face == null
            || face.trackingState != TrackingState.Tracking
            || foundationCompositeMaterial == null)
        {
            Deactivate();
            return false;
        }

        compositeMaterial = foundationCompositeMaterial;
        // The mask meshes live on a dedicated layer that the AR camera must
        // never draw directly; only our command buffer references them.
        if ((arCamera.cullingMask & (1 << MaskLayer)) != 0)
        {
            arCamera.cullingMask &= ~(1 << MaskLayer);
        }

        EnsureResources();
        if (maskTexture == null
            || maskWriteFaceMaterial == null
            || faceMaskRenderer == null)
        {
            Deactivate();
            return false;
        }

        UpdateMotionPrediction(arCamera, face);
        if (uvSkinMask != null)
        {
            maskWriteFaceMaterial.SetTexture("_MaskTex", uvSkinMask);
        }

        // Deterministic RT-convention view-projection for the mask write.
        // GetGPUProjectionMatrix(_, true) bakes the platform RT y-flip
        // (negates proj[1,1] on Metal); mid-pass SetRenderTarget does NOT do
        // this, which is exactly what rendered the mask upside down.
        // Refreshed every frame (TrackedPoseDriver is forced Update-only, so
        // the Update-time pose equals the render-time pose).
        int debugMode = compositeMaterial != null && compositeMaterial.HasProperty("_FoundationDebugMode")
            ? Mathf.RoundToInt(compositeMaterial.GetFloat("_FoundationDebugMode"))
            : 0;
        bool renderIntoTexture = ResolveMaskProjectionUsesRtFlip(debugMode);
        Matrix4x4 gpuProjection = GL.GetGPUProjectionMatrix(arCamera.projectionMatrix, renderIntoTexture);
        Matrix4x4 maskVp =
            ResolveMaskClipTransform(debugMode)
            * gpuProjection
            * ResolveDelayedWorldToCamera(arCamera, ResolveMaskPoseDelaySeconds(debugMode));
        lastMaskWriteTransformMode = ResolveMaskWriteTransformMode(debugMode, renderIntoTexture);
        maskWriteFaceMaterial.SetMatrix("_FoundationMaskVP", maskVp);
        maskWriteNeckMaterial.SetMatrix("_FoundationMaskVP", maskVp);
        // Lip mask-write uses the SAME RT-convention VP (drawn with the same
        // ARFace mesh). Refresh its _MaskTex too in case the baked lip mask
        // loaded after material creation (lazy Resources.Load) or the tracked
        // face changed. Null-guarded throughout.
        if (maskWriteLipMaterial != null)
        {
            maskWriteLipMaterial.SetMatrix("_FoundationMaskVP", maskVp);
            Texture2D lipRegionMask = E3RegionMaskOverlay.GetSharedLipRegionMask();
            // Fail-safe: FoundationMaskWrite's _MaskTex defaults to "white", so an
            // unset mask paints the WHOLE face. Fall back to black (no lip).
            maskWriteLipMaterial.SetTexture(
                "_MaskTex", lipRegionMask != null ? (Texture)lipRegionMask : Texture2D.blackTexture);
        }
        // Forward the half-face flag from the composite material (set by
        // ScreenSpaceFoundationController) onto BOTH mask-write materials.
        // FoundationMaskWrite.frag zeroes the written value on the excluded
        // half, so the foundation composite (and its skin smoothing, which
        // scales with the mask) only affects one facial half. Mirrors the
        // _FoundationDebugMode read above; 0 (off) is an exact no-op.
        float halfFaceMode = compositeMaterial != null && compositeMaterial.HasProperty("_HalfFaceMode")
            ? compositeMaterial.GetFloat("_HalfFaceMode")
            : 0.0f;
        maskWriteFaceMaterial.SetFloat("_HalfFaceMode", halfFaceMode);
        maskWriteNeckMaterial.SetFloat("_HalfFaceMode", halfFaceMode);
        // Half-face for the lip: FoundationMaskWrite.frag zeroes the excluded
        // half by canonical face UV, so the lip mask itself carries the split
        // (the composite passes halfGate=1 to ApplyLipTint to avoid double-
        // gating). 0 (off) is an exact no-op.
        if (maskWriteLipMaterial != null)
        {
            maskWriteLipMaterial.SetFloat("_HalfFaceMode", halfFaceMode);
        }
        if (!loggedMaskVpDiagnostics)
        {
            loggedMaskVpDiagnostics = true;
            Debug.Log(
                "[FoundationScreenSpace] mask_vp_diagnostics"
                + " proj11=" + arCamera.projectionMatrix.m11.ToString("0.####")
                + " gpuProj11=" + gpuProjection.m11.ToString("0.####")
                + " yFlipBaked=" + (Mathf.Sign(gpuProjection.m11) != Mathf.Sign(arCamera.projectionMatrix.m11)).ToString().ToLowerInvariant()
                + " viewDet=" + arCamera.worldToCameraMatrix.determinant.ToString("0.####")
                + " sampleFlipY=" + (MaskSampleFlipY ? "1" : "0")
                + " maskWriteTransform=" + lastMaskWriteTransformMode);
        }

        UpdateSmoothedVertices(face);
        faceMeshReadyThisFrame = UpdateFaceMaskMesh(face);
        bool neckReady = UpdateNeckMaskMesh(face);
        faceMaskObject.SetActive(true);
        neckMaskObject.SetActive(true);
        if (!neckReady && neckMaskMesh != null)
        {
            neckMaskMesh.Clear();
        }

        if (!faceMeshReadyThisFrame)
        {
            Deactivate();
            return false;
        }

        AttachCommandBuffer(arCamera);

        // Geometry-locked sampling: the mask is drawn inside this camera's
        // own render pass, so it is already synchronized with the frame by
        // construction. Sampling-side corrections (velocity shift, Vision
        // vertical rescale) move an aligned mask AWAY from the face — the
        // Vision scale in particular is measured against 150-300ms-old
        // observations and rescales around a per-frame pivot, which made the
        // mask visibly swim while the phone moved. Shift and scale both stay
        // identity; visionScaleY is still measured for diagnostics only.
        Vector2 shift = ComputeTotalShiftUv();
        compositeMaterial.SetTexture("_SkinMaskTex", maskTexture);
        // Bind the screen-space lip coverage RT for ApplyLipTint. Guarded: only
        // bound when both the RT and the lip mask-write material exist, so a
        // missing lip asset leaves the composite lip disabled (the shader also
        // early-outs on _LipEnabled and a near-zero mask).
        if (lipMaskTexture != null && maskWriteLipMaterial != null)
        {
            compositeMaterial.SetTexture("_LipMaskTex", lipMaskTexture);
        }
        compositeMaterial.SetFloat("_ScreenSpaceUvFlip", MaskSampleFlipY ? 1.0f : 0.0f);
        compositeMaterial.SetVector(
            "_MaskSampleShift",
            new Vector4(shift.x, shift.y, 0.0f, 0.0f));
        compositeMaterial.SetFloat("_MaskSampleScaleY", 1.0f);
        compositeMaterial.SetFloat(
            "_MaskFaceCenterY",
            hasPreviousFaceCenterUv ? previousFaceCenterUv.y : 0.5f);

        MaskReady = true;
        MaybeLogDiagnostics(shift);
        return true;
    }

    public void Deactivate()
    {
        MaskReady = false;
        faceMeshReadyThisFrame = false;
        hasPreviousFaceCenterUv = false;
        smoothedVelocityUv = Vector2.zero;
        visionBiasUv = Vector2.zero;
        hasVisionBias = false;
        visionScaleY = 1.0f;
        historyCount = 0;
        historyNext = 0;
        smoothedVertices = null;
        poseHistoryCount = 0;
        poseHistoryNext = 0;
        if (faceMaskObject != null)
        {
            faceMaskObject.SetActive(false);
        }

        if (neckMaskObject != null)
        {
            neckMaskObject.SetActive(false);
        }

        DetachCommandBuffer();
    }

    public void ApplyVisionFaceObservation(
        long detectedAtMs,
        Vector2 centerPx,
        Vector2 sizePx,
        float width,
        float height)
    {
        if (width <= 1.0f || height <= 1.0f || historyCount == 0)
        {
            return;
        }

        long bestAge = long.MaxValue;
        int bestIndex = -1;
        for (int i = 0; i < historyCount; i++)
        {
            long age = System.Math.Abs(detectedAtMs - historyTimesMs[i]);
            if (age < bestAge)
            {
                bestAge = age;
                bestIndex = i;
            }
        }

        if (bestIndex < 0 || bestAge > VisionMatchMaxAgeMs)
        {
            return;
        }

        Vector2 projectedCenterUv = historyCenters[bestIndex];

        // The Vision y-axis convention is ambiguous ("raw-y"); evaluate both
        // and keep the candidate closer to the projection recorded at
        // capture time so a vertical convention error is impossible.
        float u = Mathf.Clamp01(centerPx.x / width);
        Vector2 candidateA = new Vector2(u, Mathf.Clamp01(centerPx.y / height));
        Vector2 candidateB = new Vector2(u, Mathf.Clamp01(1.0f - centerPx.y / height));
        Vector2 biasA = candidateA - projectedCenterUv;
        Vector2 biasB = candidateB - projectedCenterUv;
        Vector2 bias = biasA.sqrMagnitude <= biasB.sqrMagnitude ? biasA : biasB;
        bias.x = Mathf.Clamp(bias.x, -VisionBiasMaxUvShift, VisionBiasMaxUvShift);
        bias.y = Mathf.Clamp(bias.y, -VisionBiasMaxUvShift, VisionBiasMaxUvShift);
        visionBiasUv = hasVisionBias
            ? Vector2.Lerp(visionBiasUv, bias, VisionBiasSmoothing)
            : bias;
        hasVisionBias = true;

        // Vertical scale correction: a mismatch between the camera image's
        // vertical crop and the projection FOV makes the mask slide as the
        // face moves up/down (position-dependent, unfixable by time sync).
        float projectedHalfHeight = historyHalfHeights[bestIndex];
        float visionHalfHeight = sizePx.y * 0.5f / height;
        if (projectedHalfHeight > 0.01f && visionHalfHeight > 0.01f)
        {
            float scale = Mathf.Clamp(visionHalfHeight / projectedHalfHeight, 0.85f, 1.2f);
            visionScaleY = Mathf.Lerp(visionScaleY, scale, VisionBiasSmoothing);
        }
    }

    private Vector2 ComputeTotalShiftUv()
    {
        // The compositor draws the ARFace mesh inside the AR camera render
        // pass, so adding a sampling-side velocity/bias correction here can
        // move an already-synchronized mask away from the real face. Keep this
        // path geometry-locked first; if a device later proves a consistent
        // image/anchor bias, reintroduce it as an explicit opt-in calibration.
        return Vector2.zero;
    }

    private void UpdateMotionPrediction(Camera arCamera, ARFace face)
    {
        Vector3 viewport = arCamera.WorldToViewportPoint(face.transform.position);
        if (viewport.z <= arCamera.nearClipPlane)
        {
            hasPreviousFaceCenterUv = false;
            smoothedVelocityUv = Vector2.zero;
            return;
        }

        Vector2 centerUv = new Vector2(Mathf.Clamp01(viewport.x), Mathf.Clamp01(viewport.y));
        if (hasPreviousFaceCenterUv)
        {
            Vector2 velocity = centerUv - previousFaceCenterUv;
            smoothedVelocityUv = Vector2.Lerp(smoothedVelocityUv, velocity, VelocitySmoothing);
        }
        else
        {
            smoothedVelocityUv = Vector2.zero;
        }

        previousFaceCenterUv = centerUv;
        hasPreviousFaceCenterUv = true;

        float projectedHalfHeight = 0.0f;
        Vector3 upViewport = arCamera.WorldToViewportPoint(
            face.transform.position + face.transform.up * 0.075f);
        if (upViewport.z > arCamera.nearClipPlane)
        {
            projectedHalfHeight = Mathf.Abs(upViewport.y - viewport.y);
        }

        // Same clock as Vision's DetectedAtMs (Unix epoch ms) — mixing
        // clocks silently disables the Vision correction.
        long nowMs = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        historyTimesMs[historyNext] = nowMs;
        historyCenters[historyNext] = centerUv;
        historyHalfHeights[historyNext] = projectedHalfHeight;
        historyNext = (historyNext + 1) % ProjectionHistoryCapacity;
        historyCount = Mathf.Min(historyCount + 1, ProjectionHistoryCapacity);
    }

    // ---- Command buffer -----------------------------------------------------

    private void AttachCommandBuffer(Camera arCamera)
    {
        if (compositeAttached && boundCamera == arCamera)
        {
            return;
        }

        DetachCommandBuffer();
        boundCamera = arCamera;
        if (compositeCommandBuffer == null)
        {
            compositeCommandBuffer = new CommandBuffer { name = CommandBufferName };
        }

        // Recorded once; DrawRenderer resolves transforms and mesh contents
        // at EXECUTION time with the AR camera's final matrices, so the mask
        // is inherently synchronized with the rendered frame.
        compositeCommandBuffer.Clear();
        compositeCommandBuffer.SetRenderTarget(maskTexture);
        compositeCommandBuffer.ClearRenderTarget(false, true, Color.clear);
        compositeCommandBuffer.DrawRenderer(faceMaskRenderer, maskWriteFaceMaterial, 0, 0);
        compositeCommandBuffer.DrawRenderer(neckMaskRenderer, maskWriteNeckMaterial, 0, 0);
        // Screen-space lip coverage pass (Milestone 1): draw the SAME live
        // ARFace mesh with the lip mask-write material into the dedicated lip
        // RT. Ordered AFTER the foundation face/neck draws and BEFORE the
        // camera-target blit so the composite material reads a fully-written
        // _LipMaskTex this frame. Guarded so a missing lip RT/material skips
        // the pass entirely (the foundation pipeline is untouched).
        if (lipMaskTexture != null && maskWriteLipMaterial != null)
        {
            compositeCommandBuffer.SetRenderTarget(lipMaskTexture);
            compositeCommandBuffer.ClearRenderTarget(false, true, Color.clear);
            compositeCommandBuffer.DrawRenderer(faceMaskRenderer, maskWriteLipMaterial, 0, 0);
        }

        compositeCommandBuffer.SetRenderTarget(BuiltinRenderTextureType.CameraTarget);
        compositeCommandBuffer.Blit(
            null,
            BuiltinRenderTextureType.CameraTarget,
            compositeMaterial);
        arCamera.AddCommandBuffer(CompositeEvent, compositeCommandBuffer);
        compositeAttached = true;
        Debug.Log(
            "[FoundationScreenSpace] composite_command_buffer_attached"
            + " event=" + CompositeEvent
            + " mode=draw_renderer_in_camera_pass");
    }

    private void MaybeLogDiagnostics(Vector2 shift)
    {
        if (Time.unscaledTime < nextDiagnosticsLogAt)
        {
            return;
        }

        nextDiagnosticsLogAt = Time.unscaledTime + DiagnosticsIntervalSeconds;
        int vertexCount = faceMaskMesh != null ? faceMaskMesh.vertexCount : 0;
        int triangleCount = faceMaskMesh != null ? faceMaskMesh.triangles.Length / 3 : 0;
        float debugMode = compositeMaterial != null && compositeMaterial.HasProperty("_FoundationDebugMode")
            ? compositeMaterial.GetFloat("_FoundationDebugMode")
            : -1.0f;
        float activeRendererMode = compositeMaterial != null && compositeMaterial.HasProperty("_FoundationActiveRendererMode")
            ? compositeMaterial.GetFloat("_FoundationActiveRendererMode")
            : -1.0f;
        Debug.Log(
            "[FoundationScreenSpaceCompositor]"
            + " active=true"
            + " attached=" + compositeAttached.ToString().ToLowerInvariant()
            + " event=" + CompositeEvent
            + " debugMode=" + debugMode.ToString("0")
            + " activeRendererMode=" + activeRendererMode.ToString("0.###")
            + " compositeShader="
            + (compositeMaterial != null && compositeMaterial.shader != null
                ? compositeMaterial.shader.name
                : "none")
            + " maskWriteShader="
            + (maskWriteFaceMaterial != null && maskWriteFaceMaterial.shader != null
                ? maskWriteFaceMaterial.shader.name
                : "none")
            + " maskResolution=" + (maskTexture != null ? maskTexture.width : 0)
            + "x"
            + (maskTexture != null ? maskTexture.height : 0)
            + " faceMeshReady=" + faceMeshReadyThisFrame.ToString().ToLowerInvariant()
            + " vertices=" + vertexCount
            + " triangles=" + triangleCount
            + " shift=" + shift.x.ToString("0.####") + "," + shift.y.ToString("0.####")
            + " visionBias=" + (hasVisionBias ? "true" : "false")
            + " scaleY=" + visionScaleY.ToString("0.###")
            + " poseDelay=" + activeMaskPoseDelaySeconds.ToString("0.###")
            + " sampleFlipY=" + (MaskSampleFlipY ? "true" : "false")
            + " maskWriteTransform=" + lastMaskWriteTransformMode);
    }

    private static bool ResolveMaskProjectionUsesRtFlip(int debugMode)
    {
        // Mode 25 intentionally disables GL's RT projection flip so we can
        // prove whether the mask is inverted at write time or only at sample
        // time. Other source-side probes keep the normal RT projection and add
        // explicit clip-space transforms below.
        return debugMode != 25;
    }

    private static string ResolveMaskWriteTransformMode(int debugMode, bool renderIntoTexture)
    {
        switch (debugMode)
        {
            case 25:
                return "source_no_rt_flip";
            case 26:
                return "source_flip_x";
            case 27:
                return "source_flip_y";
            case 28:
                return "source_rotate_180";
            case 29:
                return "source_rotate_90_cw";
            case 30:
                return "source_rotate_90_ccw";
            default:
                return renderIntoTexture ? "default_rt_flip" : "default_no_rt_flip";
        }
    }

    private static Matrix4x4 ResolveMaskClipTransform(int debugMode)
    {
        switch (debugMode)
        {
            case 26:
                return ClipTransform(-1.0f, 0.0f, 0.0f, 1.0f);
            case 27:
                return ClipTransform(1.0f, 0.0f, 0.0f, -1.0f);
            case 28:
                return ClipTransform(-1.0f, 0.0f, 0.0f, -1.0f);
            case 29:
                // x' = y, y' = -x
                return ClipTransform(0.0f, 1.0f, -1.0f, 0.0f);
            case 30:
                // x' = -y, y' = x
                return ClipTransform(0.0f, -1.0f, 1.0f, 0.0f);
            default:
                return Matrix4x4.identity;
        }
    }

    private static Matrix4x4 ClipTransform(float m00, float m01, float m10, float m11)
    {
        Matrix4x4 matrix = Matrix4x4.identity;
        matrix.m00 = m00;
        matrix.m01 = m01;
        matrix.m10 = m10;
        matrix.m11 = m11;
        return matrix;
    }

    private void DetachCommandBuffer()
    {
        if (!compositeAttached)
        {
            return;
        }

        if (boundCamera != null && compositeCommandBuffer != null)
        {
            boundCamera.RemoveCommandBuffer(CompositeEvent, compositeCommandBuffer);
        }

        compositeAttached = false;
    }

    // ---- Resources ------------------------------------------------------------

    private void EnsureResources()
    {
        int width = MaskBaseWidth;
        int height = Mathf.Clamp(
            Mathf.RoundToInt(width * Mathf.Max(1.0f, Screen.height) / Mathf.Max(1.0f, Screen.width)),
            192,
            512);
        if (maskTexture == null || maskTexture.width != width || maskTexture.height != height)
        {
            // The command buffer references the RT by handle; force a
            // re-record whenever the texture is recreated.
            DetachCommandBuffer();
            if (maskTexture != null)
            {
                maskTexture.Release();
                Destroy(maskTexture);
            }

            // Always 4-channel: the composite shader reads .r/.g/.b/.a with
            // distinct meanings and the orientation probes read .r; a
            // single-channel RT (R16) makes .a sample as constant 1.0, which
            // breaks the surface debug view and the probes.
            maskTexture = new RenderTexture(width, height, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.Linear)
            {
                name = "FoundationScreenSpaceMask",
                filterMode = FilterMode.Bilinear,
                wrapMode = TextureWrapMode.Clamp,
                useMipMap = false,
                autoGenerateMips = false
            };
            maskTexture.Create();
        }

        // Screen-space lip coverage RT (Milestone 1). Higher-res than the
        // foundation mask so the lip silhouette reads crisply. ARGB32/Linear,
        // bilinear/clamp, no mips — same conventions as the foundation mask.
        // Recreated only if missing (fixed size, so no per-frame reallocation).
        if (lipMaskTexture == null)
        {
            DetachCommandBuffer();
            lipMaskTexture = new RenderTexture(
                LipMaskWidth, LipMaskHeight, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.Linear)
            {
                name = "FoundationScreenSpaceLipMask",
                filterMode = FilterMode.Bilinear,
                wrapMode = TextureWrapMode.Clamp,
                useMipMap = false,
                autoGenerateMips = false
            };
            lipMaskTexture.Create();
        }

        if (maskWriteFaceMaterial == null)
        {
            Shader writeShader = Resources.Load<Shader>("FoundationMaskWrite")
                ?? Shader.Find("Hidden/MakeupAR/FoundationMaskWrite");
            if (writeShader != null)
            {
                maskWriteFaceMaterial = new Material(writeShader) { name = "FoundationMaskWriteFace" };
                maskWriteNeckMaterial = new Material(writeShader) { name = "FoundationMaskWriteNeck" };
                maskWriteNeckMaterial.SetTexture("_MaskTex", GetNeckGradientTexture());
                // Second mask-write material for the lip coverage; _MaskTex is
                // the baked lip region mask (canonical UV). Null-guarded: if the
                // asset failed validation the material simply writes nothing.
                maskWriteLipMaterial = new Material(writeShader) { name = "FoundationMaskWriteLip" };
                Texture2D lipRegionMask = E3RegionMaskOverlay.GetSharedLipRegionMask();
                // Fail-safe: _MaskTex defaults to "white" (would paint the WHOLE
                // face); fall back to black (no lip) if the mask is null.
                maskWriteLipMaterial.SetTexture(
                    "_MaskTex", lipRegionMask != null ? (Texture)lipRegionMask : Texture2D.blackTexture);
            }
        }

        if (faceMaskObject == null && maskWriteFaceMaterial != null)
        {
            faceMaskMesh = new Mesh { name = "Foundation Face Mask Mesh" };
            faceMaskMesh.MarkDynamic();
            faceMaskObject = CreateMaskRendererObject(
                "Foundation Face Mask",
                maskWriteFaceMaterial,
                faceMaskMesh,
                out faceMaskRenderer);
            neckMaskMesh = new Mesh { name = "Foundation Neck Mask Mesh" };
            neckMaskMesh.MarkDynamic();
            neckMaskObject = CreateMaskRendererObject(
                "Foundation Neck Mask",
                maskWriteNeckMaterial,
                neckMaskMesh,
                out neckMaskRenderer);
        }
    }

    private static GameObject CreateMaskRendererObject(
        string name,
        Material material,
        Mesh mesh,
        out MeshRenderer renderer)
    {
        GameObject rendererObject = new GameObject(name)
        {
            layer = MaskLayer
        };
        MeshFilter filter = rendererObject.AddComponent<MeshFilter>();
        filter.sharedMesh = mesh;
        renderer = rendererObject.AddComponent<MeshRenderer>();
        renderer.sharedMaterial = material;
        renderer.shadowCastingMode = ShadowCastingMode.Off;
        renderer.receiveShadows = false;
        renderer.allowOcclusionWhenDynamic = false;
        rendererObject.SetActive(false);
        return rendererObject;
    }

    // Records the current camera pose every frame and returns the
    // world-to-camera matrix for the mask write pass, shifted by
    // delaySeconds: positive = interpolate a PAST pose, negative =
    // extrapolate a FUTURE pose from the latest velocity, 0 = current.
    private Matrix4x4 ResolveDelayedWorldToCamera(Camera arCamera, float delaySeconds)
    {
        Transform cameraTransform = arCamera.transform;
        activeMaskPoseDelaySeconds = delaySeconds;

        // Always record, so switching debug modes has warm history.
        float now = Time.realtimeSinceStartup;
        poseHistoryTimes[poseHistoryNext] = now;
        poseHistoryPositions[poseHistoryNext] = cameraTransform.position;
        poseHistoryRotations[poseHistoryNext] = cameraTransform.rotation;
        poseHistoryNext = (poseHistoryNext + 1) % PoseHistoryCapacity;
        poseHistoryCount = Mathf.Min(poseHistoryCount + 1, PoseHistoryCapacity);

        if (Mathf.Abs(delaySeconds) <= 0.0001f)
        {
            return arCamera.worldToCameraMatrix;
        }

        if (delaySeconds < 0.0f)
        {
            return ExtrapolatedWorldToCamera(arCamera, -delaySeconds);
        }

        float targetTime = now - delaySeconds;
        int olderIndex = -1;
        int newerIndex = -1;
        float olderTime = float.NegativeInfinity;
        float newerTime = float.PositiveInfinity;
        int oldestIndex = -1;
        float oldestTime = float.PositiveInfinity;
        for (int i = 0; i < poseHistoryCount; i++)
        {
            float sampleTime = poseHistoryTimes[i];
            if (sampleTime < oldestTime)
            {
                oldestTime = sampleTime;
                oldestIndex = i;
            }

            if (sampleTime <= targetTime && sampleTime > olderTime)
            {
                olderTime = sampleTime;
                olderIndex = i;
            }

            if (sampleTime >= targetTime && sampleTime < newerTime)
            {
                newerTime = sampleTime;
                newerIndex = i;
            }
        }

        Vector3 position;
        Quaternion rotation;
        if (olderIndex >= 0 && newerIndex >= 0 && newerIndex != olderIndex)
        {
            float span = Mathf.Max(newerTime - olderTime, 1e-5f);
            float blend = Mathf.Clamp01((targetTime - olderTime) / span);
            position = Vector3.Lerp(
                poseHistoryPositions[olderIndex], poseHistoryPositions[newerIndex], blend);
            rotation = Quaternion.Slerp(
                poseHistoryRotations[olderIndex], poseHistoryRotations[newerIndex], blend);
        }
        else if (olderIndex >= 0)
        {
            position = poseHistoryPositions[olderIndex];
            rotation = poseHistoryRotations[olderIndex];
        }
        else if (oldestIndex >= 0)
        {
            // History shallower than the delay (warm-up): oldest we have.
            position = poseHistoryPositions[oldestIndex];
            rotation = poseHistoryRotations[oldestIndex];
        }
        else
        {
            position = cameraTransform.position;
            rotation = cameraTransform.rotation;
        }

        return BuildWorldToCamera(position, rotation);
    }

    // Predicts the camera pose leadSeconds into the future from the two most
    // recent samples (linear velocity + angular velocity). Used when the mask
    // TRAILS the face during motion, i.e. the anchor lags the image.
    private Matrix4x4 ExtrapolatedWorldToCamera(Camera arCamera, float leadSeconds)
    {
        if (poseHistoryCount < 2)
        {
            return arCamera.worldToCameraMatrix;
        }

        int newest = (poseHistoryNext - 1 + PoseHistoryCapacity) % PoseHistoryCapacity;
        int previous = (poseHistoryNext - 2 + PoseHistoryCapacity) % PoseHistoryCapacity;
        float dt = poseHistoryTimes[newest] - poseHistoryTimes[previous];
        if (dt <= 1e-4f)
        {
            return arCamera.worldToCameraMatrix;
        }

        float scale = leadSeconds / dt;
        Vector3 position = poseHistoryPositions[newest]
            + (poseHistoryPositions[newest] - poseHistoryPositions[previous]) * scale;
        Quaternion delta =
            poseHistoryRotations[newest] * Quaternion.Inverse(poseHistoryRotations[previous]);
        delta.ToAngleAxis(out float angleDeg, out Vector3 axis);
        if (angleDeg > 180.0f)
        {
            angleDeg -= 360.0f;
        }

        Quaternion rotation = Mathf.Abs(angleDeg) > 1e-4f && !float.IsNaN(axis.x)
            ? Quaternion.AngleAxis(angleDeg * scale, axis) * poseHistoryRotations[newest]
            : poseHistoryRotations[newest];
        return BuildWorldToCamera(position, rotation);
    }

    // Unity's worldToCameraMatrix is the inverse rigid transform with a
    // z flip (camera looks down -z in view space).
    private static Matrix4x4 BuildWorldToCamera(Vector3 position, Quaternion rotation)
    {
        return Matrix4x4.Scale(new Vector3(1.0f, 1.0f, -1.0f))
            * Matrix4x4.TRS(position, rotation, Vector3.one).inverse;
    }

    private void UpdateSmoothedVertices(ARFace face)
    {
        var vertices = face.vertices;
        if (!vertices.IsCreated || vertices.Length == 0)
        {
            smoothedVertices = null;
            return;
        }

        bool reset = smoothedVertices == null
            || smoothedVertices.Length != vertices.Length
            || smoothedFaceId != face.trackableId;
        if (reset)
        {
            smoothedVertices = new Vector3[vertices.Length];
            smoothedFaceId = face.trackableId;
            for (int i = 0; i < vertices.Length; i++)
            {
                smoothedVertices[i] = vertices[i];
            }

            return;
        }

        for (int i = 0; i < vertices.Length; i++)
        {
            smoothedVertices[i] =
                Vector3.Lerp(smoothedVertices[i], vertices[i], VertexSmoothing);
        }
    }

    private bool UpdateFaceMaskMesh(ARFace face)
    {
        if (!face.vertices.IsCreated
            || face.vertices.Length == 0
            || !face.indices.IsCreated
            || face.indices.Length < 3
            || !face.uvs.IsCreated
            || face.uvs.Length < face.vertices.Length)
        {
            return false;
        }

        faceMaskObject.transform.SetParent(face.transform, false);
        faceMaskObject.transform.localPosition = Vector3.zero;
        faceMaskObject.transform.localRotation = Quaternion.identity;
        faceMaskObject.transform.localScale = Vector3.one;

        bool useSmoothed =
            smoothedVertices != null && smoothedVertices.Length == face.vertices.Length;
        meshVertices.Clear();
        meshUvs.Clear();
        meshTriangles.Clear();
        for (int i = 0; i < face.vertices.Length; i++)
        {
            meshVertices.Add(useSmoothed ? smoothedVertices[i] : face.vertices[i]);
            meshUvs.Add(face.uvs[i]);
        }

        for (int i = 0; i < face.indices.Length; i++)
        {
            meshTriangles.Add(face.indices[i]);
        }

        faceMaskMesh.Clear();
        faceMaskMesh.SetVertices(meshVertices);
        faceMaskMesh.SetUVs(0, meshUvs);
        faceMaskMesh.SetTriangles(meshTriangles, 0, true);
        faceMaskMesh.RecalculateBounds();
        return true;
    }

    private bool UpdateNeckMaskMesh(ARFace face)
    {
        if (!face.vertices.IsCreated || face.vertices.Length == 0)
        {
            return false;
        }

        var vertices = face.vertices;
        // The neck skirt hangs off the jawline extracted from the vertices,
        // so it must read the SAME smoothed buffer as the face mask — a
        // noisy jaw makes the whole skirt tremble.
        bool useSmoothed =
            smoothedVertices != null && smoothedVertices.Length == vertices.Length;
        Vector3 localMin = new Vector3(float.PositiveInfinity, float.PositiveInfinity, float.PositiveInfinity);
        Vector3 localMax = new Vector3(float.NegativeInfinity, float.NegativeInfinity, float.NegativeInfinity);
        for (int i = 0; i < vertices.Length; i++)
        {
            Vector3 vertex = useSmoothed ? smoothedVertices[i] : vertices[i];
            localMin = Vector3.Min(localMin, vertex);
            localMax = Vector3.Max(localMax, vertex);
        }

        float faceWidth = localMax.x - localMin.x;
        float faceHeight = localMax.y - localMin.y;
        if (faceWidth < 0.01f || faceHeight < 0.01f)
        {
            return false;
        }

        float[] lowestY = new float[NeckColumns];
        Vector3[] jawPoints = new Vector3[NeckColumns];
        bool[] hasJawPoint = new bool[NeckColumns];
        for (int i = 0; i < NeckColumns; i++)
        {
            lowestY[i] = float.PositiveInfinity;
        }

        float lowerCut = localMin.y + faceHeight * 0.45f;
        for (int i = 0; i < vertices.Length; i++)
        {
            Vector3 vertex = useSmoothed ? smoothedVertices[i] : vertices[i];
            if (vertex.y > lowerCut)
            {
                continue;
            }

            float normalizedX = (vertex.x - localMin.x) / faceWidth;
            if (normalizedX < 0.06f || normalizedX > 0.94f)
            {
                continue;
            }

            int column = Mathf.Clamp((int)(normalizedX * NeckColumns), 0, NeckColumns - 1);
            if (vertex.y < lowestY[column])
            {
                lowestY[column] = vertex.y;
                jawPoints[column] = vertex;
                hasJawPoint[column] = true;
            }
        }

        List<Vector3> orderedJaw = new List<Vector3>(NeckColumns);
        for (int i = 0; i < NeckColumns; i++)
        {
            if (hasJawPoint[i])
            {
                orderedJaw.Add(jawPoints[i]);
            }
        }

        if (orderedJaw.Count < NeckMinColumns)
        {
            return false;
        }

        for (int pass = 0; pass < 2; pass++)
        {
            for (int i = 1; i + 1 < orderedJaw.Count; i++)
            {
                orderedJaw[i] = (orderedJaw[i - 1] + orderedJaw[i] * 2.0f + orderedJaw[i + 1]) * 0.25f;
            }
        }

        neckMaskObject.transform.SetParent(face.transform, false);
        neckMaskObject.transform.localPosition = Vector3.zero;
        neckMaskObject.transform.localRotation = Quaternion.identity;
        neckMaskObject.transform.localScale = Vector3.one;

        float neckLength = faceHeight * NeckLengthFaceHeightFactor;
        meshVertices.Clear();
        meshUvs.Clear();
        meshTriangles.Clear();
        for (int i = 0; i < orderedJaw.Count; i++)
        {
            Vector3 jaw = orderedJaw[i];
            float u = orderedJaw.Count > 1 ? i / (float)(orderedJaw.Count - 1) : 0.5f;
            meshVertices.Add(new Vector3(jaw.x, jaw.y + neckLength * 0.02f, jaw.z));
            meshUvs.Add(new Vector2(u, 0.98f));
            meshVertices.Add(new Vector3(
                jaw.x * NeckTaper,
                jaw.y - neckLength,
                jaw.z - NeckBackOffsetMeters));
            meshUvs.Add(new Vector2(u, 0.02f));

            if (i > 0)
            {
                int topB = meshVertices.Count - 2;
                int bottomB = meshVertices.Count - 1;
                meshTriangles.Add(topB - 2);
                meshTriangles.Add(topB);
                meshTriangles.Add(bottomB - 2);
                meshTriangles.Add(bottomB - 2);
                meshTriangles.Add(topB);
                meshTriangles.Add(bottomB);
            }
        }

        neckMaskMesh.Clear();
        neckMaskMesh.SetVertices(meshVertices);
        neckMaskMesh.SetUVs(0, meshUvs);
        neckMaskMesh.SetTriangles(meshTriangles, 0, true);
        neckMaskMesh.RecalculateBounds();
        return true;
    }

    private Texture2D GetNeckGradientTexture()
    {
        if (neckGradientTexture != null)
        {
            return neckGradientTexture;
        }

        const int size = 64;
        neckGradientTexture = new Texture2D(size, size, TextureFormat.R8, false, true)
        {
            name = "FoundationNeckGradient",
            wrapMode = TextureWrapMode.Clamp,
            filterMode = FilterMode.Bilinear
        };
        for (int y = 0; y < size; y++)
        {
            float v = (y + 0.5f) / size;
            float vertical = Mathf.SmoothStep(0.0f, 1.0f, Mathf.InverseLerp(0.05f, 0.55f, v));
            vertical *= 1.0f - 0.15f * Mathf.SmoothStep(0.0f, 1.0f, Mathf.InverseLerp(0.9f, 1.0f, v));
            for (int x = 0; x < size; x++)
            {
                float u = (x + 0.5f) / size;
                float left = Mathf.SmoothStep(0.0f, 1.0f, Mathf.InverseLerp(0.0f, 0.18f, u));
                float right = Mathf.SmoothStep(0.0f, 1.0f, Mathf.InverseLerp(1.0f, 0.82f, u));
                float weight = vertical * left * right;
                neckGradientTexture.SetPixel(x, y, new Color(weight, weight, weight, weight));
            }
        }

        neckGradientTexture.Apply(false, true);
        return neckGradientTexture;
    }
}
