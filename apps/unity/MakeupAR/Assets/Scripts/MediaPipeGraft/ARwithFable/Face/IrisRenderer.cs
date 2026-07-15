using System.Collections.Generic;
using ARMakeup.Bridge;
using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// 눈 오버레이(홍채 컬러렌즈 + 정밀 아이라이너)를 매 프레임 랜드마크로 갱신해
    /// 렌더한다. FaceMakeup 메시 뒤 큐(Transparent+10~12)에 얹혀 얼굴 위에 합성된다.
    ///
    /// 세 메시:
    ///  - EyeStencil : 눈 열림(상·하안검) 폴리곤 → 스텐실=1 (색/깊이 미기록).
    ///                 개구부를 세로로 살짝 inset해 눈꺼풀 margin 안쪽에서 클립한다.
    ///  - Iris       : 눈동자 링 4점(각도 정렬)을 지나는 Catmull-Rom 닫힌 경계 디스크.
    ///                 실제 홍채 타원에 맞아 흰자 스필/미커버가 없다. 정점색 알파에
    ///                 눈 열림 게이트를 실어, 감으면 렌즈가 완전히 사라진다(깜빡임 누출 차단).
    ///  - Eyeliner   : 상안검 체인을 스플라인 세분한 리본(각짐 제거) + 바깥 눈꼬리 꼬리.
    ///                 꼬리는 스타일(0 윙업 / 1 다운턴 / 2 가로롱)로 방향·길이가 바뀐다.
    ///
    /// 좌표 매핑은 FramePresenter를 공유하므로(배경 영상·얼굴 메시와 동일 변환)
    /// 렌즈가 눈동자에 픽셀 단위로 고정된다. 거리·각도 계산은 등방(iso, x×aspect)
    /// 공간에서 하고 최종만 월드로 — 립 테셀레이션과 동일 규약. MediaPipe 경로 전용.
    /// </summary>
    // 실행 순서 -10: 상안검 스냅(LidSnap) 생산자(LateUpdate.ComputeLidSnaps) —
    // 소비자 LashRenderer(0 이상)보다 먼저 돌아 같은 프레임 스냅을 넘긴다.
    [DefaultExecutionOrder(-10)]
    public class IrisRenderer : MonoBehaviour
    {
        public static IrisRenderer Instance { get; private set; }

        // MediaPipe 홍채 랜드마크(0-index): 468 중심 + 469~472 링(한 눈),
        // 473 중심 + 474~477 링(다른 눈). 좌/우 색은 동일하므로 라벨 무관.
        static readonly int[] IrisCenters = { 468, 473 };
        static readonly int[][] IrisRings =
        {
            new[] { 469, 470, 471, 472 },
            new[] { 474, 475, 476, 477 },
        };

        // 눈 열림 윤곽(상+하안검 루프) — 스텐실 폴리곤. generate-masks.py와 동일 인덱스.
        // 논리 인덱스: [0]=바깥꼬리, [4]=상안검중앙, [8]=안쪽꼬리, [12]=하안검중앙.
        static readonly int[][] EyeContours =
        {
            new[] { 33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7 },
            new[] { 263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249 },
        };
        const int C_OUTER = 0, C_UPPER = 4, C_INNER = 8, C_LOWER = 12;

        // 상안검 체인(속눈썹 라인) — 아이라이너 리본. 각 배열 [0]=바깥 눈꼬리, [끝]=안쪽.
        static readonly int[][] UpperLids =
        {
            new[] { 33, 246, 161, 160, 159, 158, 157, 173, 133 },
            new[] { 263, 466, 388, 387, 386, 385, 384, 398, 362 },
        };

        // 눈썹 아래 라인 — 아이라이너 리본의 "위쪽" 방향 판정 기준. 눈 중심 기준으로
        // 하면 눈 감을 때 상안검점이 중심과 겹쳐 법선 부호가 뒤집히지만(리본 끊김·뜸),
        // 눈썹은 감아도 눈 위에 있어 방향이 안정적이다. generate-masks.py와 동일 인덱스.
        static readonly int[][] BrowLower =
        {
            new[] { 46, 53, 52, 65, 55 },
            new[] { 276, 283, 282, 295, 285 },
        };

        // ── 홍채 디스크 ──
        const int LoopSubdiv = 6;              // 링 세그먼트당 CR 분할 (LoopSubdiv*4 == IrisSegments)
        const int IrisSegments = 24;           // 디스크 테두리 정점 수 (= LoopSubdiv*4)
        const float IrisInset = 0.10f;         // 경계를 홍채 edge보다 안쪽으로(흰자 스필·바깥 삐짐 감소)

        // ── 깜빡임 게이트 (렌즈·아이라이너 공용) ──
        // 감은 눈의 실측 열림비가 0.10보다 커서 렌즈가 옅게 남았다(실기기). 하한을
        // 올려 감았을 때 게이트가 정확히 0이 되게 한다. 아이라이너도 이 게이트로
        // 감을수록 두께가 라인으로 붕괴 + 알파 페이드 → 눈꺼풀 위 뜬 리본 제거.
        const float OpenLo = 0.13f;            // 눈 열림비(갭/가로폭) 하한: 이하 = 게이트 0
        const float OpenHi = 0.22f;            // 상한: 이상 = 게이트 100% (0.09 갭 = 히스테리시스)
        const float StencilInsetFrac = 0.12f;  // 스텐실 개구부 세로 inset(보조 클립)

        // ── 아이라이너 ──
        const int LashSubdiv = 3;              // lash-line 변당 CR 보간 정점 (각짐 제거·조밀화)
        const int TailSubdiv = 6;              // 눈꼬리 꼬리 테셀레이션 점 수
        const int MainPts = 9 + 8 * LashSubdiv; // 세분된 안쪽 체인 점 수 = 33
        const int ChainPts = MainPts + TailSubdiv; // 꼬리 + 메인 = 39
        const int EyelinerStyleCount = 6;
        // 두께: 두꺼우면 눈두덩(아이섀도우 자리)을 덮고 꼬리가 스파이크로 보인다(실기기).
        const float EyelinerThickness = 0.26f; // 눈 반경 대비 리본 최대 두께
        // 세그먼트 좌표축(uv.y): 눈꺼풀 파라메트릭 t = 앞머리(안쪽) 0 → 바깥 눈꼬리
        // 코너 1 → 윙 팁 1+WingTExtent. Eyeliner.shader의 SEG_* 구간(꼬리 0.62~,
        // 앞머리 ~0.22, 눈동자 0.30~0.72)이 이 축 위에서 동작 — 셰이더 주석과 값
        // 일치 필수(윙은 t>1이라 꼬리 구간에 항상 포함). // 실기기 튜닝 대상
        const float WingTExtent = 0.3f;        // 윙이 차지하는 t 폭 (셰이더 SEG_OPEN_HI=2.5 미만 유지)

        // ── E1: 속눈썹 라인 엣지 스냅 ──
        // 상안검 랜드마크는 "라벨 관례점"이라 실제 속눈썹 라인에서 1~4px 편향된다
        // (모노리드에서 위로 뜸). 카메라 프레임에서 리드 노멀 방향으로 짧게 훑어
        // 국소 최암(속눈썹/리드 마진)으로 각 점을 스냅한다. 대비가 약하면(옅은 속눈썹)
        // 랜드마크+드롭 폴백 → 절대 지금보다 나빠지지 않음.
        const float SnapRangeUp = 0.10f;       // 눈 높이 대비 브로우쪽 탐색
        // 눈 쪽(속눈썹) 탐색. 정상 눈은 상안검 랜드마크가 이미 래시 라인에 있어, 아래로
        // 조금만 훑어도 눈동자 위에선 홍채/속눈썹그림자에 닿아 중앙이 처지고 휜다(코너는
        // 흰자라 안 당김). 눈알 못 닿게 아주 짧게 — 래시 뿌리(위 몇 px)만 커버.
        const float SnapRangeDown = 0.09f;
        const int SnapSteps = 12;              // 탐색 샘플 수
        const float SnapMinContrast = 0.06f;   // 최암이 이보다 어두워야 스냅(아니면 폴백)
        const float SnapOffEma = 0.20f;        // 오프셋 시간 EMA(낮을수록 안정, 꿈틀 방지). 바깥 리본 요동 억제
        const float SnapOffEmaFront = 0.08f;   // 앞머리 3점 추가 안정화 (고개 회전 후 들뜸 방지)
        const float EyelinerDropImg = 0.06f;   // 폴백 드롭(눈 높이 대비, 눈 쪽). 크면 전체가 아래로 처짐
        // 눈을 감으면 eyeH가 0으로 붕괴 → 스냅 탐색·드롭이 사라져 라인이 래시 위에 뜬다.
        // 눈폭 기반 하한으로 감는 동안에도 탐색 폭 유지(뜬 눈에선 eyeH가 커서 무영향).
        const float EyeClosedSnapFloor = 0.25f; // 눈폭 대비 스냅 스케일 하한
        const float InnerCornerLiftImg = 0.055f; // 앞머리 끝 리프트(눈 높이 대비) — 눈구석 접합점보다 살짝 위에서 끝나게(0.05→0.055 실기기 튜닝)
        float _innerLiftOverride = -1f;          // (임시 디버그) 브리지 오버라이드 — 음수=미설정
        // 0 윙업, 1 퍼피, 2 롱, 3 캣, 4 스트레이트, 5 소프트 드롭.
        // 각도>0 = 눈썹 방향. 두 배열은 EyelinerStyleCount와 1:1이다.
        static readonly float[] StyleAngleDeg = { 28f, -22f, 0f, 36f, 2f, -12f };
        static readonly float[] StyleTailLen = { 0.45f, 0.4f, 0.7f, 0.58f, 0.55f, 0.5f };

        // ── 아이섀도우 밴드 (동적) ──
        // 안쪽 경계=lash 라인(감아도 경계까지·아래로 안 샘), 위로만 눈썹 방향 확장.
        // generate-masks.py의 SHADOW_HEIGHT(0.65)·안팎 가중 의도를 랜드마크로 계승.
        const float ShadowHeightMult = 1.0f;   // 눈 반경 대비 밴드 최대 높이(눈썹쪽) — 정적 마스크 커버리지에 맞춤
        const float ShadowInnerWeight = 0.45f; // 안쪽 앞머리 농도·높이 가중 (바깥=1.0)
        const float BrowBias = 0.5f;           // 확장 방향을 로컬법선↔눈썹방향 사이로 평활
        const int EyeshadowShapeCount = 12;
        const int EyeshadowTailSubdiv = 6;
        const int EyeshadowPts = MainPts + EyeshadowTailSubdiv;
        const float EyeshadowTailAnatomicalX = 1.28f;
        const float EyeshadowTailLength = 0.28f; // 눈 폭 대비 관자 방향 확장

        const float DistanceFromCamera = 0.5f; // CanonicalFaceMesh와 동일
        const float DepthScale = 1.0f;

        Camera _camera;
        FaceLandmarkSource _source;

        Overlay _stencil, _iris, _eyeliner, _eyeshadow;
        Color32[] _irisColors; // 홍채 정점색(알파 = 눈 열림 게이트)
        float _irisIntensity, _eyelinerIntensity, _eyeshadowIntensity;
        int _eyelinerStyle;
        float _eyeCornerLift; // 눈꼬리 띄우기(R7 워프) — lash 라인 공유라 리본·섀도 동시 리프트
        // 명명 핸들 배수(1=원래) — 상수(EyelinerThickness·StyleTailLen·ShadowHeightMult)에 곱.
        float _linerThickness = 1f;
        float _wingLength = 1f;
        float _shadowHeight = 1f;

        struct Overlay
        {
            public Mesh mesh;
            public MeshRenderer renderer;
            public Vector3[] vertices;
        }

        void Awake() => Instance = this;
        void OnDestroy()
        {
            if (_eyeshadowFinishMap != null) Destroy(_eyeshadowFinishMap);
            if (_eyeshadowDesign != null) Destroy(_eyeshadowDesign);
            for (var slot = 0; slot < MaxLensLayers; slot++)
                if (_lensDesignTex[slot] != null) Destroy(_lensDesignTex[slot]);
            if (Instance == this) Instance = null;
        }

        /// <summary>질감 맵 임포트(#22) — 픽셀별 광 지도(R 광게인·G 시머밀도)를 아이섀도
        /// 마감에 변조. straight 텍스처라 판정 없이 로드. 빈 경로 = 맵 해제(스칼라 균일
        /// 복원, 하위호환). 아이섀도 밴드 머티리얼 전용.</summary>
        public void SetEyeshadowFinishMapFromFile(string path)
        {
            var esMat = _eyeshadow.renderer != null ? _eyeshadow.renderer.sharedMaterial : null;
            if (esMat == null) return;
            if (string.IsNullOrEmpty(path))
            {
                if (_eyeshadowFinishMap != null) { Destroy(_eyeshadowFinishMap); _eyeshadowFinishMap = null; }
                esMat.SetTexture(EyeshadowFinishMapId, Texture2D.whiteTexture);
                esMat.SetFloat(EyeshadowHasFinishMapId, 0f);
                return;
            }
            if (!ImageFileLoader.TryLoad(path, out var tex, out var error))
            {
                NativeBridge.Send(new UnityToRNMessage
                { type = "error", message = $"아이섀도 질감 맵 임포트 실패: {error}" });
                return;
            }
            if (_eyeshadowFinishMap != null) Destroy(_eyeshadowFinishMap);
            _eyeshadowFinishMap = tex;
            esMat.SetTexture(EyeshadowFinishMapId, tex);
            esMat.SetFloat(EyeshadowHasFinishMapId, 1f);
        }

        /// <summary>디자이너 모양 마스크 임포트(§16) — 동적 아이섀도 밴드의 밴드-로컬 UV(uv2:
        /// u=눈앞0→눈꼬리1, v=안검연0→눈썹1)로 샘플하는 흑백/알파 존 스텐실. 색·마감·농도
        /// 축은 앱이 유지(마스크=색 없는 존). 절차 밴드 프로파일 위에 디자이너 그라데/글리터
        /// 형태를 커버리지로 곱한다. 컬러 아트면 TryLoadMask가 거부(텍스처 탭 안내). 빈 경로 =
        /// 마스크 해제(절차 밴드 복원, 하위호환). setRegionMask region="eyeshadow"로 라우팅.</summary>
        public void SetEyeshadowDesignFromFile(string path)
        {
            var esMat = _eyeshadow.renderer != null ? _eyeshadow.renderer.sharedMaterial : null;
            if (esMat == null) return;
            if (string.IsNullOrEmpty(path))
            {
                if (_eyeshadowDesign != null) { Destroy(_eyeshadowDesign); _eyeshadowDesign = null; }
                esMat.SetTexture(EyeshadowDesignId, Texture2D.whiteTexture);
                esMat.SetFloat(EyeshadowHasDesignId, 0f);
                return;
            }
            if (!ImageFileLoader.TryLoadMask(path, out var mask, out var error))
            {
                NativeBridge.Send(new UnityToRNMessage
                { type = "error", message = $"아이섀도 모양 마스크 임포트 실패: {error}" });
                return;
            }
            if (_eyeshadowDesign != null) Destroy(_eyeshadowDesign);
            _eyeshadowDesign = mask;
            esMat.SetTexture(EyeshadowDesignId, mask);
            esMat.SetFloat(EyeshadowHasDesignId, 1f);
        }

        /// <summary>렌즈 레이어드(#25) — 3세부 슬롯 배열을 셰이더 유니폼에 기록한다
        /// (setOverlayLayers 패턴). 각 슬롯: 색·강도·방사 존[inner,outer]·블렌드·디자인.
        /// 빈 배열/null = 레이어드 끄고 legacy irisColor/irisIntensity 어댑터로 복귀
        /// (_LensCount=0). designPath는 슬롯별 경로 캐시로 로드해 슬라이더 드래그 IO 회피.
        /// MAX 초과분은 잘라내고 사용자에게 안내. Init 전 도착해도 sharedMaterial 널가드.</summary>
        public void SetLensLayers(LensLayerParams[] layers)
        {
            var mat = _iris.renderer != null ? _iris.renderer.sharedMaterial : null;
            if (mat == null) return;

            var count = layers != null ? layers.Length : 0;
            if (count > MaxLensLayers)
            {
                NativeBridge.Send(new UnityToRNMessage
                { type = "error", message = $"렌즈 레이어는 최대 {MaxLensLayers}장까지입니다 (초과분 무시)." });
                count = MaxLensLayers;
            }

            for (var slot = 0; slot < MaxLensLayers; slot++)
            {
                var layer = slot < count ? layers[slot] : null;
                if (layer == null)
                {
                    _lensColors[slot] = Vector4.zero;
                    _lensZones[slot] = Vector4.zero;
                    ClearLensDesign(slot, mat);
                    continue;
                }
                var c = Color.white;
                if (!string.IsNullOrEmpty(layer.color)) ColorUtility.TryParseHtmlString(layer.color, out c);
                _lensColors[slot] = new Vector4(c.r, c.g, c.b, Mathf.Clamp01(layer.intensity));
                var inner = Mathf.Clamp01(layer.inner);
                var outer = Mathf.Clamp01(layer.outer);
                if (outer < inner) (inner, outer) = (outer, inner); // 뒤집힘 방어
                var hasDesign = LoadLensDesign(slot, layer.designPath, mat) ? 1f : 0f;
                // 블렌드 모드 0~9 (0노말 1멀티 2스크린 3오버레이 4소프트 5닷지 6번 7라이튼 8다큰 9하드) — Iris.shader LensBlend와 일치
                _lensZones[slot] = new Vector4(inner, outer, Mathf.Clamp(layer.blendMode, 0, 9), hasDesign);
            }
            _lensCount = count;
            mat.SetVectorArray(LensColorId, _lensColors);
            mat.SetVectorArray(LensZoneId, _lensZones);
            mat.SetFloat(LensCountId, _lensCount);
        }

        // 슬롯 디자인 텍스처 로드(경로 캐시 — 같은 경로면 재로드 없음). true=디자인 바인딩됨.
        // 로드 실패는 무음 폴백 — designPath는 스냅샷에 저장되나 세션 tmp URI라 재시작 후
        // stale 경로가 흔하고(그림 파일은 재선택 전제), 절차 방사 그라데로 graceful하게 대체.
        // 에러 토스트를 띄우면 룩 전환마다 스팸이 되므로 렌즈 디자인만은 조용히 넘어간다.
        bool LoadLensDesign(int slot, string path, Material mat)
        {
            if (string.IsNullOrEmpty(path)) { ClearLensDesign(slot, mat); return false; }
            if (path == _lensDesignPaths[slot] && _lensDesignTex[slot] != null) return true;
            if (!ImageFileLoader.TryLoad(path, out var tex, out _))
            {
                ClearLensDesign(slot, mat); // 무음 폴백(절차 그라데)
                return false;
            }
            if (_lensDesignTex[slot] != null) Destroy(_lensDesignTex[slot]);
            _lensDesignTex[slot] = tex;
            _lensDesignPaths[slot] = path;
            mat.SetTexture(LensDesignIds[slot], tex);
            return true;
        }

        void ClearLensDesign(int slot, Material mat)
        {
            if (_lensDesignTex[slot] != null) { Destroy(_lensDesignTex[slot]); _lensDesignTex[slot] = null; }
            _lensDesignPaths[slot] = null;
            mat.SetTexture(LensDesignIds[slot], Texture2D.whiteTexture);
        }

        /// <summary>아이섀도 멀티밴드(A14 ①) — 밴드 배열(≤4)을 셰이더 유니폼에 기록한다
        /// (SetLensLayers 패턴). 각 밴드: 색·강도·색2(그라데 스톱B)·finish·shape·gradient·height.
        /// 밴드 순서 = 그리는 순서(index 0 먼저=아래 lash 쪽, 뒤 밴드가 위). 최대높이 메시
        /// 1장을 밴드별 세로 cutoff(자기높이/최대높이)로 나눠 over 합성한다. 빈 배열/null =
        /// count 0 → legacy 단일 경로 복귀(_EyeshadowColor/_EyeshadowIntensity 스칼라, 픽셀
        /// 동일). 제형 세부(GlossLo 등)·질감맵·디자인 마스크는 v1에서 밴드 공통(ApplyEyeParams
        /// 스칼라) — 배열화는 후속. Init 전 도착해도 sharedMaterial 널가드.</summary>
        public void SetEyeshadowLayers(EyeshadowLayerParams[] layers)
        {
            var esMat = _eyeshadow.renderer != null ? _eyeshadow.renderer.sharedMaterial : null;
            if (esMat == null) return;

            var count = layers != null ? layers.Length : 0;
            if (count > MaxEyeshadowLayers)
            {
                NativeBridge.Send(new UnityToRNMessage
                { type = "error", message = $"아이섀도 밴드는 최대 {MaxEyeshadowLayers}장까지입니다 (초과분 무시)." });
                count = MaxEyeshadowLayers;
            }

            // 최대높이 = 전 밴드 height의 max(최소 1). 메시 봉투 높이 겸 cutoff 정규화 분모.
            // cutoff_b = height_b / maxHeight ∈ [0,1] — 최대높이 밴드가 봉투를 꽉 채운다(1.0).
            var maxHeight = 1f;
            for (var slot = 0; slot < count; slot++)
                if (layers[slot] != null) maxHeight = Mathf.Max(maxHeight, layers[slot].height);

            for (var slot = 0; slot < MaxEyeshadowLayers; slot++)
            {
                var layer = slot < count ? layers[slot] : null;
                if (layer == null)
                {
                    _esLayerColors[slot] = Vector4.zero;
                    _esLayerColor2s[slot] = Vector4.zero;
                    _esLayerParams[slot] = Vector4.zero;
                    continue;
                }
                var c = Color.white;
                if (!string.IsNullOrEmpty(layer.color)) ColorUtility.TryParseHtmlString(layer.color, out c);
                _esLayerColors[slot] = new Vector4(c.r, c.g, c.b, Mathf.Clamp01(layer.intensity));
                // 그라데 스톱B — 빈 값이면 스톱A와 동일 취급(단색). ApplyEyeParams esStopB 규약과 정합.
                var c2 = c;
                if (!string.IsNullOrEmpty(layer.color2)) ColorUtility.TryParseHtmlString(layer.color2, out c2);
                _esLayerColor2s[slot] = new Vector4(c2.r, c2.g, c2.b, 1f);
                var cutoff = Mathf.Clamp01(layer.height / maxHeight);
                _esLayerParams[slot] = new Vector4(
                    cutoff,
                    Mathf.Clamp(layer.finish, 0, 3),
                    Mathf.Clamp(layer.shape, 0, EyeshadowShapeCount - 1),
                    Mathf.Clamp01(layer.gradient));
            }
            _eyeshadowLayerCount = count;
            _eyeshadowMaxHeight = maxHeight;
            esMat.SetVectorArray(EsLayerColorId, _esLayerColors);
            esMat.SetVectorArray(EsLayerColor2Id, _esLayerColor2s);
            esMat.SetVectorArray(EsLayerParamId, _esLayerParams);
            esMat.SetInt(EsLayerCountId, count);
            esMat.SetFloat(EdgeFeatherId, EyeshadowEdgeFeather);
        }

        public void Init(Camera cam, FaceLandmarkSource source)
        {
            _camera = cam;
            _source = source;

            var stencilMat = LoadMaterial("EyeStencil");
            var irisMat = LoadMaterial("Iris");
            var eyelinerMat = LoadMaterial("Eyeliner");
            var eyeshadowMat = LoadMaterial("Eyeshadow");
            // 부위별 고유 큐(MakeupQueues) — 섀도 → 스텐실 → 홍채 → 라이너 순서 고정.
            stencilMat.renderQueue = MakeupQueues.EyeStencil;
            irisMat.renderQueue = MakeupQueues.Iris;
            eyelinerMat.renderQueue = MakeupQueues.Eyeliner;
            eyeshadowMat.renderQueue = MakeupQueues.Eyeshadow;

            // 토폴로지는 고정(정점 수 불변), 위치만 매 프레임 갱신.
            _stencil = BuildOverlay("EyeStencil", stencilMat, BuildStencilTopology(out var sv), sv);
            _iris = BuildOverlay("Iris", irisMat, BuildIrisTopology(out var iv), iv);
            _eyeliner = BuildOverlay("Eyeliner", eyelinerMat, BuildEyelinerTopology(out var ev), ev);
            _eyeshadow = BuildOverlay("Eyeshadow", eyeshadowMat, BuildEyeshadowTopology(out var esv), esv);
            // 디자이너 모양 마스크(§16)용 밴드-로컬 UV(uv2) — 밴드 형태가 프레임마다 변해도
            // 마스크는 밴드 로컬 좌표에 고정돼 따라간다. 정적(정점 인덱스로 결정) — Init 1회.
            _eyeshadow.mesh.uv2 = BuildEyeshadowBandUV(esv);

            // 홍채 정점색: 알파에 눈 열림 게이트를 매 프레임 실어 셰이더가 곱한다
            // (홍채는 감으면 사라져야 함). 아이라이너는 감아도 남으므로 게이트 없음.
            _irisColors = new Color32[iv];
            for (var i = 0; i < iv; i++) _irisColors[i] = new Color32(255, 255, 255, 255);
            _iris.mesh.colors32 = _irisColors;

            ApplyEyeParams(new FilterParams());
        }

        /// <summary>눈 geometry가 등방 좌표에 쓰는 실제 카메라 aspect.</summary>
        public bool TryGetIsoAspect(out float aspect)
        {
            aspect = _camera != null ? _camera.aspect : 0f;
            return aspect > 1e-5f && !float.IsNaN(aspect) && !float.IsInfinity(aspect);
        }

        static Material LoadMaterial(string shaderName)
        {
            var shader = Resources.Load<Shader>(shaderName);
            if (shader == null) shader = Shader.Find("ARMakeup/" + shaderName);
            return new Material(shader);
        }

        Overlay BuildOverlay(string goName, Material mat, (int[] tris, Vector2[] uvs) topo, int vertCount)
        {
            var go = new GameObject(goName);
            go.transform.SetParent(transform, false);
            var mesh = new Mesh { name = goName };
            mesh.MarkDynamic();
            var verts = new Vector3[vertCount];
            mesh.vertices = verts;
            if (topo.uvs != null) mesh.uv = topo.uvs;
            mesh.triangles = topo.tris;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = mat;
            mr.enabled = false;
            return new Overlay { mesh = mesh, renderer = mr, vertices = verts };
        }

        static readonly int IrisColorId = Shader.PropertyToID("_IrisColor");
        static readonly int IrisIntensityId = Shader.PropertyToID("_IrisIntensity");
        // ── 렌즈 레이어드(#25) — Iris.shader LENS_MAX와 일치. 슬롯당 색(rgb)+강도(a),
        // 존(inner,outer,blendMode,hasDesign). 배열은 SetVectorArray로 한 번에 기록. ──
        const int MaxLensLayers = 6;
        static readonly int LensColorId = Shader.PropertyToID("_LensColor");
        static readonly int LensZoneId = Shader.PropertyToID("_LensZone");
        static readonly int LensCountId = Shader.PropertyToID("_LensCount");
        static readonly int[] LensDesignIds =
        {
            Shader.PropertyToID("_LensDesign0"), Shader.PropertyToID("_LensDesign1"),
            Shader.PropertyToID("_LensDesign2"), Shader.PropertyToID("_LensDesign3"),
            Shader.PropertyToID("_LensDesign4"), Shader.PropertyToID("_LensDesign5"),
        };
        readonly Vector4[] _lensColors = new Vector4[MaxLensLayers];
        readonly Vector4[] _lensZones = new Vector4[MaxLensLayers];
        int _lensCount; // >0 = 레이어드 경로, 0 = legacy irisColor/irisIntensity 어댑터
        readonly Texture2D[] _lensDesignTex = new Texture2D[MaxLensLayers]; // 슬롯별 소유(교체 시 파기)
        readonly string[] _lensDesignPaths = new string[MaxLensLayers];     // 재전송 시 재로드 방지 캐시 키
        static readonly int EyelinerColorId = Shader.PropertyToID("_EyelinerColor");
        static readonly int EyelinerIntensityId = Shader.PropertyToID("_EyelinerIntensity");
        static readonly int EyelinerTextureId = Shader.PropertyToID("_EyelinerTexture");
        static readonly int EyelinerSegmentId = Shader.PropertyToID("_EyelinerSegment");
        static readonly int EyelinerFinishId = Shader.PropertyToID("_EyelinerFinish");
        static readonly int EyeshadowColorId = Shader.PropertyToID("_EyeshadowColor");
        static readonly int EyeshadowIntensityId = Shader.PropertyToID("_EyeshadowIntensity");
        static readonly int EyeshadowFinishId = Shader.PropertyToID("_EyeshadowFinish");
        static readonly int EyeshadowShimmerId = Shader.PropertyToID("_EyeshadowShimmer");
        static readonly int EyeshadowColor2Id = Shader.PropertyToID("_EyeshadowColor2");     // R2 그라데 스톱B
        static readonly int EyeshadowGradientId = Shader.PropertyToID("_EyeshadowGradient"); // R2 그라데 강도
        static readonly int EyeshadowShapeId = Shader.PropertyToID("_EyeshadowShape");       // 모양(#19b)
        // 제형 스튜디오(#21) — 마감 세부(0=미지정=enum 기존 동작).
        static readonly int EyeshadowGlossLoId = Shader.PropertyToID("_EyeshadowGlossLo");
        static readonly int EyeshadowGlossGainId = Shader.PropertyToID("_EyeshadowGlossGain");
        static readonly int EyeshadowShimmerSizeId = Shader.PropertyToID("_EyeshadowShimmerSize");
        static readonly int EyeshadowShimmerDensityId = Shader.PropertyToID("_EyeshadowShimmerDensity");
        static readonly int EyeshadowMatteId = Shader.PropertyToID("_EyeshadowMatte");
        static readonly int EyeshadowSheenId = Shader.PropertyToID("_EyeshadowSheen"); // 벨벳 시(0=무효, 머티리얼 기본과 동일)
        static readonly int EyeshadowMaterialId = Shader.PropertyToID("_EyeshadowMaterial");                 // 재질(0=없음 하위호환)
        static readonly int EyeshadowMaterialStrengthId = Shader.PropertyToID("_EyeshadowMaterialStrength");
        // 입자 레이어(글리터) 9축 — density 0=끔.
        static readonly int EsParticleSizeId = Shader.PropertyToID("_EsParticleSize");
        static readonly int EsParticleDensityId = Shader.PropertyToID("_EsParticleDensity");
        static readonly int EsParticleBrightnessId = Shader.PropertyToID("_EsParticleBrightness");
        static readonly int EsParticleColorId = Shader.PropertyToID("_EsParticleColor");
        static readonly int EsParticleTwinkleId = Shader.PropertyToID("_EsParticleTwinkle");
        static readonly int EsParticleShapeId = Shader.PropertyToID("_EsParticleShape");
        static readonly int EsParticleFeatherId = Shader.PropertyToID("_EsParticleFeather");
        static readonly int EsParticleParallaxId = Shader.PropertyToID("_EsParticleParallax");
        static readonly int EsParticleConfettiId = Shader.PropertyToID("_EsParticleConfetti");
        // 질감 맵(#22) — 픽셀별 광 지도 슬롯(아이섀도 밴드 머티리얼).
        static readonly int EyeshadowFinishMapId = Shader.PropertyToID("_EyeshadowFinishMap");
        static readonly int EyeshadowHasFinishMapId = Shader.PropertyToID("_EyeshadowHasFinishMap");
        Texture2D _eyeshadowFinishMap; // 소유(교체·해제 시 파기)
        static readonly int EyeshadowDesignId = Shader.PropertyToID("_EyeshadowDesign");       // 모양 마스크(§16)
        static readonly int EyeshadowHasDesignId = Shader.PropertyToID("_EyeshadowHasDesign");
        Texture2D _eyeshadowDesign; // 소유(교체·해제 시 파기)
        // ── 멀티밴드(A14 ①) — Eyeshadow.shader ES_MAX와 일치. 밴드당 색(rgb)+강도(a),
        // 색2(그라데 스톱B), param(cutoff·finish·shape·gradient). 배열은 SetVectorArray로,
        // count는 SetInt로 한 번에 기록. count=0 = 레거시 단일 경로(픽셀 동일). ──
        const int MaxEyeshadowLayers = 4;
        const float EyeshadowEdgeFeather = 0.45f; // 세로 cutoff 페더 폭(현 0.55~1.0 폭 ≈ 0.45)
        static readonly int EsLayerColorId = Shader.PropertyToID("_EsLayerColor");
        static readonly int EsLayerColor2Id = Shader.PropertyToID("_EsLayerColor2");
        static readonly int EsLayerParamId = Shader.PropertyToID("_EsLayerParam");
        static readonly int EsLayerCountId = Shader.PropertyToID("_EsLayerCount");
        static readonly int EdgeFeatherId = Shader.PropertyToID("_EdgeFeather");
        readonly Vector4[] _esLayerColors = new Vector4[MaxEyeshadowLayers];
        readonly Vector4[] _esLayerColor2s = new Vector4[MaxEyeshadowLayers];
        readonly Vector4[] _esLayerParams = new Vector4[MaxEyeshadowLayers];
        int _eyeshadowLayerCount;         // >0 = 멀티밴드 경로, 0 = 레거시 단일
        float _eyeshadowMaxHeight = 1f;   // 밴드 최대 height (메시 봉투 높이 겸 cutoff 정규화 분모)

        /// <summary>RN applyFilter에서 온 눈 파라미터를 머티리얼/스타일에 반영한다.</summary>
        public void ApplyEyeParams(FilterParams p)
        {
            _irisIntensity = Mathf.Clamp01(p.irisIntensity);
            _eyelinerIntensity = Mathf.Clamp01(p.eyelinerIntensity);
            _eyelinerStyle = Mathf.Clamp(p.eyelinerStyle, 0, EyelinerStyleCount - 1);
            _eyeCornerLift = Mathf.Clamp01(p.eyeCornerLift);
            // 배수 핸들 — JsonUtility 생략 필드는 0이므로 0 이하 = 미설정 → 1(원래).
            _linerThickness = p.eyelinerThickness <= 0f ? 1f : Mathf.Clamp(p.eyelinerThickness, 0.3f, 2.5f);
            _wingLength = p.eyelinerWingLength <= 0f ? 1f : Mathf.Clamp(p.eyelinerWingLength, 0.2f, 2.5f);
            // (임시 디버그) 앞머리 끝 리프트 오버라이드 — 음수=미설정(상수 InnerCornerLiftImg).
            _innerLiftOverride = p.eyelinerInnerLift < 0f ? -1f : Mathf.Clamp(p.eyelinerInnerLift, 0f, 0.15f);
            _shadowHeight = p.eyeshadowHeight <= 0f ? 1f : Mathf.Clamp(p.eyeshadowHeight, 0.3f, 2f);

            var irisMat = _iris.renderer.sharedMaterial;
            if (ColorUtility.TryParseHtmlString(p.irisColor, out var ic)) irisMat.SetColor(IrisColorId, ic);
            irisMat.SetFloat(IrisIntensityId, _irisIntensity);

            var elMat = _eyeliner.renderer.sharedMaterial;
            if (ColorUtility.TryParseHtmlString(p.eyelinerColor, out var ec)) elMat.SetColor(EyelinerColorId, ec);
            elMat.SetFloat(EyelinerIntensityId, _eyelinerIntensity);
            // 질감/부분/마감 — int 필드를 셰이더 float 분기로. 값 의미(0=기본=기존 룩)는
            // BridgeMessages.FilterParams·Eyeliner.shader 주석과 일치(JsonUtility 생략 = 0).
            elMat.SetFloat(EyelinerTextureId, Mathf.Clamp(p.eyelinerTexture, 0, 2));
            elMat.SetFloat(EyelinerSegmentId, Mathf.Clamp(p.eyelinerSegment, 0, 3));
            // 마감 0=새틴 1=매트 2=글로시 3=펄(#19b, 셀 스파클) — Eyeliner.shader 4분기.
            elMat.SetFloat(EyelinerFinishId, Mathf.Clamp(p.eyelinerFinish, 0, 3));

            // 아이섀도우: 정적 마스크(FaceMakeup)에서 옮겨온 동적 밴드.
            // 멀티밴드(A14 ①) 활성 시(_eyeshadowLayerCount>0) 색·강도·마감·그라데·모양 스칼라는
            // 밴드 배열(SetEyeshadowLayers)이 오버라이드하므로 스칼라 세팅을 스킵(중복 방지) —
            // 배열이 유니폼을 소유한다. 제형 세부(GlossLo 등)는 v1에서 밴드 공통이나, 이 블록도
            // 함께 스킵되므로 배열이 활성인 동안엔 배열 설정 직전 applyFilter의 값이 유지된다.
            if (_eyeshadowLayerCount == 0)
            {
                _eyeshadowIntensity = Mathf.Clamp01(p.eyeshadowIntensity);
                var esMat = _eyeshadow.renderer.sharedMaterial;
                if (ColorUtility.TryParseHtmlString(p.eyeshadowColor, out var esc)) esMat.SetColor(EyeshadowColorId, esc);
                esMat.SetFloat(EyeshadowIntensityId, _eyeshadowIntensity);
                esMat.SetFloat(EyeshadowFinishId, p.eyeshadowFinish);
                esMat.SetFloat(EyeshadowShimmerId, Mathf.Clamp01(p.eyeshadowShimmer));
                // ── R2 그라데이션(§3.1) — 스톱B(리드=속눈썹 라인 진한 색) + 강도. 빈 색(생략)은
                // 스톱A와 동일 취급 → 단색 유지. gradient 생략(JsonUtility 0) = 끔 = 기존 출력.
                var esStopB = string.IsNullOrEmpty(p.eyeshadowColor2) ? p.eyeshadowColor : p.eyeshadowColor2;
                if (!string.IsNullOrEmpty(esStopB) && ColorUtility.TryParseHtmlString(esStopB, out var esc2))
                    esMat.SetColor(EyeshadowColor2Id, esc2);
                esMat.SetFloat(EyeshadowGradientId, Mathf.Clamp01(p.eyeshadowGradient));
                // 모양 — 베이스/메인/포인트의 안쪽·중앙·바깥 + 크리스/스모키/와이드 12종.
                esMat.SetFloat(EyeshadowShapeId,
                    Mathf.Clamp(p.eyeshadowShape, 0, EyeshadowShapeCount - 1));
                // 제형 스튜디오(#21) — 마감 세부(전부 0=미지정=enum 기존 동작). Finish.cginc가
                // 다섯 값 합이 0이면 레거시 enum 경로로 분기(하위호환 대수 검증).
                esMat.SetFloat(EyeshadowGlossLoId, Mathf.Clamp01(p.eyeshadowGlossLo));
                esMat.SetFloat(EyeshadowGlossGainId, Mathf.Clamp01(p.eyeshadowGlossGain));
                esMat.SetFloat(EyeshadowShimmerSizeId, Mathf.Clamp01(p.eyeshadowShimmerSize));
                esMat.SetFloat(EyeshadowShimmerDensityId, Mathf.Clamp01(p.eyeshadowShimmerDensity));
                esMat.SetFloat(EyeshadowMatteId, Mathf.Clamp01(p.eyeshadowMatte));
                // 벨벳 시(④) — sheen도 마감 세부 합 게이트(customAmt)에 포함되나 항이 sheen에
                // 선형이라 0=무효=바이트 동일.
                esMat.SetFloat(EyeshadowSheenId, Mathf.Clamp01(p.eyeshadowSheen));
                // 재질 아키타입(벨벳/메탈/홀로) — 0=없음(무변조 하위호환).
                esMat.SetFloat(EyeshadowMaterialId, Mathf.Clamp(p.eyeshadowMaterial, 0, 3));
                esMat.SetFloat(EyeshadowMaterialStrengthId, Mathf.Clamp01(p.eyeshadowMaterialStrength));
                // 입자 레이어(글리터) — density 0=끔(생략 필드와 정합).
                esMat.SetFloat(EsParticleSizeId, Mathf.Clamp01(p.eyeshadowParticleSize));
                esMat.SetFloat(EsParticleDensityId, Mathf.Clamp01(p.eyeshadowParticleDensity));
                esMat.SetFloat(EsParticleBrightnessId, Mathf.Clamp01(p.eyeshadowParticleBrightness));
                if (!string.IsNullOrEmpty(p.eyeshadowParticleColor) &&
                    ColorUtility.TryParseHtmlString(p.eyeshadowParticleColor, out var espc))
                    esMat.SetColor(EsParticleColorId, espc);
                esMat.SetFloat(EsParticleTwinkleId, Mathf.Clamp01(p.eyeshadowParticleTwinkle));
                esMat.SetFloat(EsParticleShapeId, Mathf.Clamp01(p.eyeshadowParticleShape));
                esMat.SetFloat(EsParticleFeatherId, Mathf.Clamp01(p.eyeshadowParticleFeather));
                esMat.SetFloat(EsParticleParallaxId, Mathf.Clamp01(p.eyeshadowParticleParallax));
                esMat.SetFloat(EsParticleConfettiId, Mathf.Clamp01(p.eyeshadowParticleConfetti));
            }
        }

        void LateUpdate()
        {
            var presenter = FramePresenter.Instance;
            var visible = _source != null && _source.HasFace && presenter != null;

            // 레이어드(#25) 활성 시 irisIntensity=0이어도 렌즈가 떠야 하므로 lensCount도 게이트.
            var irisOn = visible && (_irisIntensity > 0f || _lensCount > 0);
            var eyelinerOn = visible && _eyelinerIntensity > 0f;
            // 멀티밴드(A14 ①) 활성 시 스칼라 _eyeshadowIntensity=0이어도 밴드가 떠야 하므로
            // layerCount도 게이트(레이어드 렌즈 irisOn 선례).
            var eyeshadowOn = visible && (_eyeshadowIntensity > 0f || _eyeshadowLayerCount > 0);
            // 속눈썹(LashRenderer)도 같은 스냅+아크 점에 뿌리를 박는 소비자 —
            // 라이너·섀도가 꺼져 있어도 마스카라만으로 스냅 계산을 유지한다.
            var lashWants = visible && LashRenderer.Instance != null && LashRenderer.Instance.WantsLidSnaps;
            // 스텐실 소비자: 렌즈(Equal — 눈 안만) + 하안검 밴드(NotEqual — 눈알 침범 방지).
            var stencilOn = irisOn ||
                            (visible && LowerLidRenderer.Instance != null &&
                             LowerLidRenderer.Instance.NeedsEyeMask);

            if (_stencil.renderer.enabled != stencilOn) _stencil.renderer.enabled = stencilOn;
            if (_iris.renderer.enabled != irisOn) _iris.renderer.enabled = irisOn;
            if (_eyeliner.renderer.enabled != eyelinerOn) _eyeliner.renderer.enabled = eyelinerOn;
            if (_eyeshadow.renderer.enabled != eyeshadowOn) _eyeshadow.renderer.enabled = eyeshadowOn;
            if (!stencilOn && !irisOn && !eyelinerOn && !eyeshadowOn && !lashWants)
            {
                // 얼굴 소실 포함 전부 꺼짐 — 재획득 시 스테일 EMA 출발 방지.
                UnprimeLidSnaps();
                _irisFitPrimed = false;
                return;
            }

            var lm = _source.Landmarks;
            var aspect = _camera.aspect;

            // E1: 속눈썹 라인 스냅을 프레임당 1회 계산(아이라이너·아이섀도우 공유).
            // 미사용 동안엔 프라이밍 해제 — 얼굴 소실 후 재획득 시 다른 위치·스케일의
            // 스테일 오프셋에서 EMA가 출발하는 것 방지(하안검 스냅과 동일 규약).
            if (eyelinerOn || eyeshadowOn || lashWants) ComputeLidSnaps(lm);
            else UnprimeLidSnaps();

            if (stencilOn) UpdateStencil(lm, aspect);
            if (irisOn) UpdateIris(lm, aspect);
            else _irisFitPrimed = false;
            if (eyelinerOn) UpdateEyeliner(lm, aspect);
            if (eyeshadowOn) UpdateEyeshadow(lm, aspect);
        }

        void UnprimeLidSnaps()
        {
            _lidSnapPrimed = false;
            _lidFit[0].Reset();
            _lidFit[1].Reset();
        }

        // ── 좌표 헬퍼: 이미지 정규화 좌표 → 등방(iso, x×aspect) → 뷰포트 → 월드 ──
        Vector2 Iso(int idx, Vector3[] lm, float aspect)
        {
            var vp = FramePresenter.Instance.ImageToViewport(new Vector2(lm[idx].x, lm[idx].y));
            return new Vector2(vp.x * aspect, vp.y);
        }

        Vector3 IsoToWorld(Vector2 iso, float aspect, float depth)
        {
            var vp = new Vector2(iso.x / aspect, iso.y);
            return _camera.ViewportToWorldPoint(new Vector3(vp.x, vp.y, depth));
        }

        static Vector2 IsoToViewport(Vector2 iso, float aspect) =>
            new Vector2(iso.x / aspect, iso.y);

        float Depth(float z) => DistanceFromCamera * (1f + z * DepthScale);

        static Vector2 Perp(Vector2 v) => new Vector2(-v.y, v.x);

        // 이미지 정규화 좌표(엣지 스냅용) ↔ iso.
        static Vector2 ImgPt(Vector3[] lm, int idx) => new Vector2(lm[idx].x, lm[idx].y);
        Vector2 IsoP(Vector2 img, float aspect)
        {
            var vp = FramePresenter.Instance.ImageToViewport(img);
            return new Vector2(vp.x * aspect, vp.y);
        }

        // ── E1: 상안검 9점을 실제 속눈썹 라인으로 스냅 (이미지 공간) ──
        readonly Vector2[][] _lidSnap = { new Vector2[9], new Vector2[9] };
        /// <summary>ComputeLidSnaps가 마지막으로 돈 프레임 — 소비자(LashRenderer)가
        /// 신선도 판정(당 프레임 또는 직전 프레임 = LateUpdate 순서 무보장 허용).</summary>
        public int LidSnapFrame { get; private set; } = -1;
        /// <summary>스냅+아크 피팅까지 끝난 상안검 9점(이미지 공간, [0]=바깥 눈꼬리 →
        /// [8]=안쪽 앞머리). 라이너 리본·섀도 밴드와 동일 점 — 속눈썹이 이 점에 뿌리를
        /// 박으면 라이너와 정합 + 모양 단위 안정화를 공짜로 얻는다. LidSnapFrame으로
        /// 신선도 확인 후 사용(스테일이면 원시 랜드마크 폴백).</summary>
        public Vector2[] GetLidSnap(int eye) => _lidSnap[eye];
        readonly float[][] _lidOffEma = { new float[9], new float[9] };
        readonly Vector2[] _lidPtmp = new Vector2[9];   // 스냅 계산용 임시(점 위치)
        readonly Vector2[] _lidNtmp = new Vector2[9];   // 임시(노멀)
        readonly float[] _lidRawTmp = new float[9];     // 임시(원시 오프셋)
        bool _lidSnapPrimed;
        // 스냅된 체인의 점별 독립 수직 지터를 모양 단위로 상쇄 — 코너 고정 아크
        // 피팅(하안검 0f63e2c 패턴). 라이너 리본·아이섀도 밴드가 이 점들을 공유한다.
        const float LidFitEma = 0.4f; // LowerLidRenderer.FitEma와 동일 근거
        readonly LidArcFit[] _lidFit = { new LidArcFit(LidFitEma), new LidArcFit(LidFitEma) };

        void ComputeLidSnaps(Vector3[] lm)
        {
            var haveFrame = _source != null && _source.HasPresentedFrame;
            for (var e = 0; e < UpperLids.Length; e++)
            {
                var lid = UpperLids[e];
                var contour = EyeContours[e];
                var eyeH = Vector2.Distance(ImgPt(lm, contour[C_UPPER]), ImgPt(lm, contour[C_LOWER]));
                var eyeWidth = Vector2.Distance(ImgPt(lm, contour[C_OUTER]), ImgPt(lm, contour[C_INNER]));
                // 감을 때 eyeH 붕괴로 스냅이 래시에 못 닿는 것 방지 — 눈폭 기반 하한.
                var snapScale = Mathf.Max(eyeH, EyeClosedSnapFloor * eyeWidth);
                Vector2 center = Vector2.zero;
                foreach (var idx in contour) center += ImgPt(lm, idx);
                center /= contour.Length;
                var dropOff = EyelinerDropImg * snapScale;

                var n = lid.Length;
                // 1차: 점별 원시 스냅 오프셋 계산 (+ 점 위치·노멀 임시 저장)
                for (var i = 0; i < n; i++)
                {
                    var p = ImgPt(lm, lid[i]);
                    var prev = ImgPt(lm, lid[Mathf.Max(i - 1, 0)]);
                    var next = ImgPt(lm, lid[Mathf.Min(i + 1, n - 1)]);
                    var nrm = Perp(next - prev);
                    if (nrm.sqrMagnitude < 1e-12f) nrm = center - p;
                    nrm = nrm.normalized;
                    if (Vector2.Dot(nrm, center - p) < 0f) nrm = -nrm; // + = 눈 쪽(마진)
                    _lidPtmp[i] = p;
                    _lidNtmp[i] = nrm;

                    var rawOff = dropOff; // 기본 = 폴백 드롭
                    if (haveFrame && eyeH > 1e-5f &&
                        _source.TrySampleLuma(p.x, p.y, out var lm0))
                    {
                        float bestOff = 0f, bestL = lm0;
                        for (var s = 0; s <= SnapSteps; s++)
                        {
                            var off = Mathf.Lerp(-SnapRangeUp, SnapRangeDown, s / (float)SnapSteps) * snapScale;
                            var q = p + nrm * off;
                            if (_source.TrySampleLuma(q.x, q.y, out var l) && l < bestL)
                            {
                                bestL = l;
                                bestOff = off;
                            }
                        }
                        if (lm0 - bestL > SnapMinContrast) rawOff = bestOff;
                    }
                    _lidRawTmp[i] = rawOff;
                }

                // 2차: 오프셋을 점들 사이 공간 스무딩(애벌레 꿈틀 = 인접점 오프셋
                // 독립 요동이 원인) 후 시간 EMA. 라인이 부드럽고 안정적으로 스냅.
                for (var i = 0; i < n; i++)
                {
                    var a = _lidRawTmp[Mathf.Max(i - 1, 0)];
                    var b = _lidRawTmp[Mathf.Min(i + 1, n - 1)];
                    var sm = 0.5f * _lidRawTmp[i] + 0.25f * (a + b);
                    if (!_lidSnapPrimed) _lidOffEma[e][i] = sm;
                    else
                    {
                        // 앞머리 3점은 고개 회전 후 들뜸 방지 위해 더 강한 EMA.
                        // 체인은 [0]=바깥 눈꼬리 → [n-1]=안쪽 앞머리(UpperLids 주석)라
                        // 앞머리 = 뒤쪽 3점이다(i<3은 눈꼬리를 잡던 인덱스 버그).
                        var ema = i >= n - 3 ? SnapOffEmaFront : SnapOffEma;
                        _lidOffEma[e][i] = Mathf.Lerp(_lidOffEma[e][i], sm, ema);
                    }
                    // 코너 무스냅 테이퍼 — 최암 밴드 스냅은 중앙 lid에서만 유효하다.
                    // 눈머리·눈꼬리 근처는 가장 어두운 곳이 속눈썹이 아니라 눈구석
                    // (카런클) 그림자라 스냅이 라인을 눈 안쪽으로 끌어내려 눈을 가리고
                    // (앞머리 처짐, 실기기), 저대비 폴백 dropOff도 코너를 무조건
                    // 떨어뜨린다. 끝점 0 → 둘째 점 0.5 → 셋째 점부터 1로 수렴시켜
                    // 코너는 원시 랜드마크에 정확히 머물게 한다.
                    var cornerTaper = Mathf.Min(Mathf.Min(i, n - 1 - i) * 0.5f, 1f);
                    // 앞머리 끝점 리프트 — 랜드마크 133/362는 속눈썹 라인 끝이 아니라
                    // 눈구석 접합점(살짝 아래)이라, 무스냅으로 정확히 붙여도 라인 끝이
                    // 미세하게 처져 보인다(실기기). 관습대로 접합점보다 살짝 위에서
                    // 끝나도록 안쪽 끝만 눈높이 비례로 들어올린다(눈꼬리는 윙 앵커라 불변).
                    var liftAmt = _innerLiftOverride >= 0f ? _innerLiftOverride : InnerCornerLiftImg;
                    var innerLift = liftAmt * snapScale * (1f - cornerTaper) * (i / (float)(n - 1));
                    _lidSnap[e][i] = _lidPtmp[i] + _lidNtmp[i] * (_lidOffEma[e][i] * cornerTaper - innerLift);
                }

                // 아크 피팅 — 스냅까지 끝난 9점의 수직 성분을 코너 고정 3차식으로
                // 교체. 점별 노이즈가 최소제곱 평균으로 상쇄돼 라인이 안 떨린다.
                // 부호 기준은 눈썹 방향(감아도 안정, 리본 법선 판정과 동일 근거).
                _lidFit[e].Apply(_lidSnap[e], n, ImgPt(lm, BrowLower[e][2]) - _lidPtmp[4]);
            }
            _lidSnapPrimed = true;
            LidSnapFrame = Time.frameCount;
        }

        /// <summary>uniform Catmull-Rom — CanonicalFaceMesh.CatmullRom과 동일 기저.
        /// 등간격 링(홍채 4점)엔 적합. 불균등 체인(lash)엔 CatmullRomC(중심분리) 사용.</summary>
        static Vector2 CatmullRom(Vector2 p0, Vector2 p1, Vector2 p2, Vector2 p3, float t)
        {
            var t2 = t * t;
            var t3 = t2 * t;
            return 0.5f * (2f * p1 + (p2 - p0) * t
                + (2f * p0 - 5f * p1 + 4f * p2 - p3) * t2
                + (3f * p1 - p0 - 3f * p2 + p3) * t3);
        }

        /// <summary>중심분리(centripetal, α=0.5) Catmull-Rom. 불균등 간격에서 오버슈트·꺾임
        /// 없이 P1→P2 보간 — lash 라인 앞머리(안쪽 곡률 촘촘) 꺾임 방지. u∈[0,1]이 P1→P2.</summary>
        static Vector2 CatmullRomC(Vector2 p0, Vector2 p1, Vector2 p2, Vector2 p3, float u)
        {
            float Knot(float t, Vector2 a, Vector2 b) => t + Mathf.Sqrt((a - b).magnitude + 1e-5f);
            float t0 = 0f, t1 = Knot(t0, p1, p0), t2 = Knot(t1, p2, p1), t3 = Knot(t2, p3, p2);
            float t = Mathf.Lerp(t1, t2, u);
            var a1 = Vector2.LerpUnclamped(p0, p1, (t - t0) / (t1 - t0));
            var a2 = Vector2.LerpUnclamped(p1, p2, (t - t1) / (t2 - t1));
            var a3 = Vector2.LerpUnclamped(p2, p3, (t - t2) / (t3 - t2));
            var b1 = Vector2.LerpUnclamped(a1, a2, (t - t0) / (t2 - t0));
            var b2 = Vector2.LerpUnclamped(a2, a3, (t - t1) / (t3 - t1));
            return Vector2.LerpUnclamped(b1, b2, (t - t1) / (t2 - t1));
        }

        /// <summary>눈 열림비(상하 갭 / 가로폭) → [0,1] 게이트. UpdateMouthOpenness와 동형.</summary>
        float EyeOpenness(Vector3[] lm, float aspect, int e)
        {
            var c = EyeContours[e];
            var gap = Vector2.Distance(Iso(c[C_UPPER], lm, aspect), Iso(c[C_LOWER], lm, aspect));
            var width = Vector2.Distance(Iso(c[C_OUTER], lm, aspect), Iso(c[C_INNER], lm, aspect));
            var ratio = gap / Mathf.Max(width, 1e-4f);
            return Mathf.SmoothStep(0f, 1f, Mathf.Clamp01((ratio - OpenLo) / (OpenHi - OpenLo)));
        }

        void UpdateStencil(Vector3[] lm, float aspect)
        {
            var v = _stencil.vertices;
            var vi = 0;
            for (var e = 0; e < EyeContours.Length; e++)
            {
                var contour = EyeContours[e];
                // 개구부를 세로 중심으로 살짝 inset (가로폭·눈꼬리 보존, 상하만 좁힘).
                var isos = _stencilIsoTmp; // 프리할당 스크래치(눈당 완전 소비 후 재사용)
                var centerY = 0f;
                float depthSum = 0f;
                Vector2 centroidIso = Vector2.zero;
                for (var k = 0; k < contour.Length; k++)
                {
                    isos[k] = Iso(contour[k], lm, aspect);
                    centerY += isos[k].y;
                    depthSum += Depth(lm[contour[k]].z);
                    centroidIso += isos[k];
                }
                centerY /= contour.Length;
                centroidIso /= contour.Length;
                var depth = depthSum / contour.Length;
                for (var k = 0; k < contour.Length; k++)
                    isos[k].y += (centerY - isos[k].y) * StencilInsetFrac;

                v[vi++] = IsoToWorld(centroidIso, aspect, depth); // 중심(팬 기준점)
                for (var k = 0; k < contour.Length; k++)
                    v[vi++] = IsoToWorld(isos[k], aspect, depth);
            }
            Commit(_stencil);
        }

        // ── 렌즈 시간 평활 — "모양 단위" 안정화 ──
        // 홍채 랜드마크(468~477)는 별도 정제 서브모델 출력이라 얼굴 메시 점보다
        // 노이즈가 크고, 상류 핀 블렌드는 잔여지연 큰(=노이즈 큰) 점일수록 raw를
        // 통과시켜 필터를 덜 건다. 경계 선명한 디스크라 노이즈가 그대로 "떨림"으로
        // 보인다. 화면 좌표에 EMA를 걸면 머리 이동 때 렌즈가 눈을 못 따라가므로
        // (스위밍), 눈코너 앵커 상대 오프셋(머리 이동 불변) + 눈폭 대비 반경(거리
        // 불변)에만 건다 — 머리 이동·줌은 무지연, 랜드마크 노이즈만 흡수.
        const float IrisCenterEma = 0.4f;   // 중심 — 시선 사카드도 2~3프레임 내 추종
        const float IrisRadiusEma = 0.25f;  // 반경 — 형태는 천천히 변하므로 더 강하게
        const float IrisEmaOpenMin = 0.05f; // 이하 열림(감음)엔 EMA 동결 — 붕괴 좌표 오염 방지
        readonly Vector2[] _irisOffEma = new Vector2[2];
        readonly Vector2[] _irisRadEma = new Vector2[2]; // x=장축/눈폭, y=단축/눈폭
        bool _irisFitPrimed;

        // ── LateUpdate 힙 할당 제거 — 프레임당 재사용 스크래치(_lidPtmp 등과 동일 패턴) ──
        // 좌/우 눈이 같은 프레임에 순차 처리되나, 각 배열은 다음 눈(또는 다음 용도) 처리 전에
        // 완전히 소비된다(월드 정점 커밋 / _chainTmp로 복사). 반환 배열도 로컬 사용 후 폐기라
        // 밖에 참조로 보관되지 않으므로 눈 간·용도 간 공유가 안전하다.
        readonly Vector2[] _stencilIsoTmp = new Vector2[EyeContours[0].Length]; // UpdateStencil inset
        readonly Vector2[] _irisPtmp = new Vector2[4];        // UpdateIris 4점 iso 위치
        readonly float[] _irisRadTmp = new float[4];          // UpdateIris 4점 반경
        readonly float[] _irisAngTmp = new float[4];          // SortByAngle 각도 버퍼
        readonly Vector2[] _lashTmp = new Vector2[MainPts];   // BuildLashLine 세분 lash 라인
        readonly Vector2[] _chainTmp = new Vector2[ChainPts]; // BuildEyelinerChain 꼬리+메인

        // 핏 핸들은 원시 랜드마크를 재계산하지 않고 실제 메시가 쓴 최종 점을 노출한다.
        // IrisRenderer는 실행 순서 -10이라 StencilGuideRenderer가 같은 프레임 값을 읽는다.
        readonly Vector2[] _fitWingVp = new Vector2[2];
        readonly Vector2[] _fitLinerBoundaryVp = new Vector2[2];
        readonly Vector2[] _fitInnerEndpointVp = new Vector2[2];
        readonly int[] _fitEyelinerFrame = { -1, -1 };
        readonly bool[] _fitEyelinerValid = new bool[2];
        readonly Vector2[] _fitEyeshadowBaseVp = new Vector2[2];
        readonly int[] _fitEyeshadowFrame = { -1, -1 };
        readonly bool[] _fitEyeshadowValid = new bool[2];

        /// <summary>현재/직전 프레임 실제 아이라이너 메시의 윙 팁, 중앙 바깥 경계,
        /// 눈머리 끝점(뷰포트 좌표). 얼굴 소실·스테일 값은 반환하지 않는다.</summary>
        public bool TryGetEyelinerFitHandles(
            int eye, out Vector2 wingVp, out Vector2 boundaryVp, out Vector2 innerVp)
        {
            wingVp = boundaryVp = innerVp = Vector2.zero;
            if (eye < 0 || eye >= _fitEyelinerFrame.Length ||
                _source == null || !_source.HasFace || FramePresenter.Instance == null ||
                !_fitEyelinerValid[eye]) return false;
            var frame = _fitEyelinerFrame[eye];
            if (frame < Time.frameCount - 1 || frame > Time.frameCount) return false;
            wingVp = _fitWingVp[eye];
            boundaryVp = _fitLinerBoundaryVp[eye];
            innerVp = _fitInnerEndpointVp[eye];
            return true;
        }

        /// <summary>현재/직전 프레임 실제 아이섀도 메시의 안정된 하단(lash) 중앙점.</summary>
        public bool TryGetEyeshadowFitHandle(int eye, out Vector2 baseVp)
        {
            baseVp = Vector2.zero;
            if (eye < 0 || eye >= _fitEyeshadowFrame.Length ||
                _source == null || !_source.HasFace || FramePresenter.Instance == null ||
                !_fitEyeshadowValid[eye]) return false;
            var frame = _fitEyeshadowFrame[eye];
            if (frame < Time.frameCount - 1 || frame > Time.frameCount) return false;
            baseVp = _fitEyeshadowBaseVp[eye];
            return true;
        }

        void UpdateIris(Vector3[] lm, float aspect)
        {
            var v = _iris.vertices;
            var vi = 0;
            var P = _irisPtmp; // 프리할당 스크래치(눈당 재사용)
            for (var e = 0; e < IrisCenters.Length; e++)
            {
                var ring = IrisRings[e];
                var depth = Depth(lm[IrisCenters[e]].z);

                for (var j = 0; j < 4; j++) P[j] = Iso(ring[j], lm, aspect);
                // 중심 = 실제 홍채 중심 랜드마크(468/473) — 튄 경계점에 안 흔들린다.
                var c = Iso(IrisCenters[e], lm, aspect);

                // 반경 이상치 제거: 한 점이 코너로 튀면(오버슈트·오검출) 홍채가 뾰족해진다.
                // 4점 반경을 중앙값 기준 ±10%로 클램프 — 홍채는 원형이라 실제 형태 손실 없음.
                var med = Median4((P[0] - c).magnitude, (P[1] - c).magnitude,
                                  (P[2] - c).magnitude, (P[3] - c).magnitude);
                for (var j = 0; j < 4; j++)
                {
                    var dir = P[j] - c;
                    var r = dir.magnitude;
                    if (r > 1e-6f)
                        P[j] = c + dir * (Mathf.Clamp(r, med * 0.9f, med * 1.1f) / r);
                }

                // 각도 정렬(필수) — 링 인덱스 순서를 신뢰하면 bowtie가 난다.
                SortByAngle(P, c);

                var open = EyeOpenness(lm, aspect, e);
                var gate = (byte)Mathf.RoundToInt(open * 255f);

                // 제어점 통과 방식(CR 스플라인) 폐기 — 4점이 불규칙해도 구조적으로 뾰족하지
                // 않은 매끈한 타원을 렌더링. 4점으로부터 타원 장·단축 반경을 계산해
                // 매개변수 방정식(cos/sin)으로 호를 그린다. 뾰족함 원천 봉쇄.
                var radii = _irisRadTmp; // 프리할당 스크래치(눈당 재사용)
                for (var j = 0; j < 4; j++) radii[j] = (P[j] - c).magnitude;
                // 타원 장축(max 거리) · 단축(min 거리) — 4점 반경 범위에서 도출.
                // 불규칙한 4점이 와도 min/max로 강건한 타원 비율을 형성한다.
                var a = Mathf.Max(radii[0], radii[1], radii[2], radii[3]); // 장축
                var b = Mathf.Min(radii[0], radii[1], radii[2], radii[3]); // 단축

                // 시간 평활 — 눈코너 앵커 상대·눈폭 정규화 좌표에서만(위 주석 참조).
                var contour = EyeContours[e];
                var cornerO = Iso(contour[C_OUTER], lm, aspect);
                var cornerI = Iso(contour[C_INNER], lm, aspect);
                var anchor = (cornerO + cornerI) * 0.5f;
                var eyeW = Mathf.Max((cornerO - cornerI).magnitude, 1e-5f);
                var off = (c - anchor) / eyeW;
                var rad = new Vector2(a, b) / eyeW;
                if (!_irisFitPrimed)
                {
                    _irisOffEma[e] = off;
                    _irisRadEma[e] = rad;
                }
                else if (open > IrisEmaOpenMin) // 감은 동안엔 마지막 유효 형태 유지
                {
                    _irisOffEma[e] = Vector2.Lerp(_irisOffEma[e], off, IrisCenterEma);
                    _irisRadEma[e] = Vector2.Lerp(_irisRadEma[e], rad, IrisRadiusEma);
                }
                c = anchor + _irisOffEma[e] * eyeW;
                a = _irisRadEma[e].x * eyeW;
                b = _irisRadEma[e].y * eyeW;

                var vCenter = vi;
                v[vi++] = IsoToWorld(c, aspect, depth); // 중심 (radial 0)
                // 매개변수 방정식: (a*cos(θ), b*sin(θ)). k∈[0,IrisSegments]로 시임 이음
                // 정점(k=IrisSegments, θ=2π = k=0과 동일 위치)을 하나 더 둔다 — uv.y가 닫는
                // 웨지에서 0.958→1.0로 보간돼 방사 디자인 각도 랩 시임을 없앤다(#25).
                for (var k = 0; k <= IrisSegments; k++)
                {
                    var theta = k * 2f * Mathf.PI / IrisSegments;
                    var ax = a * Mathf.Cos(theta);
                    var ay = b * Mathf.Sin(theta);
                    var bp = c + new Vector2(ax, ay) * (1f - IrisInset);
                    v[vi++] = IsoToWorld(bp, aspect, depth); // 테두리 (radial 1)
                }

                for (var k = vCenter; k < vi; k++) _irisColors[k].a = gate;
            }
            _irisFitPrimed = true;
            _iris.mesh.colors32 = _irisColors;
            Commit(_iris);

            UpdatePupilFrac(lm);
        }

        // ── E2: 동공 반경 스냅 ──
        // 고정 _PupilFrac(0.42)은 홍채 색소가 동공을 먹거나 흰자로 새게 한다.
        // 이미지에서 방사 방향 최암(동공)→밝아짐(홍채) 경계를 찾아 매 프레임 반영.
        // 어두운 홍채(대비 약함)면 실패 → 기본값 유지(폴백).
        static readonly int PupilFracId = Shader.PropertyToID("_PupilFrac");
        float _pupilFracEma = 0.42f;
        bool _pupilPrimed;

        void UpdatePupilFrac(Vector3[] lm)
        {
            if (_source == null || !_source.HasPresentedFrame) return;
            var sum = 0f;
            var n = 0;
            for (var e = 0; e < IrisCenters.Length; e++)
            {
                var f = EstimatePupilFrac(lm, IrisRings[e]);
                if (f > 0f) { sum += f; n++; }
            }
            if (n == 0) return; // 대비 약함 — 이전 값 유지
            var target = sum / n;
            if (!_pupilPrimed) { _pupilPrimed = true; _pupilFracEma = target; }
            else _pupilFracEma = Mathf.Lerp(_pupilFracEma, target, 0.2f);
            _iris.renderer.sharedMaterial.SetFloat(PupilFracId, _pupilFracEma);
        }

        float EstimatePupilFrac(Vector3[] lm, int[] ring)
        {
            Vector2 c = Vector2.zero;
            for (var j = 0; j < 4; j++) c += ImgPt(lm, ring[j]);
            c *= 0.25f;
            var rad = 0f;
            for (var j = 0; j < 4; j++) rad += Vector2.Distance(ImgPt(lm, ring[j]), c);
            rad *= 0.25f;
            if (rad < 1e-5f) return -1f;

            const int RadSteps = 10, AngSteps = 8;
            float prevL = -1f, edgeFrac = -1f, maxGrad = 0f;
            for (var ri = 1; ri <= RadSteps; ri++)
            {
                var frac = ri / (float)RadSteps * 0.9f;
                float s = 0f;
                var cnt = 0;
                for (var a = 0; a < AngSteps; a++)
                {
                    var ang = a / (float)AngSteps * 2f * Mathf.PI;
                    var q = c + new Vector2(Mathf.Cos(ang), Mathf.Sin(ang)) * (rad * frac);
                    if (_source.TrySampleLuma(q.x, q.y, out var l)) { s += l; cnt++; }
                }
                if (cnt == 0) continue;
                var avg = s / cnt;
                if (prevL >= 0f)
                {
                    var grad = avg - prevL; // 동공(어두움)→홍채(밝음)에서 최대
                    if (grad > maxGrad) { maxGrad = grad; edgeFrac = frac; }
                }
                prevL = avg;
            }
            if (edgeFrac < 0f || maxGrad < 0.03f) return -1f; // 경계 불명확
            return Mathf.Clamp(edgeFrac, 0.2f, 0.55f);
        }

        /// <summary>4값 중앙값(가운데 둘의 평균) — 홍채 반경 이상치 클램프 기준.</summary>
        static float Median4(float a, float b, float c, float d)
        {
            float lo1 = Mathf.Min(a, b), hi1 = Mathf.Max(a, b);
            float lo2 = Mathf.Min(c, d), hi2 = Mathf.Max(c, d);
            // 두 정렬쌍의 큰-작은 값과 작은-큰 값의 평균 = 4값의 중앙 둘 평균.
            return 0.5f * (Mathf.Max(lo1, lo2) + Mathf.Min(hi1, hi2));
        }

        // 힙 할당 제거 위해 비정적화(_irisAngTmp 재사용) — 호출부는 UpdateIris 1곳뿐.
        void SortByAngle(Vector2[] p, Vector2 c)
        {
            // 4원소 삽입 정렬 (중심 기준 atan2 오름차순).
            var ang = _irisAngTmp; // 프리할당 스크래치(p.Length==4 고정)
            for (var i = 0; i < p.Length; i++) ang[i] = Mathf.Atan2(p[i].y - c.y, p[i].x - c.x);
            for (var i = 1; i < p.Length; i++)
            {
                var a = ang[i];
                var pt = p[i];
                var j = i - 1;
                while (j >= 0 && ang[j] > a) { ang[j + 1] = ang[j]; p[j + 1] = p[j]; j--; }
                ang[j + 1] = a;
                p[j + 1] = pt;
            }
        }

        void UpdateEyeliner(Vector3[] lm, float aspect)
        {
            var v = _eyeliner.vertices;
            var vi = 0;
            for (var e = 0; e < UpperLids.Length; e++)
            {
                var contour = EyeContours[e];
                Vector2 centroidIso = Vector2.zero;
                foreach (var idx in contour) centroidIso += Iso(idx, lm, aspect);
                centroidIso /= contour.Length;
                float eyeRadius = 0f;
                foreach (var idx in contour) eyeRadius += Vector2.Distance(Iso(idx, lm, aspect), centroidIso);
                eyeRadius /= contour.Length;

                var chain = BuildEyelinerChain(lm, aspect, e, centroidIso, eyeRadius);
                var depth = Depth(lm[UpperLids[e][0]].z);
                // 리본 "위쪽"(두께 오프셋 방향) 판정 기준 = 눈썹 중심 방향.
                // 감아도 안정적이라 리본이 끊기거나 뜨지 않고 눈 모양을 따라 남는다.
                Vector2 browIso = Vector2.zero;
                foreach (var b in BrowLower[e]) browIso += Iso(b, lm, aspect);
                browIso /= BrowLower[e].Length;
                var browUp = (browIso - centroidIso).normalized;
                var cornerThick = EyelinerThickness * eyeRadius * _linerThickness; // 두께 핸들
                // 속눈썹 밀착은 E1(ComputeLidSnaps)이 이미지 공간에서 처리 —
                // 여기선 스냅된 라인 위에 두께만 얹는다.

                // 윙을 코너 단면 [코너, 코너상단]을 메인 리본과 공유하는 삼각형으로 만든다.
                // 예전엔 꼬리와 메인 리본이 코너 위에서 둘 다 채워져 겹쳤고(alpha 이중 →
                // 어두운 쐐기), 이걸 없애려면 꼬리의 outer를 [코너상단→팁] 직선 위에 둬서
                // 두 형태가 코너 단면만 공유하고 서로 바깥/안쪽으로 갈라지게 한다.
                var corner = chain[TailSubdiv];       // = main[0] (바깥 눈꼬리)
                var tip = chain[0];                   // 꼬리 끝
                var cornerTangent = (chain[TailSubdiv + 1] - corner).normalized; // 메인 lash 접선만
                var cornerNormal = Perp(cornerTangent);
                if (Vector2.Dot(cornerNormal, browUp) < 0f) cornerNormal = -cornerNormal;
                var cornerTop = corner + cornerNormal * cornerThick;
                var middleBoundary = cornerTop;

                for (var j = 0; j < ChainPts; j++)
                {
                    var p = chain[j];
                    Vector2 outer;
                    if (j < TailSubdiv) // 윙 삼각형: outer는 [코너상단→팁] 위 (겹침 방지)
                    {
                        var frac = (TailSubdiv - j) / (float)TailSubdiv; // 팁=1 → 코너근처=1/TailSubdiv
                        outer = Vector2.Lerp(cornerTop, tip, frac);
                    }
                    else // 메인 리본: 법선 오프셋(꼬리→안쪽 테이퍼). 코너 법선은 메인 접선만 사용.
                    {
                        var prev = chain[Mathf.Max(j - 1, TailSubdiv)];
                        var next = chain[Mathf.Min(j + 1, ChainPts - 1)];
                        var tang = next - prev;
                        if (tang.sqrMagnitude < 1e-12f) tang = new Vector2(1f, 0f);
                        tang.Normalize();
                        var nrm = Perp(tang);
                        if (Vector2.Dot(nrm, browUp) < 0f) nrm = -nrm;
                        var mi = j - TailSubdiv;
                        var s = mi / (float)(MainPts - 1); // 0=바깥꼬리 → 1=안쪽(앞머리)
                        var taper = Mathf.Lerp(1f, 0.3f, s);
                        // 안쪽 끝(앞머리)에서 래시라인이 커미셔로 급히 떨어져 접선이 수직→법선이
                        // 수평이 되면 리본이 코너를 지나 피부로 뾰족하게 삐진다. 마지막 15%를
                        // 두께 0으로 수렴시켜 깔끔한 점으로 끝나게 한다(스파이크 제거).
                        taper *= Mathf.Clamp01((1f - s) / 0.15f);
                        outer = p + nrm * (cornerThick * taper);
                    }

                    if (j == TailSubdiv + MainPts / 2) middleBoundary = outer;

                    v[vi++] = IsoToWorld(p, aspect, depth);          // 안쪽(라인)
                    v[vi++] = IsoToWorld(outer, aspect, depth);      // 바깥(테두리)
                }

                _fitWingVp[e] = IsoToViewport(tip, aspect);
                _fitLinerBoundaryVp[e] = IsoToViewport(middleBoundary, aspect);
                _fitInnerEndpointVp[e] = IsoToViewport(chain[ChainPts - 1], aspect);
                _fitEyelinerFrame[e] = Time.frameCount;
                _fitEyelinerValid[e] = true;
            }
            Commit(_eyeliner);
        }

        /// <summary>상안검 lash 라인을 스플라인 세분한 MainPts점 (립 테셀레이션과 동일,
        /// 끝점 코너 클램프). [0]=바깥 눈꼬리, [끝]=안쪽. 아이라이너·아이섀도우 공유.</summary>
        Vector2[] BuildLashLine(Vector3[] lm, float aspect, int e)
        {
            // E1 스냅된 상안검 9점(이미지 좌표)을 iso로 올려 CR 세분.
            var snap = _lidSnap[e];
            var n = snap.Length; // 9
            var main = _lashTmp; // 프리할당 스크래치(호출부가 즉시 소비/복사 후 폐기)
            var mi = 0;
            for (var i = 0; i < n - 1; i++)
            {
                var p1 = IsoP(snap[i], aspect);
                var p2 = IsoP(snap[i + 1], aspect);
                var p0 = i == 0 ? p1 : IsoP(snap[i - 1], aspect);
                var p3 = i + 2 > n - 1 ? p2 : IsoP(snap[i + 2], aspect);
                main[mi++] = p1;
                for (var k = 1; k <= LashSubdiv; k++)
                    main[mi++] = CatmullRomC(p0, p1, p2, p3, k / (float)(LashSubdiv + 1));
            }
            main[mi++] = IsoP(snap[n - 1], aspect); // = MainPts

            // 눈꼬리 띄우기(R7 워프) — 바깥꼬리 쪽만 눈썹 방향으로 리프트. 아이라이너
            // 리본과 아이섀도 밴드가 이 라인을 공유하므로 한 곳 워프로 함께 올라가고,
            // 윙(BuildEyelinerChain)은 코너(main[0])를 기준 삼아 자동 추종한다.
            if (_eyeCornerLift > 0f)
            {
                var up = (Iso(BrowLower[e][2], lm, aspect) - IsoP(snap[4], aspect)).normalized;
                var eyeDist = (main[0] - main[MainPts - 1]).magnitude;
                for (var i = 0; i < MainPts; i++)
                    main[i] = EyeWarp.LiftCorner(
                        main[i], 1f - i / (float)(MainPts - 1), up, eyeDist, _eyeCornerLift);
            }
            return main;
        }

        /// <summary>꼬리(tip→코너) + 스플라인 세분한 상안검 체인(코너→안쪽) = ChainPts점.</summary>
        Vector2[] BuildEyelinerChain(Vector3[] lm, float aspect, int e, Vector2 centroidIso, float eyeRadius)
        {
            var lid = UpperLids[e];
            var main = BuildLashLine(lm, aspect, e); // 세분 lash 라인(MainPts점, [0]=바깥꼬리)
            var corner = main[0];

            // 꼬리 방향: 눈 장축(안쪽꼬리→바깥꼬리, 바깥 방향)에서 위(눈썹 방향)로 스타일
            // 각도만큼 회전. lash 접선을 쓰면 바깥에서 아래로 처져 윙이 처진 스파이크가
            // 되므로(실기기), 안정적인 장축 기준으로 위로 뻗게 한다.
            Vector2 browIso = Vector2.zero;
            foreach (var b in BrowLower[e]) browIso += Iso(b, lm, aspect);
            browIso /= BrowLower[e].Length;
            var browUp = (browIso - centroidIso).normalized;
            var axis = (corner - Iso(lid[lid.Length - 1], lm, aspect)).normalized; // 바깥 방향
            var u = (browUp - Vector2.Dot(browUp, axis) * axis).normalized;         // axis 수직 "위"
            var theta = StyleAngleDeg[_eyelinerStyle] * Mathf.Deg2Rad;
            var wingDir = (Mathf.Cos(theta) * axis + Mathf.Sin(theta) * u).normalized;
            var len = StyleTailLen[_eyelinerStyle] * eyeRadius * _wingLength; // 윙 길이 핸들

            var chain = _chainTmp; // 프리할당 스크래치(UpdateEyeliner가 눈당 즉시 소비)
            for (var j = 0; j < TailSubdiv; j++)
            {
                var m = TailSubdiv - j; // tip(j=0,m=6) → 코너 근처(j=5,m=1)
                chain[j] = corner + wingDir * (len * m / TailSubdiv);
            }
            for (var k = 0; k < MainPts; k++) chain[TailSubdiv + k] = main[k];
            return chain;
        }

        /// <summary>
        /// 아이섀도우 밴드: 안쪽 경계=lash 라인, 위로만 눈썹 방향으로 확장한 초승달.
        /// lash 아래로 안 내려가고(앞머리 눈밑 샘 방지), 감으면 lash가 내려오며
        /// 밴드도 따라가 경계까지 채워진다. 바깥 눈꼬리는 높고 진하게, 안쪽 앞머리는
        /// 낮고 옅게(가중). 세로/가로 그라디언트는 셰이더가 uv로 처리.
        /// </summary>
        void UpdateEyeshadow(Vector3[] lm, float aspect)
        {
            var v = _eyeshadow.vertices;
            var vi = 0;
            // 봉투 높이 배수: 멀티밴드(A14 ①) 활성 시 = 밴드 최대 height(모든 밴드를 담는
            // 봉투 — 셰이더가 밴드별 cutoff로 세로 분할), 레거시(count=0) = 기존 _shadowHeight.
            var heightMult = _eyeshadowLayerCount > 0 ? _eyeshadowMaxHeight : _shadowHeight;
            for (var e = 0; e < UpperLids.Length; e++)
            {
                var contour = EyeContours[e];
                Vector2 centroidIso = Vector2.zero;
                foreach (var idx in contour) centroidIso += Iso(idx, lm, aspect);
                centroidIso /= contour.Length;
                float eyeRadius = 0f;
                foreach (var idx in contour) eyeRadius += Vector2.Distance(Iso(idx, lm, aspect), centroidIso);
                eyeRadius /= contour.Length;

                Vector2 browIso = Vector2.zero;
                foreach (var b in BrowLower[e]) browIso += Iso(b, lm, aspect);
                browIso /= BrowLower[e].Length;
                var browUp = (browIso - centroidIso).normalized;

                var lash = BuildLashLine(lm, aspect, e); // MainPts점, [0]=바깥꼬리
                var depth = Depth(lm[UpperLids[e][0]].z);
                _fitEyeshadowBaseVp[e] = IsoToViewport(lash[MainPts / 2], aspect);
                _fitEyeshadowFrame[e] = Time.frameCount;
                _fitEyeshadowValid[e] = true;

                // 기존 바깥 눈꼬리보다 관자 방향으로 0.28 eye-width 연장한다. 양쪽 눈 모두
                // lash[0]이 해부학적 바깥점이라 화면 좌우 분기 없이 자동 미러링된다.
                var eyeWidth = Vector2.Distance(lash[0], lash[MainPts - 1]);
                var tailTangent = lash[0] - lash[1];
                if (tailTangent.sqrMagnitude < 1e-12f) tailTangent = new Vector2(1f, 0f);
                tailTangent.Normalize();
                var tailDir = Vector2.Lerp(tailTangent, browUp, 0.14f).normalized;
                var outerTangent = lash[1] - lash[0];
                if (outerTangent.sqrMagnitude < 1e-12f) outerTangent = new Vector2(1f, 0f);
                outerTangent.Normalize();
                var outerNormal = Perp(outerTangent);
                if (Vector2.Dot(outerNormal, browUp) < 0f) outerNormal = -outerNormal;
                var outerUp = Vector2.Lerp(outerNormal, browUp, BrowBias).normalized;
                var outerHeight = eyeRadius * ShadowHeightMult * heightMult;
                for (var j = 0; j < EyeshadowTailSubdiv; j++)
                {
                    var tailT = (EyeshadowTailSubdiv - j) / (float)EyeshadowTailSubdiv;
                    var p = lash[0] + tailDir * (eyeWidth * EyeshadowTailLength * tailT);
                    var heightFade = Mathf.Lerp(1f, 0.48f, tailT);
                    v[vi++] = IsoToWorld(p, aspect, depth);
                    v[vi++] = IsoToWorld(p + outerUp * outerHeight * heightFade, aspect, depth);
                }

                for (var i = 0; i < MainPts; i++)
                {
                    var p = lash[i];
                    var prev = lash[Mathf.Max(i - 1, 0)];
                    var next = lash[Mathf.Min(i + 1, MainPts - 1)];
                    var tang = next - prev;
                    if (tang.sqrMagnitude < 1e-12f) tang = new Vector2(1f, 0f);
                    tang.Normalize();
                    var nrm = Perp(tang);
                    if (Vector2.Dot(nrm, browUp) < 0f) nrm = -nrm;
                    // 위로만 확장 — 로컬 법선을 눈썹 방향으로 바이어스(요동 억제).
                    var dir = Vector2.Lerp(nrm, browUp, BrowBias).normalized;

                    var s = i / (float)(MainPts - 1);            // 0=바깥꼬리 → 1=안쪽앞머리
                    var weight = Mathf.Lerp(1f, ShadowInnerWeight, s);
                    var h = eyeRadius * ShadowHeightMult * weight * heightMult; // 높이 핸들(스모키)/봉투

                    v[vi++] = IsoToWorld(p, aspect, depth);           // 안쪽(lash, uv.x=0)
                    v[vi++] = IsoToWorld(p + dir * h, aspect, depth); // 바깥(위, uv.x=1)
                }
            }
            Commit(_eyeshadow);
            _eyeshadow.mesh.RecalculateNormals(); // 재질이 눈두덩 굴곡에 반응하도록(홍채/라이너는 불필요)
        }

        void Commit(Overlay o)
        {
            o.mesh.vertices = o.vertices;
            o.mesh.RecalculateBounds();
        }

        // ── 토폴로지 빌더: 정점 수 반환 + 삼각형/UV 생성 (Init에서 1회) ──
        (int[], Vector2[]) BuildStencilTopology(out int vertCount)
        {
            var perEye = 1 + 16; // 중심 + 윤곽 16
            vertCount = EyeContours.Length * perEye;
            var tris = new List<int>();
            for (var e = 0; e < EyeContours.Length; e++)
            {
                var b = e * perEye;
                for (var k = 0; k < 16; k++)
                {
                    tris.Add(b);                    // 중심
                    tris.Add(b + 1 + k);
                    tris.Add(b + 1 + (k + 1) % 16); // 닫힌 루프
                }
            }
            return (tris.ToArray(), null);
        }

        (int[], Vector2[]) BuildIrisTopology(out int vertCount)
        {
            // 링 정점 = IrisSegments + 1 (시임 이음 정점 중복 — 방사 디자인 각도 랩 시임 제거).
            // 정점 k=IrisSegments는 k=0과 같은 위치(θ=2π)지만 uv.y=1.0이라, 닫는 웨지가
            // 0.958→1.0로 보간된다(← 예전 24개일 땐 0.958→0 역주행으로 임포트 디자인 시임).
            var ringVerts = IrisSegments + 1;
            var perEye = 1 + ringVerts;
            vertCount = IrisCenters.Length * perEye;
            var tris = new List<int>();
            var uvs = new Vector2[vertCount];
            for (var e = 0; e < IrisCenters.Length; e++)
            {
                var b = e * perEye;
                uvs[b] = Vector2.zero; // 중심 radial 0, 각도 0
                for (var k = 0; k <= IrisSegments; k++)
                    // uv.x = radial 1(테두리), uv.y = 각도 0..1 (k=IrisSegments → 1.0 시임 이음).
                    uvs[b + 1 + k] = new Vector2(1f, k / (float)IrisSegments);
                // 명시적 닫는 정점이 있어 modulo 불필요 — 각 웨지는 (중심, k, k+1) 팬.
                for (var k = 0; k < IrisSegments; k++)
                {
                    tris.Add(b);
                    tris.Add(b + 1 + k);
                    tris.Add(b + 1 + k + 1);
                }
            }
            return (tris.ToArray(), uvs);
        }

        (int[], Vector2[]) BuildEyelinerTopology(out int vertCount)
        {
            var perEye = 2 * ChainPts; // inner/outer 쌍
            vertCount = UpperLids.Length * perEye;
            var tris = new List<int>();
            var uvs = new Vector2[vertCount];
            for (var e = 0; e < UpperLids.Length; e++)
            {
                var b = e * perEye;
                for (var j = 0; j < ChainPts; j++)
                {
                    // uv.x = 라인 알파. 메인=1, 꼬리는 tip(0)→코너로 램프 → 꼬리 끝 페이드.
                    var ax = j < TailSubdiv ? j / (float)TailSubdiv : 1f;
                    // uv.y = 눈꺼풀 파라메트릭 t (세그먼트 마스크 축, WingTExtent 주석 참조):
                    // 메인 = 앞머리 0 → 코너 1 (체인 인덱스 균등 — 랜드마크가 대략 등간격이라
                    // 호길이 근사로 충분), 윙 = 코너 근처 → 팁 1+WingTExtent.
                    var t = j < TailSubdiv
                        ? 1f + WingTExtent * (TailSubdiv - j) / (float)TailSubdiv
                        : 1f - (j - TailSubdiv) / (float)(MainPts - 1);
                    uvs[b + 2 * j] = new Vector2(ax, t);     // 안쪽(라인)
                    uvs[b + 2 * j + 1] = new Vector2(0f, t); // 바깥(테두리)
                }
                for (var k = 0; k < ChainPts - 1; k++)
                {
                    var q = b + 2 * k;
                    tris.Add(q); tris.Add(q + 1); tris.Add(q + 2);
                    tris.Add(q + 1); tris.Add(q + 3); tris.Add(q + 2);
                }
            }
            return (tris.ToArray(), uvs);
        }

        (int[], Vector2[]) BuildEyeshadowTopology(out int vertCount)
        {
            var perEye = 2 * EyeshadowPts; // tail + inner(lash)/outer(위) 쌍
            vertCount = UpperLids.Length * perEye;
            var tris = new List<int>();
            var uvs = new Vector2[vertCount];
            for (var e = 0; e < UpperLids.Length; e++)
            {
                var b = e * perEye;
                for (var j = 0; j < EyeshadowTailSubdiv; j++)
                {
                    uvs[b + 2 * j] = new Vector2(0f, 1f);
                    uvs[b + 2 * j + 1] = new Vector2(1f, 1f);
                }
                for (var i = 0; i < MainPts; i++)
                {
                    var s = i / (float)(MainPts - 1);
                    var weight = Mathf.Lerp(1f, ShadowInnerWeight, s); // 가로 농도(바깥1→앞머리0.45)
                    // uv.x = 세로(0 lash 진함 → 1 위 페이드), uv.y = 가로 가중
                    var q = b + 2 * (EyeshadowTailSubdiv + i);
                    uvs[q] = new Vector2(0f, weight);     // 안쪽(lash)
                    uvs[q + 1] = new Vector2(1f, weight); // 바깥(위)
                }
                for (var k = 0; k < EyeshadowPts - 1; k++)
                {
                    var q = b + 2 * k;
                    tris.Add(q); tris.Add(q + 1); tris.Add(q + 2);
                    tris.Add(q + 1); tris.Add(q + 3); tris.Add(q + 2);
                }
            }
            return (tris.ToArray(), uvs);
        }

        // 디자이너 모양 마스크(§16)용 밴드-로컬 UV(uv2). BuildEyeshadowTopology와 동일 정점
        // 순회 — 반드시 일치해야 셰이더가 같은 정점에 같은 (u,v)를 읽는다.
        //  u = 밴드 따라: 눈앞(inner) 0 → 눈꼬리(outer) 1. lash[0]=바깥꼬리라 i=0이 outer →
        //      u = 1 - i/(MainPts-1) (양 눈 모두 anatomically outer=1 = 대칭, 미러 불필요).
        //  v = 밴드 가로질러: 안검연(lash) 0 → 눈썹쪽(위) 1. inner쌍=0, outer쌍=1.
        //  Unity 텍스처 규약(0,0=좌하)과 정합: 마스크 하단=lash, 상단=눈썹, 좌=눈앞, 우=눈꼬리.
        //  밴드는 열린 스트립(각도 랩 없음)이라 IrisRenderer 링 시임(uv.y=1 중복정점) 불필요 —
        //  u=0/u=1은 스트립 양 끝(자연 경계)일 뿐 이음새가 아니다.
        Vector2[] BuildEyeshadowBandUV(int vertCount)
        {
            var perEye = 2 * EyeshadowPts;
            var uv2 = new Vector2[vertCount];
            for (var e = 0; e < UpperLids.Length; e++)
            {
                var b = e * perEye;
                for (var j = 0; j < EyeshadowTailSubdiv; j++)
                {
                    var tailT = (EyeshadowTailSubdiv - j) / (float)EyeshadowTailSubdiv;
                    var u = Mathf.Lerp(1f, EyeshadowTailAnatomicalX, tailT);
                    uv2[b + 2 * j] = new Vector2(u, 0f);
                    uv2[b + 2 * j + 1] = new Vector2(u, 1f);
                }
                for (var i = 0; i < MainPts; i++)
                {
                    var u = 1f - i / (float)(MainPts - 1); // 눈앞 0 → 눈꼬리 1
                    var q = b + 2 * (EyeshadowTailSubdiv + i);
                    uv2[q] = new Vector2(u, 0f);     // 안쪽(lash, v=0 안검연)
                    uv2[q + 1] = new Vector2(u, 1f); // 바깥(위,  v=1 눈썹쪽)
                }
            }
            return uv2;
        }
    }
}
