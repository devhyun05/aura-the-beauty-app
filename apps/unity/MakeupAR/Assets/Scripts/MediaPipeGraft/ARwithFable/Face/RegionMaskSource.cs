using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// L2 립/눈 영역 마스크 — 1차: 랜드마크 폴리곤 래스터(설계 §11 후속 확장).
    ///
    /// 목적: 립·눈 영역의 픽셀 정밀 마스크(립 경계 삐짐 방지 등 향후 활용) 공급.
    /// 전역 _RegionMask(RGBA32 128², 이미지 UV 공간)·_RegionMaskOn으로 노출만 하고
    /// 소비자는 두지 않는다 — 활용처가 생기면 그때 소비 셰이더에 게이트를 추가한다.
    ///
    /// 채널: R=립(외곽 링 안) G=좌안(피사체 기준, 263 계열) B=우안(33 계열) A=예비.
    /// 방향 규약: 행0=마스크 상단이 텍스처 v=0에 올라가므로 "원점 좌상단·y 아래"
    /// 이미지 UV로 tex2D하면 방향이 맞는다(SegmentationSource 마스크 업로드와 동일).
    /// 랜드마크가 이미 정규화 이미지 좌표(x,y∈[0,1], y 아래)라 세그 마스크와 달리
    /// 회전 아핀 없이 그대로 래스터한다(_SegImgToMask* 불필요 — 항등). 스크린 공간
    /// 소비자는 FramePresenter.TryGetViewportToImage 역매핑을 지나 샘플하면 된다.
    ///
    /// 렌더 방식: CPU 스캔라인(even-odd) — GL 즉시 모드 대신 CPU를 택한 근거:
    /// 128² 폴리곤 3개는 바운딩 행만 돌면 수만 연산급(<0.1ms)이라 RT·머티리얼·
    /// 커맨드버퍼 셋업이 오히려 무겁다. 랜드마크 접근은 LateUpdate 프레임당 1회
    /// (프레임 캐시 규약 — TeethRenderer와 동일), 업로드도 64KB로 무시 가능.
    ///
    /// 기본 비활성: 실효 소비자가 없으므로 debugSeg 토글(setCalibration →
    /// MakeupController.ApplyCalibration)이 켜진 동안만 래스터한다 — 꺼져 있으면
    /// LateUpdate가 즉시 반환하고 _RegionMaskOn=0(소비자 게이트 폴백)이 유지된다.
    ///
    /// ML 파싱 모델(전용 face parsing) 통합은 후순위 스킵 — 근거(비용 대비):
    /// 랜드마크 478점이 이미 픽셀 근접 정밀도(립 외곽 20점 + Catmull-Rom 세분이면
    /// 128² 마스크에서 경계 오차가 마스크 텍셀 이하)인 반면, 전용 파싱 모델은
    /// SelfieMulticlass 위에 추론이 하나 더 얹혀 GPU 예산 재실측(§11 케이던스
    /// 실측과 동일 절차)이 선행돼야 한다. 랜드마크 오차가 원인으로 확인되는
    /// 활용처(립 경계 삐짐 등)가 실제로 나타나면 그때 재평가.
    /// </summary>
    public class RegionMaskSource : MonoBehaviour
    {
        public static RegionMaskSource Instance { get; private set; }

        // ── 예산 상수(명명) ──
        const int MaskSize = 128; // 마스크 한 변(px) — 립 폭 기준 수십 텍셀 확보 // 실기기 튜닝 대상
        const int Sub = 3;        // 링 Catmull-Rom 세분(경계 각짐 제거 — TeethRenderer 선례) // 실기기 튜닝 대상

        // 립 외곽 링 20점 — LipRenderer.LipsOuter 복사(타 트랙 사용 중이라 공유 상수
        // 승격 보류, 값 변경 시 두 곳 동기 필요 — TeethRenderer.LipsInner와 동일 규약).
        static readonly int[] LipsOuter =
            { 61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146 };
        // 눈 열림 윤곽(상+하안검 루프) 16점 — IrisRenderer.EyeContours 복사(동일 규약).
        // 33 계열=피사체 우안(B 채널), 263 계열=피사체 좌안(G 채널).
        static readonly int[] EyeRightContour =
            { 33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7 };
        static readonly int[] EyeLeftContour =
            { 263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249 };

        static readonly int RegionMaskId = Shader.PropertyToID("_RegionMask");
        static readonly int RegionMaskOnId = Shader.PropertyToID("_RegionMaskOn");

        FaceLandmarkSource _source;
        bool _enabled;
        Texture2D _texture;
        byte[] _pixels;  // RGBA32 패킹 — 행0=이미지 상단(방향 규약은 클래스 주석)
        Vector2[] _ctrl; // 링 컨트롤 점 재사용 버퍼(가장 큰 링 = 립 20점 기준)
        Vector2[] _fine; // Catmull-Rom 세분 링 재사용 버퍼(20×Sub)
        float[] _xs;     // 스캔라인 교차 x 재사용 버퍼(교차 수 ≤ 에지 수)

        void Awake()
        {
            Instance = this;
            Shader.SetGlobalFloat(RegionMaskOnId, 0f); // 명시적 폴백 — 소비자 게이트 0
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
            Shader.SetGlobalFloat(RegionMaskOnId, 0f);
            if (_texture != null) Destroy(_texture);
        }

        public void Init(FaceLandmarkSource source) => _source = source;

        /// <summary>
        /// 검증 토글(setCalibration.debugSeg) — MakeupController.ApplyCalibration이 호출.
        /// 소비자가 생기면 해당 intensity>0 조건을 여기에 OR로 추가한다.
        /// </summary>
        public void SetEnabled(bool on)
        {
            _enabled = on;
            if (!on) Shader.SetGlobalFloat(RegionMaskOnId, 0f);
        }

        void LateUpdate()
        {
            if (!_enabled || _source == null || !_source.HasFace)
            {
                Shader.SetGlobalFloat(RegionMaskOnId, 0f);
                return;
            }

            EnsureBuffers();
            System.Array.Clear(_pixels, 0, _pixels.Length);

            // 랜드마크는 프레임당 1회만 읽는다(프레임 캐시 규약) — 표시 프레임 시각으로
            // 보간된 값이라 립/눈 렌더러들과 같은 시점(시간 동기)이다.
            var lm = _source.Landmarks;
            RasterizeRing(lm, LipsOuter, 0);       // R = 립
            RasterizeRing(lm, EyeLeftContour, 1);  // G = 좌안
            RasterizeRing(lm, EyeRightContour, 2); // B = 우안

            _texture.LoadRawTextureData(_pixels);
            _texture.Apply(false, false);
            Shader.SetGlobalFloat(RegionMaskOnId, 1f);
        }

        void EnsureBuffers()
        {
            if (_texture == null)
            {
                _texture = new Texture2D(MaskSize, MaskSize, TextureFormat.RGBA32, false)
                {
                    wrapMode = TextureWrapMode.Clamp,
                    filterMode = FilterMode.Bilinear, // 이진 마스크 + 바이리니어 = 1텍셀 소프트 엣지
                };
                Shader.SetGlobalTexture(RegionMaskId, _texture);
            }
            if (_pixels == null)
            {
                _pixels = new byte[MaskSize * MaskSize * 4];
                _ctrl = new Vector2[LipsOuter.Length];
                _fine = new Vector2[LipsOuter.Length * Sub];
                _xs = new float[LipsOuter.Length * Sub];
            }
        }

        /// <summary>
        /// 닫힌 랜드마크 링을 Catmull-Rom으로 세분한 뒤 even-odd 스캔라인으로 채운다.
        /// channel: 0=R 1=G 2=B (RGBA32 바이트 오프셋).
        /// </summary>
        void RasterizeRing(Vector3[] lm, int[] ring, int channel)
        {
            var n = ring.Length;
            for (var i = 0; i < n; i++)
            {
                var p = lm[ring[i]];
                // 정규화 이미지 UV → 마스크 px (마스크가 이미지 UV 공간 그 자체).
                _ctrl[i] = new Vector2(p.x * MaskSize, p.y * MaskSize);
            }

            var fineN = n * Sub;
            for (var k = 0; k < n; k++)
            {
                var p0 = _ctrl[(k - 1 + n) % n];
                var p1 = _ctrl[k];
                var p2 = _ctrl[(k + 1) % n];
                var p3 = _ctrl[(k + 2) % n];
                for (var j = 0; j < Sub; j++)
                    _fine[k * Sub + j] = CatmullRom(p0, p1, p2, p3, j / (float)Sub);
            }

            // 폴리곤 바운딩 행 범위만 스캔 — 립/눈은 마스크의 소수 행이라 비용이 유계.
            float minY = float.MaxValue, maxY = float.MinValue;
            for (var i = 0; i < fineN; i++)
            {
                minY = Mathf.Min(minY, _fine[i].y);
                maxY = Mathf.Max(maxY, _fine[i].y);
            }
            var rowStart = Mathf.Max(0, Mathf.FloorToInt(minY));
            var rowEnd = Mathf.Min(MaskSize - 1, Mathf.CeilToInt(maxY));

            for (var y = rowStart; y <= rowEnd; y++)
            {
                var cy = y + 0.5f; // 픽셀 중심 스캔라인
                var count = 0;
                for (var i = 0; i < fineN; i++)
                {
                    var a = _fine[i];
                    var b = _fine[(i + 1) % fineN];
                    // 반개구간 교차 판정 — 꼭짓점이 두 에지에 이중 계수되는 것을 방지
                    // (even-odd 표준 처리: a.y ≤ cy < b.y 또는 그 반대만 교차).
                    if ((a.y <= cy) == (b.y <= cy)) continue;
                    _xs[count++] = a.x + (cy - a.y) / (b.y - a.y) * (b.x - a.x);
                }
                System.Array.Sort(_xs, 0, count);
                for (var s = 0; s + 1 < count; s += 2)
                {
                    // 픽셀 중심(x+0.5)이 [xs[s], xs[s+1]] 안에 드는 픽셀만 채운다.
                    var xa = Mathf.Max(0, Mathf.CeilToInt(_xs[s] - 0.5f));
                    var xb = Mathf.Min(MaskSize - 1, Mathf.FloorToInt(_xs[s + 1] - 0.5f));
                    var rowBase = y * MaskSize * 4 + channel;
                    for (var x = xa; x <= xb; x++)
                        _pixels[rowBase + x * 4] = 255;
                }
            }
        }

        // TeethRenderer.CatmullRom과 동일 — 소형 유틸이라 공유 승격 보류(동일 규약).
        static Vector2 CatmullRom(Vector2 p0, Vector2 p1, Vector2 p2, Vector2 p3, float t)
        {
            var t2 = t * t;
            var t3 = t2 * t;
            return 0.5f * (2f * p1 + (p2 - p0) * t
                + (2f * p0 - 5f * p1 + 4f * p2 - p3) * t2
                + (3f * p1 - p0 - 3f * p2 + p3) * t3);
        }
    }
}
