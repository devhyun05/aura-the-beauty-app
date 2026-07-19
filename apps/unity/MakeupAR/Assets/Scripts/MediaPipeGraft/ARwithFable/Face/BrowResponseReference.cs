using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// 눈썹 양측 노출 응답의 공통 기준. CPU 픽셀 readback 없이 눈썹 위의 안정
    /// 랜드마크 UV만 머티리얼에 전달하고, 실제 RGB는 BrowResponse.cginc가 현재
    /// GrabPass에서 샘플한다.
    /// </summary>
    static class BrowResponseReference
    {
        const int FirstBrowSkinLandmarkA = 108;
        const int FirstBrowSkinLandmarkB = 109;
        const int SecondBrowSkinLandmarkA = 337;
        const int SecondBrowSkinLandmarkB = 338;

        static readonly int SkinReferenceViewport01Id =
            Shader.PropertyToID("_BrowSkinReferenceViewport01");
        static readonly int SkinReferenceViewport23Id =
            Shader.PropertyToID("_BrowSkinReferenceViewport23");
        static readonly int SkinReferenceValidId = Shader.PropertyToID("_BrowSkinReferenceValid");

        public static void Apply(Material material, Vector3[] landmarks)
        {
            if (material == null) return;
            var presenter = FramePresenter.Instance;
            if (presenter == null || landmarks == null ||
                landmarks.Length <= SecondBrowSkinLandmarkB ||
                !TryViewportUV(presenter, landmarks[FirstBrowSkinLandmarkA], out var firstA) ||
                !TryViewportUV(presenter, landmarks[FirstBrowSkinLandmarkB], out var firstB) ||
                !TryViewportUV(presenter, landmarks[SecondBrowSkinLandmarkA], out var secondA) ||
                !TryViewportUV(presenter, landmarks[SecondBrowSkinLandmarkB], out var secondB))
            {
                material.SetFloat(SkinReferenceValidId, 0f);
                return;
            }

            material.SetVector(SkinReferenceViewport01Id,
                new Vector4(firstA.x, firstA.y, firstB.x, firstB.y));
            material.SetVector(SkinReferenceViewport23Id,
                new Vector4(secondA.x, secondA.y, secondB.x, secondB.y));
            material.SetFloat(SkinReferenceValidId, 1f);
        }

        static bool TryViewportUV(FramePresenter presenter, Vector3 landmark, out Vector2 uv)
        {
            uv = Vector2.zero;
            if (!IsFinite(landmark.x) || !IsFinite(landmark.y)) return false;
            uv = presenter.ImageToViewport(new Vector2(landmark.x, landmark.y));
            return IsFinite(uv.x) && IsFinite(uv.y) &&
                   uv.x >= 0f && uv.x <= 1f && uv.y >= 0f && uv.y <= 1f;
        }

        static bool IsFinite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
    }
}
