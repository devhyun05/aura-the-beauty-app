#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEngine;

/// <summary>
/// Golden Mask MCP 검수 리그. 실제 .auragm을 런타임 로더에 넣고 동일 카메라를
/// 정면/좌/우로 캡처한다. 이미지 저장은 GlamTestRig의 검증된 RT+luma 경로를 재사용한다.
/// </summary>
public static class GoldenMaskReviewRig
{
    [Serializable]
    private sealed class LoadRequest
    {
        public string requestId;
        public string fileUri;
    }

    [Serializable]
    private sealed class RotationRequest
    {
        public string requestId;
        public float yaw;
        public float pitch;
    }

    private static readonly float[] ReviewYaw =
        {0.0f, -60.0f, 60.0f, -90.0f, 90.0f, 0.0f, 0.0f};
    private static readonly float[] ReviewPitch =
        {0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 40.0f, -40.0f};
    private static readonly string[] ReviewName =
        {
            "front",
            "left-three-quarter",
            "right-three-quarter",
            "left-profile",
            "right-profile",
            "high-angle",
            "low-angle"
        };
    private const double SettleSeconds = 0.9;

    private static GoldenMaskRuntime runtime;
    private static string requestId = string.Empty;
    private static string outputDirectory = string.Empty;
    private static int viewIndex;
    private static int ticks;
    private static double settleStartedAt;
    private static bool capturing;

    public static void Setup(string artifactPath)
    {
        if (!EditorApplication.isPlaying)
        {
            Debug.LogError("[GoldenMaskReviewRig] 플레이 모드가 아님.");
            return;
        }
        var absolutePath = Path.GetFullPath(artifactPath);
        if (!File.Exists(absolutePath))
        {
            Debug.LogError($"[GoldenMaskReviewRig] artifact 없음: {absolutePath}");
            return;
        }
        runtime = UnityEngine.Object.FindFirstObjectByType<GoldenMaskRuntime>();
        if (runtime == null)
        {
            Debug.LogError("[GoldenMaskReviewRig] GoldenMaskRuntime 없음.");
            return;
        }
        requestId = $"mcp-review-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";
        runtime.SetRuntimeMode("still");
        runtime.LoadJson(JsonUtility.ToJson(new LoadRequest
        {
            requestId = requestId,
            fileUri = new Uri(absolutePath).AbsoluteUri
        }));
        Debug.Log($"[GoldenMaskReviewRig] load 요청: {requestId}");
    }

    public static void CaptureViews(string directory)
    {
        if (runtime == null || string.IsNullOrWhiteSpace(requestId))
        {
            Debug.LogError("[GoldenMaskReviewRig] Setup을 먼저 실행.");
            return;
        }
        outputDirectory = Path.GetFullPath(directory);
        Directory.CreateDirectory(outputDirectory);
        viewIndex = 0;
        ticks = 0;
        settleStartedAt = EditorApplication.timeSinceStartup;
        capturing = true;
        ApplyRotation();
        EditorApplication.update -= Tick;
        EditorApplication.update += Tick;
        Debug.Log($"[GoldenMaskReviewRig] 7-view 캡처 시작: {outputDirectory}");
    }

    public static void Stop()
    {
        EditorApplication.update -= Tick;
        capturing = false;
    }

    public static void Status()
    {
        var camera = FindPresentationCamera();
        Debug.Log(
            $"[GoldenMaskReviewRig] request={requestId} runtime={runtime != null}"
            + $" camera={camera != null} capturing={capturing}"
            + $" view={viewIndex}/{ReviewYaw.Length} ticks={ticks}");
    }

    private static void Tick()
    {
        if (!capturing || !EditorApplication.isPlaying)
        {
            Stop();
            return;
        }
        ticks += 1;
        if (EditorApplication.timeSinceStartup - settleStartedAt
            < SettleSeconds)
        {
            return;
        }
        var camera = FindPresentationCamera();
        if (camera == null)
        {
            Debug.LogError("[GoldenMaskReviewRig] presentation camera 없음.");
            Stop();
            return;
        }
        var path = Path.Combine(
            outputDirectory,
            $"golden-mask-{ReviewName[viewIndex]}.png");
        GlamTestRig.CaptureCamera(camera, path, 804, 1000);
        viewIndex += 1;
        if (viewIndex >= ReviewYaw.Length)
        {
            Stop();
            Debug.Log("[GoldenMaskReviewRig] 7-view 캡처 완료.");
            return;
        }
        ticks = 0;
        settleStartedAt = EditorApplication.timeSinceStartup;
        ApplyRotation();
    }

    private static void ApplyRotation()
    {
        runtime.SetRotationJson(JsonUtility.ToJson(new RotationRequest
        {
            requestId = requestId,
            yaw = ReviewYaw[viewIndex],
            pitch = ReviewPitch[viewIndex]
        }));
    }

    private static Camera FindPresentationCamera()
    {
        var cameras = Resources.FindObjectsOfTypeAll<Camera>();
        foreach (var camera in cameras)
        {
            if (camera != null
                && camera.name == "Golden Mask Presentation Camera"
                && camera.gameObject.scene.IsValid())
            {
                return camera;
            }
        }
        return null;
    }
}
#endif
