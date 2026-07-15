using ARMakeup.Face;
using UnityEngine;

namespace ARMakeup.Capture
{
    /// <summary>
    /// 라이브 AR 화면(카메라 피드 + 메이크업)을 화면 크기와 무관한 고정 해상도
    /// RenderTexture에 오프스크린으로 렌더한다. 사진(PhotoCapture)과 영상
    /// (VideoRecorder)이 이 헬퍼를 공유하므로 스틸과 동영상의 프레이밍이 동일하다.
    ///
    /// ScreenCapture와의 차이:
    ///  - 해상도가 기기 화면에 묶이지 않는다 — 짧은 변을 <see cref="DefaultShortEdge"/>로
    ///    고정하고 화면 종횡비를 유지한다(세로 폰이면 1080×약2340).
    ///  - RN UI(슬라이더·버튼)는 Unity 프레임버퍼가 아니라 네이티브 레이어에서
    ///    Unity 뷰 위에 합성되므로 어차피 담기지 않는다. 오프스크린이라 이 성질도 유지.
    ///
    /// 프레이밍 정합: AR 카메라를 그대로 렌더하고 RT 종횡비를 화면 종횡비에 맞추므로
    /// 뷰포트 매핑이 화면과 동일하다 → 화면에 보이는 그대로 나온다.
    /// </summary>
    public static class CaptureComposite
    {
        /// <summary>짧은 변 기본 목표 해상도(px). 1080 = 세로 폰 1080p급.</summary>
        public const int DefaultShortEdge = 1080;

        /// <summary>
        /// "좌우 반전 없이 저장" 옵션(RN setSaveOptions). 켜면 전면 카메라 저장물을
        /// 가로로 뒤집어, 거울(셀피)로 보이던 프리뷰가 아니라 남이 보는 실제 방향으로
        /// 저장한다. 후면은 원래 거울이 아니므로 <see cref="ShouldUnmirror"/>가 전면만 해당.
        /// </summary>
        public static bool SaveUnmirror;

        /// <summary>이번 캡처를 가로 반전할지 — 옵션 ON이고 현재 전면일 때만.</summary>
        public static bool ShouldUnmirror =>
            SaveUnmirror && FramePresenter.Instance != null && FramePresenter.Instance.IsFront;

        /// <summary>
        /// 현재 화면 종횡비를 유지하며 짧은 변을 shortEdge로 맞춘 (width,height).
        /// H.264는 짝수 해상도를 요구하므로 둘 다 짝수로 내림한다.
        /// </summary>
        public static void ComputeSize(int shortEdge, out int width, out int height)
        {
            var sw = Mathf.Max(1, Screen.width);
            var sh = Mathf.Max(1, Screen.height);
            if (sw <= sh)
            {
                width = shortEdge;
                height = Mathf.RoundToInt((float)shortEdge * sh / sw);
            }
            else
            {
                height = shortEdge;
                width = Mathf.RoundToInt((float)shortEdge * sw / sh);
            }
            width = Mathf.Max(2, width & ~1);   // 짝수 강제
            height = Mathf.Max(2, height & ~1);
        }

        /// <summary>
        /// cam을 rt에 한 번 렌더한다(카메라의 기존 targetTexture 복원). rt는 이미
        /// 생성돼 있어야 하며, 그 크기가 프레이밍 종횡비를 정한다. flipHorizontal이면
        /// 렌더 결과를 가로로 뒤집는다(un-mirror). 렌더 후 RenderTexture.active는 rt로
        /// 남겨 두어 호출자가 곧바로 ReadPixels할 수 있게 한다.
        /// </summary>
        public static void RenderInto(Camera cam, RenderTexture rt, bool flipHorizontal)
        {
            var prevTarget = cam.targetTexture;
            cam.targetTexture = rt;
            cam.Render();
            cam.targetTexture = prevTarget;

            if (flipHorizontal)
            {
                // 소스 UV의 u를 1-u로 뒤집어 복사 = 가로 반전. 사진·영상 공용이라
                // 여기서 처리하면 네이티브 인코더는 손대지 않아도 된다.
                var tmp = RenderTexture.GetTemporary(rt.descriptor);
                Graphics.Blit(rt, tmp, new Vector2(-1f, 1f), new Vector2(1f, 0f));
                Graphics.Blit(tmp, rt);
                RenderTexture.ReleaseTemporary(tmp);
            }

            RenderTexture.active = rt;
        }

        /// <summary>
        /// AR 씬 카메라. AR Camera는 "MainCamera" 태그이므로 Camera.main으로 얻는다.
        /// 첫 프레임 전이면 null일 수 있다.
        /// </summary>
        public static Camera SceneCamera => Camera.main;
    }
}
