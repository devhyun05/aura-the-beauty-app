using System.Collections.Generic;
using ARMakeup.Bridge;
using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// 눈썹 "스타일" — 미리 그린(또는 사용자가 임포트한) 눈썹 털 텍스처를 눈썹 아치에
    /// 워프해 얹는다. 절차적 펜슬과 상호보완: 펜슬=파라미터 개별 털, 스타일=사실적
    /// 텍스처(디자이너/사용자 그림). "다양한 모양"을 텍스처 라이브러리로.
    ///
    /// 눈썹 밴드 메시(상·하단 아크)에 텍스처 UV(가로=눈썹 길이 0~1, 세로=폭 0~1)를
    /// 매핑 → 텍스처가 눈썹 곡선을 따라 휜다. BrowStyle.shader가 알파=털 모양,
    /// _BrowColor로 틴트.
    ///
    /// 임포트: SetStyleTextureFromFile(path)로 사용자 이미지를 런타임 로드(재빌드 없음).
    /// 기본은 Resources/default_brow(플레이스홀더).
    /// </summary>
    public class StyleRenderer : MonoBehaviour
    {
        public static StyleRenderer Instance { get; private set; }

        static readonly int[][] BrowUpper =
        {
            new[] { 70, 63, 105, 66, 107 },
            new[] { 300, 293, 334, 296, 336 },
        };
        static readonly int[][] BrowLower =
        {
            new[] { 46, 53, 52, 65, 55 },
            new[] { 276, 283, 282, 295, 285 },
        };
        const int ArcPts = 5;
        const int Sub = 3;
        const int Seg = (ArcPts - 1) * (Sub + 1) + 1; // 17
        const int Brows = 2;

        const float DistanceFromCamera = 0.5f;
        const float DepthScale = 1.0f;

        Camera _camera;
        FaceLandmarkSource _source;
        Mesh _mesh;
        MeshRenderer _renderer;
        Material _material;
        Vector3[] _vertices;
        float _intensity;
        float _thickness = 1f; // R7 두께/아치 — BrowRenderer와 동일 워프(제품 동조)
        float _arch = 0f;
        int _shape = 0;        // 눈썹 모양(#19b) — BrowRenderer와 동일 값 공유
        int _browThicknessProfile;
        float _browExpandUpper;
        float _browExpandLower;
        Texture2D _importedTex; // 사용자 임포트본(로드 시 이전 것 파기)
        Texture _styleTexture;
        float _styleVMin;
        float _styleVMax = 1f;
        bool _styleLumaKey;

        static readonly int StyleTexId = Shader.PropertyToID("_BrowStyleTex");
        static readonly int BrowColorId = Shader.PropertyToID("_BrowColor");
        static readonly int BrowIntensityId = Shader.PropertyToID("_BrowIntensity");
        static readonly int BrowCoverageModeId = Shader.PropertyToID("_BrowCoverageMode");
        static readonly int BrowCoverageDownId = Shader.PropertyToID("_BrowCoverageDown");
        static readonly int StyleVMinId = Shader.PropertyToID("_BrowStyleVMin");
        static readonly int StyleVMaxId = Shader.PropertyToID("_BrowStyleVMax");
        static readonly int LumaKeyId = Shader.PropertyToID("_LumaKey");
        static readonly int StyleFinishId = Shader.PropertyToID("_StyleFinish"); // 마감(Tier B, 0=새틴=기존)
        static readonly int StyleTextureId = Shader.PropertyToID("_StyleTexture"); // 제형(텍스처) GENERIC(0=크림=현행)

        // 투명 픽셀 비율이 이보다 낮으면 알파 없는 그림(흰 배경/JPG)으로 보고 luma-key.
        const float AlphaCutoutThreshold = 0.02f;
        const byte AlphaCropThreshold = 8;
        const int AlphaCropPadPixels = 2;
        // 번들 legacy asset은 새 4–6% 여백/alpha>=0.9 계약보다 오래됐다. source verifier가
        // 실제 PNG bbox(top-origin y=0..128, max alpha<0.9)를 고정 검증하고, 런타임은
        // unreadable import에서도 안전하도록 아래 검증된 crop을 명시 폴백한다.
        const int DefaultStyleAssetWidth = 512;
        const int DefaultStyleAssetHeight = 160;
        const int DefaultStyleAlphaTopMax = 128;
        const float DefaultStyleVMin = 30f / 160f;
        const float DefaultStyleVMax = 1f;

        readonly Vector2[] _up = new Vector2[Seg];
        readonly Vector2[] _lo = new Vector2[Seg];
        readonly Vector2[] _rawUp = new Vector2[Seg];
        readonly Vector2[] _rawLo = new Vector2[Seg];
        readonly Vector2[] _coverageLo = new Vector2[Seg];

        void Awake() => Instance = this;

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
            if (_importedTex != null) Destroy(_importedTex);
            if (_mesh != null) Destroy(_mesh);
            if (_material != null) Destroy(_material);
        }

        public void Init(Camera cam, FaceLandmarkSource source)
        {
            _camera = cam;
            _source = source;

            var shader = Resources.Load<Shader>("BrowStyle");
            if (shader == null) shader = Shader.Find("ARMakeup/BrowStyle");
            _material = new Material(shader);
            _material.renderQueue = MakeupQueues.BrowStyle; // 눈썹 스택 최상위(부위별 고유 큐)

            // 기본 플레이스홀더 텍스처(투명 배경 PNG라 알파=털 → luma-key 끔).
            var def = Resources.Load<Texture2D>("default_brow");
            _styleTexture = def;
            _styleLumaKey = false;
            if (def != null) _material.SetTexture(StyleTexId, def);
            _material.SetFloat(LumaKeyId, 0f);
            ConfigureDefaultStyleUvCrop(def);
            SyncConcealProtectMask();

            _mesh = new Mesh { name = "BrowStyle" };
            _mesh.MarkDynamic();

            var vc = Brows * Seg * 2;
            var uvs = new Vector2[vc];
            var sideIds = new Vector4[vc];
            var tris = new int[Brows * (Seg - 1) * 6];
            for (var e = 0; e < Brows; e++)
            {
                var b = e * Seg * 2;
                for (var i = 0; i < Seg; i++)
                {
                    var along = i / (float)(Seg - 1); // 0 꼬리 → 1 앞머리
                    uvs[b + 2 * i] = new Vector2(along, 0f);     // 하단(폭 0)
                    uvs[b + 2 * i + 1] = new Vector2(along, 1f); // 상단(폭 1)
                    sideIds[b + 2 * i] = new Vector4(e, 0f, 0f, 0f);
                    sideIds[b + 2 * i + 1] = new Vector4(e, 0f, 0f, 0f);
                }
                for (var i = 0; i < Seg - 1; i++)
                {
                    int lo0 = b + 2 * i, up0 = b + 2 * i + 1;
                    int lo1 = b + 2 * (i + 1), up1 = b + 2 * (i + 1) + 1;
                    var t = (e * (Seg - 1) + i) * 6;
                    tris[t] = lo0; tris[t + 1] = up0; tris[t + 2] = lo1;
                    tris[t + 3] = up0; tris[t + 4] = up1; tris[t + 5] = lo1;
                }
            }
            _vertices = new Vector3[vc];
            _mesh.vertices = _vertices;
            _mesh.uv = uvs;
            _mesh.SetUVs(3, new List<Vector4>(sideIds));
            _mesh.triangles = tris;

            gameObject.AddComponent<MeshFilter>().sharedMesh = _mesh;
            _renderer = gameObject.AddComponent<MeshRenderer>();
            _renderer.sharedMaterial = _material;
            _renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _renderer.enabled = false;
        }

        public void ApplyStyleParams(string colorHex, float intensity, float thickness, float arch, int shape, int finish, int texture,
                                     int thicknessProfile, float expandUpper, float expandLower)
        {
            _intensity = Mathf.Clamp01(intensity);
            // R7 두께/아치 이식(섹션 12 정정 1) — BrowRenderer와 동일 클램프·워프.
            _thickness = Mathf.Clamp(thickness, 0.4f, 2f);
            _arch = Mathf.Clamp(arch, 0f, 1f);
            _shape = Mathf.Clamp(shape, 0, 5); // 모양(#19b, 슬롯 공통 — 4=상승 5=반달 포함)
            if (_material == null) return;
            ApplyBrowCoverage(thicknessProfile, expandUpper, expandLower);
            if (!string.IsNullOrEmpty(colorHex) &&
                ColorUtility.TryParseHtmlString(colorHex, out var c))
                _material.SetColor(BrowColorId, c);
            _material.SetFloat(BrowIntensityId, _intensity);
            // 마감(Tier B) — 0=새틴=기존 출력(하위호환).
            _material.SetFloat(StyleFinishId, finish);
            // 제형(텍스처) GENERIC — 0=크림=현행(하위호환). _BrowStyleTex(모양)과 별개 축.
            _material.SetFloat(StyleTextureId, texture);
            SyncConcealProtectMask();
        }

        public void ApplyBrowCoverage(int thicknessProfile, float expandUpper, float expandLower)
        {
            _browThicknessProfile = Mathf.Clamp(thicknessProfile, 0, 6);
            _browExpandUpper = Mathf.Clamp(expandUpper, -0.25f, 0.75f);
            _browExpandLower = Mathf.Clamp(expandLower, -0.25f, 0.75f);
            if (_material == null) return;
            var manualCoverage = Mathf.Max(Mathf.Abs(_browExpandUpper), Mathf.Abs(_browExpandLower));
            _material.SetFloat(BrowCoverageModeId,
                _browThicknessProfile > 0 ? 1f : Mathf.Clamp01(manualCoverage / 0.05f));
            _material.SetFloat(BrowCoverageDownId,
                BrowWarp.EffectiveLowerCoverage(_browThicknessProfile, _browExpandLower));
        }

        /// <summary>
        /// 사용자 임포트: 이미지를 런타임 로드해 스타일 텍스처로 교체.
        /// 투명 배경 PNG면 알파=털, 흰 배경 그림/JPG면 어두운 픽셀=털(luma-key 자동).
        /// </summary>
        public void SetStyleTextureFromFile(string path)
        {
            if (_material == null) return;
            if (!ImageFileLoader.TryLoad(path, out var tex, out var error))
            {
                NativeBridge.Send(new UnityToRNMessage
                { type = "error", message = $"눈썹 스타일 임포트 실패: {error}" });
                return;
            }

            // 투명 영역이 거의 없으면 알파 채널이 없는 그림 → 어두운 획을 털로 인식.
            var lumaKey = ImageFileLoader.TransparentFraction(tex) < AlphaCutoutThreshold;
            _styleLumaKey = lumaKey;
            _material.SetFloat(LumaKeyId, lumaKey ? 1f : 0f);
            ConfigureStyleUvCrop(tex, lumaKey);

            if (_importedTex != null) Destroy(_importedTex);
            _importedTex = tex;
            _styleTexture = tex;
            _material.SetTexture(StyleTexId, tex);
            SyncConcealProtectMask();
        }

        void ConfigureDefaultStyleUvCrop(Texture2D texture)
        {
            if (texture == null)
            {
                SetStyleCrop(0f, 1f);
                return;
            }

            var knownLegacyAsset = texture.width == DefaultStyleAssetWidth
                && texture.height == DefaultStyleAssetHeight;
            Debug.Assert(knownLegacyAsset,
                $"default_brow asset contract changed: {texture.width}x{texture.height}; "
                + $"expected {DefaultStyleAssetWidth}x{DefaultStyleAssetHeight}, alpha top max "
                + DefaultStyleAlphaTopMax);
            if (knownLegacyAsset)
            {
                SetStyleCrop(DefaultStyleVMin, DefaultStyleVMax);
                return;
            }

            // 예상 밖 교체 에셋은 읽을 수 있으면 실제 bbox, 아니면 전체 UV로 안전 폴백.
            ConfigureStyleUvCrop(texture, false);
        }

        void SetStyleCrop(float minV, float maxV)
        {
            _styleVMin = Mathf.Clamp01(minV);
            _styleVMax = Mathf.Clamp(Mathf.Max(_styleVMin, maxV), 0f, 1f);
            if (_material == null) return;
            _material.SetFloat(StyleVMinId, _styleVMin);
            _material.SetFloat(StyleVMaxId, _styleVMax);
        }

        void SyncConcealProtectMask()
        {
            if (BrowRenderer.Instance == null) return;
            BrowRenderer.Instance.SetStyleProtectMask(
                _styleTexture, _styleVMin, _styleVMax, _styleLumaKey);
        }

        /// <summary>
        /// 투명 PNG의 실제 알파 bbox를 세로 밴드에 맞춘다. 흰 배경/JPG(luma-key)는
        /// 알파가 전부 1이므로 전체 UV를 유지한다. crop은 셰이더에서 coverage mode에만
        /// 적용되어 profile 0 저장 룩의 기존 픽셀은 바뀌지 않는다.
        /// </summary>
        void ConfigureStyleUvCrop(Texture2D tex, bool lumaKey)
        {
            if (_material == null || tex == null || lumaKey)
            {
                SetStyleCrop(0f, 1f);
                return;
            }

            try
            {
                var pixels = tex.GetPixels32();
                var width = tex.width;
                var height = tex.height;
                var minY = height;
                var maxY = -1;
                for (var y = 0; y < height; y++)
                {
                    var row = y * width;
                    for (var x = 0; x < width; x++)
                    {
                        if (pixels[row + x].a <= AlphaCropThreshold) continue;
                        minY = Mathf.Min(minY, y);
                        maxY = Mathf.Max(maxY, y);
                    }
                }

                if (maxY < minY)
                {
                    SetStyleCrop(0f, 1f);
                    return;
                }

                minY = Mathf.Max(0, minY - AlphaCropPadPixels);
                maxY = Mathf.Min(height - 1, maxY + AlphaCropPadPixels);
                SetStyleCrop(minY / (float)height, (maxY + 1) / (float)height);
            }
            catch (UnityException)
            {
                // 런타임 임포트 텍스처는 readable이지만 플랫폼 정책이 바뀌어도 안전하게
                // 전체 UV로 폴백한다. 번들 기본 에셋은 Init의 검증된 고정 bbox를 사용한다.
                SetStyleCrop(0f, 1f);
            }
        }

        void LateUpdate()
        {
            var visible = _source != null && _source.HasFace &&
                          FramePresenter.Instance != null && _intensity > 0f;
            if (_renderer.enabled != visible) _renderer.enabled = visible;
            if (!visible) return;

            var lm = _source.Landmarks;
            BrowResponseReference.Apply(_material, lm);
            for (var e = 0; e < Brows; e++)
            {
                BrowWarp.SubdivideArc(lm, BrowUpper[e], _up);
                BrowWarp.SubdivideArc(lm, BrowLower[e], _lo);
                // R7 두께/아치 — 제품 스택(BrowRenderer)과 동일 워프로 텍스처가 따라간다.
                for (var i = 0; i < Seg; i++)
                {
                    var along = i / (float)(Seg - 1);
                    var rawLo = _lo[i];
                    var rawUp = _up[i];
                    _rawLo[i] = rawLo;
                    _rawUp[i] = rawUp;
                    BrowWarp.ShapeBand(
                        ref _lo[i], ref _up[i], along, _thickness, _arch, _shape,
                        _browThicknessProfile, _browExpandUpper, _browExpandLower);
                    BrowWarp.TaperTail(ref _lo[i], ref _up[i], along, _browThicknessProfile,
                        BrowWarp.IsCoverageActive(_browThicknessProfile, _browExpandUpper, _browExpandLower));
                    if (BrowWarp.IsCoverageActive(_browThicknessProfile, _browExpandUpper, _browExpandLower))
                        BrowWarp.EnsureMinimumFinalBandSpan(ref _lo[i], ref _up[i], rawLo, rawUp);
                    _coverageLo[i] = _lo[i];
                }
                // 꼬리 처짐 클램프 — 네 눈썹 렌더러 공유(밴드 동조).
                var browWarped = BrowWarp.WarpAndLiftDroopingTail(
                    _lo, _up, Seg, lm, FramePresenter.Instance.ImageAspect);
                if (BrowWarp.IsCoverageActive(_browThicknessProfile, _browExpandUpper, _browExpandLower))
                    for (var i = 0; i < Seg; i++)
                        BrowWarp.RestoreCoverageLowerFloor(ref _lo[i], ref _up[i], _coverageLo[i], _rawLo[i], _rawUp[i], browWarped);
                var depth = Depth(lm[BrowUpper[e][2]].z);
                var b = e * Seg * 2;
                for (var i = 0; i < Seg; i++)
                {
                    _vertices[b + 2 * i] = ImageToWorld(_lo[i], depth, browWarped);
                    _vertices[b + 2 * i + 1] = ImageToWorld(_up[i], depth, browWarped);
                }
            }
            _mesh.vertices = _vertices;
            _mesh.RecalculateBounds();
        }

        void SubdivideArc(Vector3[] lm, int[] arc, Vector2[] outp)
        {
            var n = arc.Length;
            var mi = 0;
            for (var i = 0; i < n - 1; i++)
            {
                var p1 = ImgPt(lm, arc[i]);
                var p2 = ImgPt(lm, arc[i + 1]);
                var p0 = i == 0 ? p1 : ImgPt(lm, arc[i - 1]);
                var p3 = i + 2 > n - 1 ? p2 : ImgPt(lm, arc[i + 2]);
                outp[mi++] = p1;
                for (var k = 1; k <= Sub; k++)
                    outp[mi++] = CatmullRom(p0, p1, p2, p3, k / (float)(Sub + 1));
            }
            outp[mi++] = ImgPt(lm, arc[n - 1]);
        }

        static Vector2 CatmullRom(Vector2 p0, Vector2 p1, Vector2 p2, Vector2 p3, float t)
        {
            var t2 = t * t;
            var t3 = t2 * t;
            return 0.5f * (2f * p1 + (p2 - p0) * t
                + (2f * p0 - 5f * p1 + 4f * p2 - p3) * t2
                + (3f * p1 - p0 - 3f * p2 + p3) * t3);
        }

        static Vector2 ImgPt(Vector3[] lm, int idx) => new Vector2(lm[idx].x, lm[idx].y);
        float Depth(float z) => DistanceFromCamera * (1f + z * DepthScale);

        Vector3 ImageToWorld(Vector2 img, float depth, bool alreadyWarped = false)
        {
            var vp = alreadyWarped
                ? FramePresenter.Instance.WarpedImageToViewport(img)
                : FramePresenter.Instance.ImageToViewport(img);
            return _camera.ViewportToWorldPoint(new Vector3(vp.x, vp.y, depth));
        }
    }
}
