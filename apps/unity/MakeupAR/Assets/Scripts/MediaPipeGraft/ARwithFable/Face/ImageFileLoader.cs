using System;
using System.IO;
using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// 사용자 임포트 이미지(눈썹 스타일 / 얼굴 룩 오버레이) 공용 로더.
    /// file:// 경로 처리, PNG/JPG 디코드, 그리고 알파(투명도) 분석까지.
    ///
    /// 왜 투명도 분석이 필요한가:
    /// - 눈썹 스타일: 투명 PNG면 알파=털, 흰 배경 그림/JPG면 어두운 픽셀=털(luma-key).
    ///   TransparentFraction으로 둘을 자동 구분한다.
    /// - 얼굴 오버레이: 알파 데칼이라 투명 영역이 거의 없으면(=배경째 칠해 저장한 그림)
    ///   얼굴 전체를 덮어버리므로 임포트를 거부하고 안내한다.
    /// </summary>
    public static class ImageFileLoader
    {
        // 대용량 텍스처에서 알파 통계를 낼 때 이 정도만 샘플링(성능).
        const int MaxAlphaSamples = 20000;

        // 디자이너 마스크(모양 축, §16 "mask 소프트 존") 판정 임계 — 실기기/실사용 튜닝 대상.
        // 마스크는 흑백/알파(존 세기)만 받는다. 유채색 픽셀 비율이 이보다 크면 "컬러
        // 아트"로 보고 거부(텍스처 탭으로 안내). 채도 = (max−min)/max ≥ 임계면 유채색.
        const float MaskMaxColorFraction = 0.15f; // 실기기/실사용 튜닝 대상
        const float MaskSaturationThreshold = 0.20f; // 실기기/실사용 튜닝 대상
        // 알파 채널을 존으로 볼지 판정 — 이보다 투명한 픽셀이 하나라도 있으면 알파 마스크.
        const byte MaskAlphaOpaque = 250;

        static Texture2D _clear;
        static Texture2D _softDot;

        /// <summary>레이어 경로 "builtin:dot" — 내장 소프트 점(그림 없이 블러셔 점용).</summary>
        public const string BuiltinDotPath = "builtin:dot";

        /// <summary>
        /// 흰색 RGB + 방사형 알파 폴오프의 소프트 점(128×128). 오버레이 레이어의
        /// 슬롯 색·틴트 블렌드와 조합해 그림 임포트 없이 블러셔/섀딩 점을 만든다.
        /// 공유 정적 텍스처 — 소유권 없음(파기 금지).
        /// </summary>
        public static Texture2D SoftDotTexture
        {
            get
            {
                if (_softDot != null) return _softDot;
                const int size = 128;
                _softDot = new Texture2D(size, size, TextureFormat.RGBA32, false)
                { wrapMode = TextureWrapMode.Clamp };
                var px = new Color32[size * size];
                var c = (size - 1) * 0.5f;
                for (var y = 0; y < size; y++)
                    for (var x = 0; x < size; x++)
                    {
                        var d = Mathf.Sqrt((x - c) * (x - c) + (y - c) * (y - c)) / c;
                        // 중심 진하고 가장자리 0 — smoothstep 폴오프(경계 하드엣지 방지).
                        var a = 1f - Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(d));
                        px[y * size + x] = new Color32(255, 255, 255, (byte)(a * 255f));
                    }
                _softDot.SetPixels32(px);
                _softDot.Apply(false, false);
                return _softDot;
            }
        }

        /// <summary>모든 채널 0인 1×1 투명 텍스처(오버레이 기본값 — 임포트 전 얼굴 안 덮게).</summary>
        public static Texture2D ClearTexture
        {
            get
            {
                if (_clear == null)
                {
                    _clear = new Texture2D(1, 1, TextureFormat.RGBA32, false)
                    { wrapMode = TextureWrapMode.Clamp };
                    _clear.SetPixel(0, 0, new Color(0f, 0f, 0f, 0f));
                    _clear.Apply(false, false);
                }
                return _clear;
            }
        }

        /// <summary>파일에서 읽어 디코드. 실패 시 tex=null, error에 사유(사용자용 한국어).</summary>
        /// <summary>
        /// RN이 넘긴 경로를 실제 파일 경로로 해석. 스킴:
        ///   ① streaming:...  = 앱 번들 동봉 에셋(팀 기본 세트 §16) → StreamingAssets 상대경로.
        ///      iOS에선 StreamingAssets가 앱 번들 안 실제 폴더라 File.ReadAllBytes로 바로 읽힘.
        ///   ② file://...     = 기기 파일/사진 라이브러리 임포트(사용자·런타임).
        ///   ③ 그 외          = 이미 절대 경로.
        ///   ④ http(s)://...  = 원격 카탈로그(§16 v2) → RemoteAssetCache가 내려받은 로컬 캐시 경로.
        ///   ⑤ Android는 streaming:도 캐시 경유(APK 내부라 File 불가) — RemoteAssetCache가 스트리밍.
        /// http·Android streaming은 로드 전 MakeupController.OnMessage 게이트가 prefetch를 보장하므로,
        /// 여기선 캐시 로컬 경로만 반환한다(미캐시=빈 경로 → TryLoad가 "찾을 수 없음"으로 우아 실패).
        /// </summary>
        public static string ResolvePath(string path)
        {
            if (string.IsNullOrEmpty(path)) return path;
            if (path.StartsWith("streaming:"))
            {
                // Android(streamingAssetsPath가 "://" 포함)는 StreamingAssets가 APK 내부라
                // File 불가 → RemoteAssetCache가 UnityWebRequest로 스트리밍한 캐시를 쓴다.
                // iOS는 이 분기를 타지 않고 아래 실제 폴더 경로를 그대로 반환(바이트 동일).
                if (RemoteAssetCache.StreamingNeedsWebRequest)
                    return RemoteAssetCache.TryResolveCached(path, out var cached) ? cached : string.Empty;
                var rel = path.Substring("streaming:".Length).TrimStart('/');
                var rootFull = Path.GetFullPath(Application.streamingAssetsPath);
                var full = Path.GetFullPath(Path.Combine(rootFull, rel));
                // 계약 강제 — `..`로 StreamingAssets 밖 탈출 거부(붙여넣기 임포트로 임의
                // uri가 들어올 수 있음). 밖이면 빈 경로 반환 → TryLoad가 "찾을 수 없음" 폴백.
                if (full != rootFull &&
                    !full.StartsWith(rootFull + Path.DirectorySeparatorChar, StringComparison.Ordinal))
                {
                    return string.Empty;
                }
                return full;
            }
            if (path.StartsWith("file://")) return path.Substring(7);
            // 원격 http(s) — RemoteAssetCache가 내려받은 로컬 캐시 경로. 미캐시면 빈 경로
            // (정상 흐름엔 게이트 prefetch가 캐시를 보장 — 빈 경로는 다운로드 실패/레이스뿐).
            if (RemoteAssetCache.IsRemote(path))
                return RemoteAssetCache.TryResolveCached(path, out var cachedRemote) ? cachedRemote : string.Empty;
            return path;
        }

        public static bool TryLoad(string path, out Texture2D tex, out string error)
        {
            tex = null;
            error = null;
            if (string.IsNullOrEmpty(path))
            {
                error = "파일 경로가 비어 있습니다.";
                return false;
            }

            var p = ResolvePath(path);
            try
            {
                if (!File.Exists(p))
                {
                    error = $"파일을 찾을 수 없습니다: {p}";
                    return false;
                }
                var bytes = File.ReadAllBytes(p);
                var t = new Texture2D(2, 2, TextureFormat.RGBA32, false)
                { wrapMode = TextureWrapMode.Clamp };
                if (!t.LoadImage(bytes))
                {
                    UnityEngine.Object.Destroy(t);
                    error = "이미지 디코드에 실패했습니다 (PNG/JPG만 지원).";
                    return false;
                }
                tex = t;
                return true;
            }
            catch (Exception e)
            {
                error = e.Message;
                return false;
            }
        }

        /// <summary>
        /// 데칼(립/볼/얼굴 룩)용 로드 — 투명 배경 필수. 투명 영역이 minTransparent
        /// 미만(=배경째 저장한 그림)이면 부위를 통째 덮으므로 실패시킨다.
        /// </summary>
        public static bool TryLoadDecal(
            string path, float minTransparent, out Texture2D tex, out string error)
        {
            if (!TryLoad(path, out tex, out error)) return false;
            if (TransparentFraction(tex) < minTransparent)
            {
                UnityEngine.Object.Destroy(tex);
                tex = null;
                error = "투명 배경 PNG가 필요합니다 (그림만 남기고 배경은 투명하게 저장).";
                return false;
            }
            return true;
        }

        /// <summary>
        /// 디자이너 마스크(모양 축, §16) 로드 — 부위 "존"을 정의하는 흑백/알파 스텐실.
        /// 색은 없다(색·마감·농도 축은 앱이 유지). 컬러 아트가 들어오면 거부하고
        /// 텍스처 탭으로 안내한다. 성공 시 셰이더 _*Mask 슬롯(.r 샘플)이 읽는 R8로 구워
        /// 반환한다 — 알파 마스크면 알파를, 불투명 그레이스케일이면 luma를 존으로 굽는다.
        /// (MaskGenerator.Generate와 같은 R8 계약이라 슬롯 스왑만으로 정합.)
        /// </summary>
        public static bool TryLoadMask(string path, out Texture2D mask, out string error)
        {
            mask = null;
            if (!TryLoad(path, out var src, out error)) return false;
            if (ColorfulFraction(src) > MaskMaxColorFraction)
            {
                UnityEngine.Object.Destroy(src);
                error = "이건 컬러 아트예요 — 텍스처 탭으로 넣어 주세요. " +
                        "모양 마스크는 흑백/알파(존)만 받아요 (색은 앱이 칠해요).";
                return false;
            }
            mask = BakeMask(src);
            UnityEngine.Object.Destroy(src);
            return true;
        }

        /// <summary>
        /// 유채색 픽셀 비율(0~1). 채도 = (max−min)/max 가 임계 이상인 픽셀 비율.
        /// 흑백/그레이스케일 마스크는 0에 가깝고, 컬러 그림은 크게 나온다.
        /// 투명 픽셀(알파 마스크의 존 밖 배경)은 채도 판정에서 제외한다.
        /// </summary>
        public static float ColorfulFraction(Texture2D tex)
        {
            if (tex == null) return 0f;
            var pixels = tex.GetPixels32();
            var n = pixels.Length;
            if (n == 0) return 0f;
            var stride = Mathf.Max(1, n / MaxAlphaSamples);
            int colorful = 0, sampled = 0;
            for (var i = 0; i < n; i += stride)
            {
                var p = pixels[i];
                if (p.a < 8) continue; // 투명 = 존 밖(배경) — 분모·분자 모두 제외
                sampled++;
                float mx = Mathf.Max(p.r, Mathf.Max(p.g, p.b));
                float mn = Mathf.Min(p.r, Mathf.Min(p.g, p.b));
                var sat = mx <= 0f ? 0f : (mx - mn) / mx;
                if (sat > MaskSaturationThreshold) colorful++;
            }
            return sampled == 0 ? 0f : colorful / (float)sampled;
        }

        // 임포트 마스크를 셰이더가 읽는 R8(존 세기)로 정규화. 투명 픽셀이 있으면 알파를,
        // 없으면(불투명 그레이스케일) luma를 존으로 굽는다. 소유권=호출자(교체 시 파기).
        static Texture2D BakeMask(Texture2D src)
        {
            var pixels = src.GetPixels32();
            var n = pixels.Length;
            var hasAlpha = false;
            var stride = Mathf.Max(1, n / MaxAlphaSamples);
            for (var i = 0; i < n; i += stride)
                if (pixels[i].a < MaskAlphaOpaque) { hasAlpha = true; break; }

            var outPx = new Color32[n];
            for (var i = 0; i < n; i++)
            {
                var p = pixels[i];
                // luma(정수 근사 0.299/0.587/0.114 ≈ 77/150/29 /256).
                byte zone = hasAlpha ? p.a : (byte)((p.r * 77 + p.g * 150 + p.b * 29) >> 8);
                outPx[i] = new Color32(zone, zone, zone, 255);
            }
            var tex = new Texture2D(src.width, src.height, TextureFormat.R8, false)
            {
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear,
            };
            tex.SetPixels32(outPx);
            // 읽기 가능 유지(false) — 튜토리얼 가이드(#2 C)가 커스텀 마스크 경계를
            // GetPixelBilinear로 레이캐스트 추적한다. R8 소형이라 메모리 무해.
            tex.Apply(false, false);
            return tex;
        }

        /// <summary>알파 &lt; 0.5 픽셀 비율(0~1). JPG/불투명 배경이면 0에 가깝다.</summary>
        public static float TransparentFraction(Texture2D tex)
        {
            if (tex == null) return 0f;
            var pixels = tex.GetPixels32();
            var n = pixels.Length;
            if (n == 0) return 0f;
            var stride = Mathf.Max(1, n / MaxAlphaSamples);
            int transparent = 0, sampled = 0;
            for (var i = 0; i < n; i += stride)
            {
                if (pixels[i].a < 128) transparent++;
                sampled++;
            }
            return sampled == 0 ? 0f : transparent / (float)sampled;
        }
    }
}
