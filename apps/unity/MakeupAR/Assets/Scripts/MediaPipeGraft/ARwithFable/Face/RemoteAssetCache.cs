using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.Networking;

namespace ARMakeup.Face
{
    /// <summary>
    /// 원격 카탈로그(§16 v2) 다운로드·캐시 계층. http(s) 에셋을 로컬 캐시 파일로 먼저
    /// 내려받아, 기존 동기 로더(ImageFileLoader.ResolvePath → File.ReadAllBytes)가
    /// 캐시 로컬 경로를 반환하게 한다 → 렌더러 6종은 전부 무변경(동기 계약 유지).
    ///
    /// 두 소스를 캐시 경유로 처리한다:
    ///   ① http(s):…  = 원격 CDN 에셋(주경로, iOS 우선 — https는 무설정 동작).
    ///   ② streaming:… = 앱 번들 동봉 에셋이지만 Android는 APK 내부(jar:file://…!/assets/…)라
    ///      File.ReadAllBytes 불가 → UnityWebRequest로 스트리밍해 캐시. iOS는 실제 폴더라
    ///      이 계층을 타지 않고 ResolvePath의 기존 File 경로를 그대로 쓴다(바이트 동일).
    ///
    /// UnityWebRequest 스트리밍 선례: CanonicalFaceMesh.LoadTopology(CanonicalFaceMesh.cs:254)
    /// 가 이미 `path.Contains("://")` 분기로 UnityWebRequest.Get를 코루틴에서 써 Android
    /// StreamingAssets를 읽는다 — 그대로 따르는 패턴. temporaryCachePath 쓰기 선례는
    /// MediaEditController(캐시 축출 가능 자원). ImageFileLoader.ResolvePath 계약
    /// (streaming:/file://)의 명시적 후속(그 함수 주석의 "fetch+캐시 계층 후속").
    /// </summary>
    public static class RemoteAssetCache
    {
        // 다운로드 캐시 폴더(OS 축출 가능) — 최초 접근 시 생성. temporaryCachePath 선택
        // 이유=다운로드 에셋은 재취득 가능(원본은 CDN)이라 캐시가 적합(MediaEditController와 동일).
        static string _dir;

        // 영구 실패(give-up) — 재디스패치 무한루프 방지. 실패 uri가 매 패스 pending으로
        // 다시 잡히면 코루틴이 무한 재생성되므로 반드시 유지한다(EnsureRemoteAssetsReady 필터).
        static readonly HashSet<string> _failed = new HashSet<string>();

        // 진행 중 다운로드 — 슬라이더 드래그로 같은 uri가 반복 전송돼도 중복 다운로드 방지.
        static readonly HashSet<string> _inflight = new HashSet<string>();

        // Application.streamingAssetsPath.Contains("://") 지연 판정(Android=true). 캐시해 재계산 회피.
        static int _streamingNeedsWr = -1;

        static string CacheDir
        {
            get
            {
                if (_dir == null)
                {
                    _dir = Path.Combine(Application.temporaryCachePath, "remoteCatalog");
                    Directory.CreateDirectory(_dir);
                }
                return _dir;
            }
        }

        /// <summary>http(s) 스킴(원격 CDN 에셋)인지.</summary>
        public static bool IsRemote(string uri) =>
            uri != null &&
            (uri.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
             uri.StartsWith("https://", StringComparison.OrdinalIgnoreCase));

        /// <summary>
        /// streaming: 소스가 UnityWebRequest 경유를 요구하는 플랫폼인지(Android=true).
        /// iOS는 StreamingAssets가 실제 폴더라 false → ResolvePath의 기존 File 경로 유지.
        /// </summary>
        public static bool StreamingNeedsWebRequest
        {
            get
            {
                if (_streamingNeedsWr < 0)
                    _streamingNeedsWr = Application.streamingAssetsPath.Contains("://") ? 1 : 0;
                return _streamingNeedsWr == 1;
            }
        }

        /// <summary>이 uri가 동기 로드 전에 캐시 다운로드(prefetch)를 요구하는가.</summary>
        public static bool NeedsFetch(string uri) =>
            IsRemote(uri) ||
            (uri != null && uri.StartsWith("streaming:") && StreamingNeedsWebRequest);

        // uri → 결정적 캐시 파일 경로. FNV-1a 64bit를 인라인 구현한다(의존성 0). string.GetHashCode는
        // 런타임 랜덤화 위험이 있어 세션 간 캐시 키가 흔들리므로 쓰지 않는다.
        static string CacheFileFor(string uri)
        {
            ulong h = 1469598103934665603UL;
            foreach (char c in uri) { h ^= (byte)c; h *= 1099511628211UL; }
            return Path.Combine(CacheDir, h.ToString("x16") + ExtensionOf(uri));
        }

        // uri 확장자 화이트리스트(.png/.jpg/.jpeg/.webp). '?'/'#' 앞을 잘라 판정하고, 아니면
        // ".img"(LoadImage는 헤더 스니핑이라 확장자 무관 — 안전한 폴백).
        static string ExtensionOf(string uri)
        {
            var cut = uri;
            var q = cut.IndexOfAny(new[] { '?', '#' });
            if (q >= 0) cut = cut.Substring(0, q);
            switch (Path.GetExtension(cut).ToLowerInvariant())
            {
                case ".png": return ".png";
                case ".jpg": return ".jpg";
                case ".jpeg": return ".jpeg";
                case ".webp": return ".webp";
                default: return ".img";
            }
        }

        /// <summary>캐시된 로컬 파일이 있으면 true+경로. 없으면 false+null.</summary>
        public static bool TryResolveCached(string uri, out string localPath)
        {
            localPath = CacheFileFor(uri);
            if (File.Exists(localPath)) return true;
            localPath = null;
            return false;
        }

        /// <summary>영구 실패로 포기한 uri인지(재디스패치 게이트가 pending에서 제외).</summary>
        public static bool IsGivenUp(string uri) => _failed.Contains(uri);

        /// <summary>
        /// 원격/스트리밍 uri를 로컬 캐시로 내려받는다. 완료 시 done(성공여부, 성공=로컬경로/실패=사유).
        /// 이미 캐시됐으면 즉시 성공, 동일 uri 진행 중이면 완료를 기다렸다 재검사(중복 다운로드 방지).
        /// 실패는 _failed(give-up)에 등록해 무한 재시도를 막는다.
        /// </summary>
        public static IEnumerator Fetch(string uri, Action<bool, string> done)
        {
            // ① 이미 캐시됨 → 즉시 성공.
            if (TryResolveCached(uri, out var cachedPath)) { done(true, cachedPath); yield break; }

            // ② 동일 uri가 진행 중이면 완료를 기다렸다 캐시 재검사(슬라이더 드래그 스팸 dedup).
            while (_inflight.Contains(uri)) yield return null;
            if (TryResolveCached(uri, out cachedPath)) { done(true, cachedPath); yield break; }

            _inflight.Add(uri);
            var local = CacheFileFor(uri);
            var ok = false;
            string error = null;

            // url 결정: http(s)는 그대로. streaming:은 streamingAssetsPath 상대 — Android은
            // jar:file://…!/assets/… 형태라 "://" 포함, UnityWebRequest.Get가 그대로 읽는다
            // (CanonicalFaceMesh.cs:259-263 선례와 동일).
            string url;
            if (IsRemote(uri)) url = uri;
            else
            {
                var rel = uri.Substring("streaming:".Length).TrimStart('/');
                url = Application.streamingAssetsPath.TrimEnd('/') + "/" + rel;
            }

            // yield는 try/finally(=using) 안에서만 허용(catch 있는 try에서 yield 금지, CS1626).
            // 파일 쓰기 예외는 yield 없는 내부 try/catch로 처리한다.
            try
            {
                using var req = UnityWebRequest.Get(url);
                req.timeout = 20;
                yield return req.SendWebRequest();

                if (req.result == UnityWebRequest.Result.Success)
                {
                    try
                    {
                        // .part로 원자적 쓰기 후 rename — 부분 다운로드가 캐시로 남지 않게.
                        var tmp = local + ".part";
                        File.WriteAllBytes(tmp, req.downloadHandler.data);
                        if (File.Exists(local)) File.Delete(local);
                        File.Move(tmp, local);
                        _failed.Remove(uri);
                        ok = true;
                    }
                    catch (Exception e)
                    {
                        error = e.Message;
                        _failed.Add(uri);
                    }
                }
                else
                {
                    error = req.error ?? "네트워크 오류";
                    _failed.Add(uri);
                }
            }
            finally
            {
                _inflight.Remove(uri);
            }

            if (ok) done(true, local);
            else done(false, error);
        }
    }
}
