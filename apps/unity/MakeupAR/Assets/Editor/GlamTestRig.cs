// 글램 2.0 검증 리그 — 에디터 플레이 중 "셀피+랜드마크 주입 → 부팅 Ready → 필터 적용
// → 카메라 RT 캡처"를 한 줄 호출로 수행한다. MCP execute_code에서 매번 ~100줄 셋업을
// 재조립하며 생긴 실수(Ready 게이트 드롭, 어두운 게임뷰 오판)를 코드로 박제해 차단한다.
//
// 사용(플레이 모드 진입 후):
//   GlamTestRig.Setup("self1");          // panel/self1.png + panel/self1-lm.txt 주입
//   GlamTestRig.Capture("panel/out.png"); // 카메라 직접 RT 캡처(+밝기 검사)
//   GlamTestRig.Status();                 // 현재 상태 출력
// 필터는 panel/glam2-filter.json이 있으면 그걸, 없으면 내장 기본(눈 중심)을 쓴다.
#if UNITY_EDITOR
using System;
using System.Globalization;
using System.IO;
using ARMakeup.Bridge;
using ARMakeup.Face;
using Unity.Collections;
using UnityEditor;
using UnityEngine;

public static class GlamTestRig
{
    const int ReadyTicks = 30;      // 부팅 Ready 판단 전 대기 틱(세션 실측: ~30틱 필요)
    const float DarkLumaFloor = 8f; // 평균 밝기 바닥 — 이보다 어두우면 "깜깜한 캡처" 경고

    static NativeArray<byte> _frame;
    static int _w, _h;
    static Vector3[] _landmarks;
    static int _ticks;
    static bool _running;
    static bool _applied;
    static string _face = "";
    static float _lastLuma = -1f;

    /// <summary>Assets → 리포 루트(…/apps/unity/MakeupAR/Assets 기준 4단계 위).</summary>
    public static string RepoRoot =>
        Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "..", ".."));

    [MenuItem("AURA/GlamTestRig/Setup self1")]
    static void MenuSetupSelf1() => Setup("self1");

    [MenuItem("AURA/GlamTestRig/Capture → panel/rig-capture.png")]
    static void MenuCapture() => Capture("panel/rig-capture.png");

    /// <summary>셀피 주입 시작 — panel/{face}.png + panel/{face}-lm.txt.</summary>
    public static void Setup(string face = "self1")
    {
        if (!EditorApplication.isPlaying)
        {
            Debug.LogError("[GlamTestRig] 플레이 모드가 아님 — manage_editor play 먼저.");
            return;
        }
        var src = FaceLandmarkSource.Instance;
        if (src == null)
        {
            Debug.LogError("[GlamTestRig] FaceLandmarkSource.Instance 없음 — 씬/부팅 확인.");
            return;
        }

        var imgPath = Path.Combine(RepoRoot, "panel", face + ".png");
        var lmPath = Path.Combine(RepoRoot, "panel", face + "-lm.txt");
        if (!File.Exists(imgPath) || !File.Exists(lmPath))
        {
            Debug.LogError($"[GlamTestRig] 입력 없음: {imgPath} / {lmPath}");
            return;
        }

        // 이미지 로드 → top-first RGBA (LoadImage는 bottom-first라 세로 반전 필요)
        var tex = new Texture2D(2, 2, TextureFormat.RGBA32, false);
        tex.LoadImage(File.ReadAllBytes(imgPath));
        _w = tex.width; _h = tex.height;
        var px = tex.GetPixels32();
        UnityEngine.Object.DestroyImmediate(tex);
        if (_frame.IsCreated) _frame.Dispose();
        _frame = new NativeArray<byte>(_w * _h * 4, Allocator.Persistent);
        for (var y = 0; y < _h; y++)
        {
            var srcRow = (_h - 1 - y) * _w; // bottom-first → top-first
            for (var x = 0; x < _w; x++)
            {
                var c = px[srcRow + x];
                var o = (y * _w + x) * 4;
                _frame[o] = c.r; _frame[o + 1] = c.g; _frame[o + 2] = c.b; _frame[o + 3] = c.a;
            }
        }

        // 랜드마크 로드 — 1행 "W H", 이후 478행 "x y z"(정규화, 원점 좌상단)
        var lines = File.ReadAllLines(lmPath);
        _landmarks = new Vector3[lines.Length - 1];
        for (var i = 1; i < lines.Length; i++)
        {
            var p = lines[i].Split(' ');
            _landmarks[i - 1] = new Vector3(
                float.Parse(p[0], CultureInfo.InvariantCulture),
                float.Parse(p[1], CultureInfo.InvariantCulture),
                float.Parse(p[2], CultureInfo.InvariantCulture));
        }
        if (_landmarks.Length != 478)
            Debug.LogWarning($"[GlamTestRig] 랜드마크 {_landmarks.Length}개 (기대 478) — 계속 진행.");

        src.BeginExternalMode();
        _face = face;
        _ticks = 0;
        _applied = false;
        if (!_running)
        {
            EditorApplication.update += Tick;
            _running = true;
        }
        Debug.Log($"[GlamTestRig] Setup 완료: {face} {_w}x{_h}, lm {_landmarks.Length} — {ReadyTicks}틱 후 필터 적용.");
    }

    static void Tick()
    {
        if (!EditorApplication.isPlaying) { Stop(); return; }
        var src = FaceLandmarkSource.Instance;
        if (src == null || !_frame.IsCreated) return;

        // 매 틱 재주입 — GrabPass 계열 셰이더가 항상 신선한 피드를 보게 유지.
        src.PushExternalFrame(_frame, _w, _h, _landmarks, true);
        _ticks++;

        // Ready 게이트: 부팅 완료 전 applyFilter는 조용히 버려진다(세션 실증) → 틱 대기 후 적용.
        if (!_applied && _ticks >= ReadyTicks)
        {
            var bridge = UnityEngine.Object.FindFirstObjectByType<NativeBridge>();
            if (bridge == null) { Debug.LogError("[GlamTestRig] NativeBridge 없음."); _applied = true; return; }
            // 스텐실 활성 — 이게 꺼져 있으면 FramePresenter 렌더러가 disabled라 화면이
            // 검정(캡처 luma 0 함정, 2026-07-23 진단). RN이 보내는 신호를 리그가 대신 보낸다.
            var host = UnityEngine.Object.FindFirstObjectByType<AuraStencilHost>();
            if (host != null) host.SetStencilActive("true");
            bridge.MarkReady();
            bridge.OnMessageFromRN(LoadFilterJson());
            _applied = true;
            Debug.Log($"[GlamTestRig] 필터 적용 (tick {_ticks}).");
        }
    }

    static string LoadFilterJson()
    {
        var custom = Path.Combine(RepoRoot, "panel", "glam2-filter.json");
        if (File.Exists(custom))
        {
            Debug.Log("[GlamTestRig] panel/glam2-filter.json 사용.");
            return File.ReadAllText(custom);
        }
        // 내장 기본 — 눈 검증에 필요한 최소(텍스처 글램 위+아래 자동, 라이너 v5).
        return "{\"type\":\"applyFilter\",\"filter\":{" +
               "\"skinSmoothing\":0.3," +
               "\"mascaraColor\":\"#181418\",\"mascaraIntensity\":1.0," +
               "\"mascaraTexStyle\":3,\"mascaraLength\":0.55," +
               "\"lowerLashIntensity\":1.0,\"lowerLashLength\":0.45," +
               "\"eyelinerColor\":\"#181418\",\"eyelinerIntensity\":0.9,\"eyelinerStyle\":0}}";
    }

    /// <summary>
    /// 카메라 직접 RT 캡처 — 게임뷰가 죽어 있어도 동작(에디터 재기동 후 다크뷰 함정 회피).
    /// 평균 밝기를 재서 깜깜한 캡처를 결과로 오판하는 사고를 막는다. 반환값 = 평균 luma.
    /// </summary>
    public static float Capture(string relPath, int superSize = 2)
    {
        var cam = Camera.main ?? UnityEngine.Object.FindFirstObjectByType<Camera>();
        if (cam == null) { Debug.LogError("[GlamTestRig] 카메라 없음."); return -1f; }

        var w = Mathf.Max(64, _w > 0 ? _w * superSize / 2 : 1080);
        var h = Mathf.Max(64, _h > 0 ? _h * superSize / 2 : 1440);
        return CaptureCamera(cam, relPath, w, h);
    }

    /// <summary>
    /// 다른 검증 리그도 같은 RT 캡처·luma 검사를 재사용하도록 카메라를 명시한다.
    /// </summary>
    public static float CaptureCamera(
        Camera cam,
        string relPath,
        int width = 1080,
        int height = 1440)
    {
        if (cam == null) { Debug.LogError("[GlamTestRig] 카메라 없음."); return -1f; }
        var w = Mathf.Max(64, width);
        var h = Mathf.Max(64, height);
        var rt = RenderTexture.GetTemporary(w, h, 24);
        var prevTarget = cam.targetTexture;
        var prevActive = RenderTexture.active;
        cam.targetTexture = rt;
        cam.Render();
        RenderTexture.active = rt;
        var tex = new Texture2D(w, h, TextureFormat.RGB24, false);
        tex.ReadPixels(new Rect(0, 0, w, h), 0, 0);
        tex.Apply();
        cam.targetTexture = prevTarget;
        RenderTexture.active = prevActive;
        RenderTexture.ReleaseTemporary(rt);

        // 평균 밝기 검사(다운샘플로 충분)
        var px = tex.GetPixels32();
        float sum = 0; var step = Mathf.Max(1, px.Length / 20000);
        var n = 0;
        for (var i = 0; i < px.Length; i += step)
        { sum += 0.299f * px[i].r + 0.587f * px[i].g + 0.114f * px[i].b; n++; }
        _lastLuma = sum / Mathf.Max(1, n);

        var abs = Path.IsPathRooted(relPath) ? relPath : Path.Combine(RepoRoot, relPath);
        Directory.CreateDirectory(Path.GetDirectoryName(abs));
        File.WriteAllBytes(abs, tex.EncodeToPNG());
        UnityEngine.Object.DestroyImmediate(tex);

        if (_lastLuma < DarkLumaFloor)
            Debug.LogWarning($"[GlamTestRig] 캡처가 어두움(luma {_lastLuma:F1} < {DarkLumaFloor}) — 셋업/렌더 상태 의심: {abs}");
        else
            Debug.Log($"[GlamTestRig] 캡처 저장 luma {_lastLuma:F1}: {abs}");
        return _lastLuma;
    }

    /// <summary>주입 중단 + 버퍼 반납(플레이 종료 시 자동 호출).</summary>
    public static void Stop()
    {
        if (_running) { EditorApplication.update -= Tick; _running = false; }
        if (_frame.IsCreated) { _frame.Dispose(); _frame = default; }
        _applied = false; _ticks = 0; _face = "";
        Debug.Log("[GlamTestRig] Stop.");
    }

    public static void Status()
    {
        Debug.Log($"[GlamTestRig] face={_face} running={_running} ticks={_ticks} " +
                  $"applied={_applied} frame={_w}x{_h} lm={_landmarks?.Length ?? 0} lastLuma={_lastLuma:F1} " +
                  $"external={(FaceLandmarkSource.Instance != null && FaceLandmarkSource.Instance.ExternalMode)}");
    }
}
#endif
