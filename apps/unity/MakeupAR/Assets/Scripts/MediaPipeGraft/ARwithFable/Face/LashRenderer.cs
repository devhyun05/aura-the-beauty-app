using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// 마스카라(속눈썹) — PencilRenderer의 절차적 스트로크 모델을 lash 파라미터로
    /// 일반화한 것(설계 섹션 12 step 4). 상안검 lash 라인을 밴드 삼아 위·바깥으로
    /// 뻗는 가는 테이퍼 쿼드(속눈썹)를 뿌린다.
    ///
    /// 결 방향: 앞머리(안쪽)는 거의 수직, 바깥 눈꼬리로 갈수록 바깥 스윕(부챗살) —
    /// 펜슬과 동일 모델, 계수만 lash용. 결정론적 해시로 위치·길이·각도를 흔들어
    /// 자연스럽게(시드 고정이라 프레임 간 안 떨림). Pencil.shader 재사용(루마 보존).
    ///
    /// 눈꼬리 띄우기(eyeCornerLift)를 다른 눈 제품과 동일하게 적용 — 리프트 시
    /// 라이너·섀도와 함께 속눈썹도 올라간다. MediaPipe 경로 전용.
    ///
    /// 아래 속눈썹(lowerLashIntensity)도 이 파일의 분기로 그린다 — 스트로크 모델
    /// (테이퍼 쿼드·결정론 해시 변이·부챗살 스윕·아크 리샘플)이 위 속눈썹과 동일해
    /// 새 렌더러면 전부 중복이고, 부트스트랩(ARBootstrap — 타 트랙 사용 중이라 동결)
    /// 배선도 불필요. 위보다 짧고 성기게(자연 기본), 방향만 아래·색은 mascaraColor 공용.
    /// </summary>
    // 실행 순서 +10: IrisRenderer(-10)의 LidSnap 소비자 — 스냅 생산 뒤에 돌아 같은
    // 프레임 값을 읽는다. LidSnapFrame 스테일 허용 가드는 안전망으로 유지.
    [DefaultExecutionOrder(10)]
    public class LashRenderer : MonoBehaviour
    {
        public static LashRenderer Instance { get; private set; }

        // 상안검 lash 라인: 바깥 눈꼬리 → 안쪽 눈머리 (EyelinerStyleRenderer와 동일).
        static readonly int[][] UpperLids =
        {
            new[] { 33, 246, 161, 160, 159, 158, 157, 173, 133 },
            new[] { 263, 466, 388, 387, 386, 385, 384, 398, 362 },
        };
        // 하안검 lash 라인: 바깥 눈꼬리 → 안쪽 눈머리.
        // 출처: LowerLidRenderer.LowerLids 복사 — 공유 상수 승격은 타 트랙과 충돌
        // 위험해 보류(값 변경 시 두 곳 동기 필요).
        static readonly int[][] LowerLids =
        {
            new[] { 33, 7, 163, 144, 145, 153, 154, 155, 133 },
            new[] { 263, 249, 390, 373, 374, 380, 381, 382, 362 },
        };
        // 눈썹 하단 — "위" 방향 기준(눈 감아도 부호 안정).
        static readonly int[][] BrowLower =
        {
            new[] { 46, 53, 52, 65, 55 },
            new[] { 276, 283, 282, 295, 285 },
        };

        const int Eyes = 2;
        const int LidPts = 9;
        const int Sub = 2;
        const int Seg = (LidPts - 1) * (Sub + 1) + 1; // 25

        const int LashesPerEye = 28;
        const float LenFactor = 0.16f;   // 속눈썹 길이 = 눈 가로폭 × 이 값
        const float WidthMult = 0.07f;   // 길이 대비 뿌리 폭
        const float SweepMax = 0.9f;     // 바깥 눈꼬리에서 바깥 스윕
        // 앞머리는 살짝 코쪽(음수 = 안쪽 스윕) — 양수 하한이면 앞머리~중간 가닥까지
        // 전부 꼬리쪽을 봐서 "뒷방향" 인상(실기기). 선형 lerp로 u≈0.28에서 0을
        // 지나 바깥 스윕으로 자연 전환.
        const float SweepMin = -0.35f;
        const float EdgeFade = 0.06f;    // 양끝(코너) 근처 길이 테이퍼 구간

        // 아래 속눈썹 — 위보다 짧고 성기게(자연 기본). 폭·엣지 테이퍼는 위와 공유.
        const int LowerLashesPerEye = 16;     // 개수 (위 28보다 성기게) // 실기기 튜닝 대상
        const float LowerLenFactor = 0.09f;   // 길이 = 눈 가로폭 × 이 값 (위 0.16보다 짧게) // 실기기 튜닝 대상
        const float LowerSweepMax = 0.7f;     // 바깥 눈꼬리 스윕 (위 0.9보다 완만) // 실기기 튜닝 대상
        const float LowerSweepMin = -0.25f;   // 앞머리는 살짝 코쪽(위 SweepMin과 동일 근거) // 실기기 튜닝 대상
        // 위 속눈썹과 다른 변이 패턴을 얻기 위한 해시 시드 오프셋(위: 0..2*28-1 사용).
        const int LowerSeedOffset = 1000;

        const float DistanceFromCamera = 0.5f;
        const float DepthScale = 1.0f;

        Camera _camera;
        FaceLandmarkSource _source;
        Mesh _mesh;
        MeshRenderer _renderer;
        Material _material;
        Vector3[] _vertices;
        float _intensity;
        float _cornerLift; // 눈꼬리 띄우기(R7 워프) — 라이너·섀도와 동일 정규화 리프트
        float _lengthMult = 1f; // 속눈썹 길이 배수 핸들 (1=원래)
        int _style;             // 모양: 0=내추럴 1=돌리 2=캣아이 3=오픈아이 4=위스피
        // 아래 속눈썹 — 전용 메시/머티리얼(강도·길이 독립, 색은 mascaraColor 공용).
        Mesh _lowerMesh;
        MeshRenderer _lowerRenderer;
        Material _lowerMaterial;
        Vector3[] _lowerVertices;
        float _lowerIntensity;
        float _lowerLengthMult = 1f; // 아래 속눈썹 길이 배수 (mascaraLength와 독립)
        int _lowerStyle;             // 아래 속눈썹 모양 — 위와 같은 5종, 값 독립

        static readonly int ColorId = Shader.PropertyToID("_BrowColor");
        static readonly int IntensityId = Shader.PropertyToID("_BrowIntensity");
        static readonly int FinishId = Shader.PropertyToID("_PencilFinish"); // 마감(Tier B) — 위·아래 머티리얼 독립

        readonly Vector2[] _ctrl = new Vector2[LidPts];
        readonly Vector2[] _lash = new Vector2[Seg];

        void Awake() => Instance = this;
        void OnDestroy() { if (Instance == this) Instance = null; }

        public void Init(Camera cam, FaceLandmarkSource source)
        {
            _camera = cam;
            _source = source;

            var shader = Resources.Load<Shader>("Pencil");
            if (shader == null) shader = Shader.Find("ARMakeup/Pencil");

            // 위 속눈썹(마스카라) — 이 GO 자체에.
            _material = new Material(shader);
            _material.renderQueue = MakeupQueues.Mascara; // 라이너 위에 털
            _mesh = BuildStrokeMesh("Mascara", Eyes * LashesPerEye, out _vertices);
            gameObject.AddComponent<MeshFilter>().sharedMesh = _mesh;
            _renderer = gameObject.AddComponent<MeshRenderer>();
            _renderer.sharedMaterial = _material;
            _renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _renderer.enabled = false;

            // 아래 속눈썹 — 자식 GO. 같은 Pencil 셰이더(루마 보존), 강도·길이 독립이라
            // 전용 머티리얼. 큐는 하안검 밴드(애교살·아이라인 하) 바로 위(LowerLash).
            _lowerMaterial = new Material(shader);
            _lowerMaterial.renderQueue = MakeupQueues.LowerLash;
            _lowerMesh = BuildStrokeMesh("LowerLash", Eyes * LowerLashesPerEye, out _lowerVertices);
            var lowerGO = new GameObject("LowerLash");
            lowerGO.transform.SetParent(transform, false);
            lowerGO.AddComponent<MeshFilter>().sharedMesh = _lowerMesh;
            _lowerRenderer = lowerGO.AddComponent<MeshRenderer>();
            _lowerRenderer.sharedMaterial = _lowerMaterial;
            _lowerRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _lowerRenderer.enabled = false;
        }

        // 스트로크(테이퍼 쿼드) 메시 토폴로지 — 위/아래 속눈썹 공용.
        static Mesh BuildStrokeMesh(string name, int strokes, out Vector3[] vertices)
        {
            var mesh = new Mesh { name = name };
            mesh.MarkDynamic();

            var uvs = new Vector2[strokes * 4];
            var tris = new int[strokes * 6];
            for (var s = 0; s < strokes; s++)
            {
                var v = s * 4;
                uvs[v] = new Vector2(0f, 0f);     // 뿌리-좌
                uvs[v + 1] = new Vector2(0f, 1f); // 뿌리-우
                uvs[v + 2] = new Vector2(1f, 0f); // 끝-좌
                uvs[v + 3] = new Vector2(1f, 1f); // 끝-우
                var t = s * 6;
                tris[t] = v; tris[t + 1] = v + 2; tris[t + 2] = v + 1;
                tris[t + 3] = v + 1; tris[t + 4] = v + 2; tris[t + 5] = v + 3;
            }
            vertices = new Vector3[strokes * 4];
            mesh.vertices = vertices;
            mesh.uv = uvs;
            mesh.triangles = tris;
            return mesh;
        }

        /// <summary>위 속눈썹이 상안검 스냅+아크 점을 원함 — IrisRenderer가 라이너·섀도
        /// 없이 마스카라만 켜져도 ComputeLidSnaps를 유지하는 수요 게이트.</summary>
        public bool WantsLidSnaps => _intensity > 0f;

        public void ApplyParams(string colorHex, float intensity, float cornerLift, float lengthMult, int style, int finish)
        {
            _intensity = Mathf.Clamp01(intensity);
            _cornerLift = Mathf.Clamp01(cornerLift);
            // 길이 배수 핸들 — JsonUtility 생략 0은 미설정 → 1(원래).
            _lengthMult = lengthMult <= 0f ? 1f : Mathf.Clamp(lengthMult, 0.4f, 2.5f);
            _style = Mathf.Clamp(style, 0, 5); // 모양(생략 0=내추럴=기존 출력, 5=처짐 위 전용)
            if (_material == null) return;
            if (!string.IsNullOrEmpty(colorHex) &&
                ColorUtility.TryParseHtmlString(colorHex, out var c))
                _material.SetColor(ColorId, c);
            _material.SetFloat(IntensityId, _intensity);
            // 마감(Tier B) — 위 속눈썹 머티리얼 전용(하 속눈썹과 독립). 0=새틴=기존 출력.
            _material.SetFloat(FinishId, finish);
        }

        /// <summary>아래 속눈썹 — 색은 mascaraColor 공용, 길이 배수는 mascaraLength와
        /// 독립(lowerLashLength). 눈꼬리 리프트는 ApplyParams가 공유 필드로 설정.</summary>
        public void ApplyLowerParams(string colorHex, float intensity, float lengthMult, int style, int finish)
        {
            _lowerIntensity = Mathf.Clamp01(intensity);
            // 길이 배수 핸들 — JsonUtility 생략 0은 미설정 → 1(원래).
            _lowerLengthMult = lengthMult <= 0f ? 1f : Mathf.Clamp(lengthMult, 0.4f, 2.5f);
            _lowerStyle = Mathf.Clamp(style, 0, 4); // 모양(생략 0=내추럴, 5=처짐은 위 전용 — 법선 반전이 눈 침범)
            if (_lowerMaterial == null) return;
            if (!string.IsNullOrEmpty(colorHex) &&
                ColorUtility.TryParseHtmlString(colorHex, out var c))
                _lowerMaterial.SetColor(ColorId, c);
            _lowerMaterial.SetFloat(IntensityId, _lowerIntensity);
            // 마감(Tier B) — 아래 속눈썹 머티리얼 전용(위 속눈썹과 독립). 0=새틴=기존 출력.
            _lowerMaterial.SetFloat(FinishId, finish);
        }

        void LateUpdate()
        {
            var tracked = _source != null && _source.HasFace && FramePresenter.Instance != null;
            var upperOn = tracked && _intensity > 0f;
            var lowerOn = tracked && _lowerIntensity > 0f;
            if (_renderer.enabled != upperOn) _renderer.enabled = upperOn;
            if (_lowerRenderer.enabled != lowerOn) _lowerRenderer.enabled = lowerOn;
            if (!upperOn && !lowerOn) return;

            var lm = _source.Landmarks;
            if (upperOn) UpdateUpper(lm);
            if (lowerOn) UpdateLower(lm);
        }

        void UpdateUpper(Vector3[] lm)
        {
            var vi = 0;
            for (var e = 0; e < Eyes; e++)
            {
                var lids = UpperLids[e];
                var inner = ImgPt(lm, lids[LidPts - 1]);
                var outer = ImgPt(lm, lids[0]);
                var eyeDist = (outer - inner).magnitude;

                // 뿌리는 IrisRenderer의 스냅+아크 점(라이너 리본과 동일 점)에 박는다 —
                // 실제 속눈썹 라인 밀착 + 모양 단위 안정화 + 라이너와 정합이 공짜.
                // 신선도: 당/직전 프레임(LateUpdate 순서 무보장, EMA라 1프레임 지연 무해).
                // 스테일·미계산(라이너·섀도·마스카라 전부 방금 켜짐 등)이면 원시 폴백.
                var ir = IrisRenderer.Instance;
                var snap = ir != null && ir.LidSnapFrame >= Time.frameCount - 1
                    ? ir.GetLidSnap(e) : null;
                for (var j = 0; j < LidPts; j++)
                    _ctrl[j] = snap != null
                        ? snap[LidPts - 1 - j]
                        : ImgPt(lm, lids[LidPts - 1 - j]); // 안쪽 → 바깥

                var lidMid = ImgPt(lm, lids[4]);
                var up = (ImgPt(lm, BrowLower[e][2]) - lidMid).normalized;

                // 눈 감김 — 감을수록 속눈썹이 눈꺼풀을 따라 아래(뺨쪽)로 접힌다.
                // 뜬 눈과 같은 위 부챗살이 감은 눈 위에 그려지면 부자연(실기기).
                // 개방도 = 상·하안검 중앙 거리 / 눈폭(스케일 불변 정규화).
                var openRatio = Vector2.Distance(lidMid, ImgPt(lm, LowerLids[e][4])) /
                                Mathf.Max(eyeDist, 1e-6f);
                var closedT = 1f - Mathf.SmoothStep(0.06f, 0.2f, openRatio);

                // 눈꼬리 띄우기 — 라이너·섀도·하안검과 동일 리프트로 속눈썹도 추종.
                if (_cornerLift > 0f)
                    for (var j = 0; j < LidPts; j++)
                        _ctrl[j] = EyeWarp.LiftCorner(
                            _ctrl[j], j / (float)(LidPts - 1), up, eyeDist, _cornerLift);

                SubdivideArc(_ctrl, LidPts, _lash);

                var len = eyeDist * LenFactor * _lengthMult; // 길이 핸들
                var depth = Depth(lm[lids[4]].z);
                for (var s = 0; s < LashesPerEye; s++)
                {
                    // 결정론적 해시(속눈썹별 흔들림 — 프레임 무관 시드). 눈별 시드 분리.
                    var seed = e * LashesPerEye + s;
                    var h1 = Hash(seed * 2 + 1);
                    var h2 = Hash(seed * 2 + 7);
                    var h3 = Hash(seed * 2 + 13);

                    // lash 라인 위 위치 u(0 안쪽 → 1 바깥) + 약간 흔들기.
                    var u = Mathf.Clamp01((s + 0.5f) / LashesPerEye + (h1 - 0.5f) * 0.5f / LashesPerEye);
                    SampleLash(u, out var root, out var along);

                    // 바깥으로 갈수록 부챗살 스윕. 접선(along)은 안쪽→바깥 방향.
                    // 기준축은 전역 up이 아니라 아크 로컬 법선 — 전역 up이면 모든
                    // 가닥이 평행해져 "너무 한 방향"(실기기). 로컬 법선은 눈꺼풀
                    // 곡률을 따라 돌므로 자연 방사형이 된다. 각도 변이도 ±로 확대.
                    var lnrm = Perp(along);
                    if (Vector2.Dot(lnrm, up) < 0f) lnrm = -lnrm;
                    var sweep = Mathf.Lerp(SweepMin, SweepMax, u) + (h2 - 0.5f) * 0.5f;
                    var nrmScale = 1f;
                    var lenProf = StyleProfile(_style, u, ref sweep, ref nrmScale);
                    // 감김 블렌드 — 법선을 아래(-1)로 연속 회전(처짐 스타일 -0.65도
                    // 감으면 -1로 수렴), 스윕은 완만하게. 중간값에서 방향이 접선에
                    // 가까워지는 것도 깜빡임 중간 모습으로 자연스럽다.
                    nrmScale = Mathf.Lerp(nrmScale, -1f, closedT);
                    var dirV = lnrm * nrmScale + along * (sweep * Mathf.Lerp(1f, 0.7f, closedT));
                    var dir = dirV.sqrMagnitude < 1e-10f ? along : dirV.normalized;

                    // 양끝 코너 근처는 짧게(경계 삐짐 방지) + 개체 변이.
                    var edge = Mathf.Clamp01(u / EdgeFade) * Mathf.Clamp01((1f - u) / EdgeFade);
                    // 길이 프로파일 — 앞머리 ≈45%에서 시작해 중간(u≈0.55)부터 최대.
                    // 균일 길이는 앞머리가 길어 보여 부자연(실기기). EdgeFade(6%)와
                    // 별개로 안쪽 절반 전체에 걸리는 완만한 램프. 감으면 살짝 축소
                    // (투영상 접힘).
                    var lenBase = Mathf.Lerp(0.45f, 1f, Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(u / 0.55f)));
                    var lashLen = len * lenBase * lenProf * (0.7f + 0.6f * h3) * Mathf.Lerp(0.5f, 1f, edge)
                                  * Mathf.Lerp(1f, 0.85f, closedT);
                    var tip = root + dir * lashLen;
                    var perp = Perp(dir);
                    var w = lashLen * WidthMult;

                    _vertices[vi++] = ImageToWorld(root - perp * w, depth);
                    _vertices[vi++] = ImageToWorld(root + perp * w, depth);
                    _vertices[vi++] = ImageToWorld(tip - perp * w * 0.15f, depth);
                    _vertices[vi++] = ImageToWorld(tip + perp * w * 0.15f, depth);
                }
            }
            _mesh.vertices = _vertices;
            _mesh.RecalculateBounds();
        }

        /// <summary>모양(mascaraStyle/lowerLashStyle) — 길이·스윕·법선 프로파일 변조,
        /// 위·아래 속눈썹 공유. 0=내추럴은 무변조(기존 출력). 시술 용어 대응:
        /// 돌리(중앙 길게·세움), 캣아이(꼬리 길게·눕힘), 오픈아이(전체 길게·수직 —
        /// 눈 커 보임), 위스피(주기 다발의 긴 스파이크 뭉침), 처짐(위 전용 — 내리깐
        /// 속눈썹, 법선 반전으로 아래를 봄. 아래 속눈썹은 clamp 0..4로 차단: 법선
        /// 반전 시 눈 안으로 침범). u: 0 안쪽 → 1 바깥. nrmScale: 법선 배수(1=위).</summary>
        static float StyleProfile(int style, float u, ref float sweep, ref float nrmScale)
        {
            if (style == 1)      // 돌리 — 중앙 강조 벨, 스윕 축소
            {
                var bell = 1f - Mathf.Abs(u * 2f - 1f);
                sweep *= 0.55f;
                return 1f + 0.5f * bell * bell;
            }
            if (style == 2)      // 캣아이 — 꼬리 강조 + 더 눕힘
            {
                sweep *= 1.35f;
                return 1f + 0.7f * Mathf.SmoothStep(0f, 1f, (u - 0.5f) * 2f);
            }
            if (style == 3)      // 오픈아이 — 전체 길고 수직에 가깝게
            {
                sweep *= 0.4f;
                return 1.25f;
            }
            if (style == 4)      // 위스피 — 주기 다발(긴 스파이크 뭉침)
            {
                var cl = Mathf.Abs(Mathf.Sin(u * Mathf.PI * 5.5f));
                return 0.8f + 0.65f * cl * cl * cl;
            }
            if (style == 5)      // 처짐 — 내리깐 속눈썹(법선 아래 반전, 살짝 길게)
            {
                nrmScale = -0.65f;
                sweep *= 0.8f;
                return 1.05f;
            }
            return 1f;
        }

        // 아래 속눈썹 — 위(UpdateUpper)와 같은 스트로크 모델, 계수만 lower용:
        // 하안검 체인 위에서 아래(down) 방향으로, 짧고 성기게 뿌린다.
        void UpdateLower(Vector3[] lm)
        {
            var vi = 0;
            for (var e = 0; e < Eyes; e++)
            {
                var lids = LowerLids[e];
                var inner = ImgPt(lm, lids[LidPts - 1]);
                var outer = ImgPt(lm, lids[0]);
                var eyeDist = (outer - inner).magnitude;

                for (var j = 0; j < LidPts; j++)
                    _ctrl[j] = ImgPt(lm, lids[LidPts - 1 - j]); // 안쪽 → 바깥

                // "아래" 기준: 눈썹→하안검 방향 — 눈을 감아도 부호가 안 뒤집힌다
                // (LowerLidRenderer와 동일 근거).
                var lidMid = ImgPt(lm, lids[4]);
                var down = (lidMid - ImgPt(lm, BrowLower[e][2])).normalized;

                // 눈꼬리 띄우기 — 하안검 밴드(LowerLidRenderer)와 동일 리프트로
                // 코너 접점을 유지한다(리프트 방향은 위 = -down).
                if (_cornerLift > 0f)
                    for (var j = 0; j < LidPts; j++)
                        _ctrl[j] = EyeWarp.LiftCorner(
                            _ctrl[j], j / (float)(LidPts - 1), -down, eyeDist, _cornerLift);

                SubdivideArc(_ctrl, LidPts, _lash);

                var len = eyeDist * LowerLenFactor * _lowerLengthMult; // 길이 핸들(독립)
                var depth = Depth(lm[lids[4]].z);
                for (var s = 0; s < LowerLashesPerEye; s++)
                {
                    // 결정론적 해시 — 위 속눈썹과 시드 대역 분리(같은 u에서 겹침 방지).
                    var seed = LowerSeedOffset + e * LowerLashesPerEye + s;
                    var h1 = Hash(seed * 2 + 1);
                    var h2 = Hash(seed * 2 + 7);
                    var h3 = Hash(seed * 2 + 13);

                    var u = Mathf.Clamp01(
                        (s + 0.5f) / LowerLashesPerEye + (h1 - 0.5f) * 0.5f / LowerLashesPerEye);
                    SampleLash(u, out var root, out var along);

                    // 바깥으로 갈수록 부챗살 스윕(아래 방향 기준) — 위와 동일 모델.
                    // 위와 같은 이유로 전역 down 대신 아크 로컬 법선(아래 지향).
                    var lnrm = Perp(along);
                    if (Vector2.Dot(lnrm, down) < 0f) lnrm = -lnrm;
                    var sweep = Mathf.Lerp(LowerSweepMin, LowerSweepMax, u) + (h2 - 0.5f) * 0.5f;
                    var lowerNrm = 1f; // clamp 0..4라 항상 1(처짐 차단)
                    var lenProf = StyleProfile(_lowerStyle, u, ref sweep, ref lowerNrm); // 모양 — 위와 공유 프로파일
                    var dir = (lnrm + sweep * along).normalized;

                    var edge = Mathf.Clamp01(u / EdgeFade) * Mathf.Clamp01((1f - u) / EdgeFade);
                    // 길이 프로파일 — 위와 동일 근거(앞머리 짧게), 아래는 완만하게.
                    var lenBase = Mathf.Lerp(0.55f, 1f, Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(u / 0.5f)));
                    var lashLen = len * lenBase * lenProf * (0.7f + 0.6f * h3) * Mathf.Lerp(0.5f, 1f, edge);
                    var tip = root + dir * lashLen;
                    var perp = Perp(dir);
                    var w = lashLen * WidthMult;

                    _lowerVertices[vi++] = ImageToWorld(root - perp * w, depth);
                    _lowerVertices[vi++] = ImageToWorld(root + perp * w, depth);
                    _lowerVertices[vi++] = ImageToWorld(tip - perp * w * 0.15f, depth);
                    _lowerVertices[vi++] = ImageToWorld(tip + perp * w * 0.15f, depth);
                }
            }
            _lowerMesh.vertices = _lowerVertices;
            _lowerMesh.RecalculateBounds();
        }

        // lash 라인을 u(0~1)에서 샘플: 뿌리 점 + 진행 접선(안쪽→바깥).
        void SampleLash(float u, out Vector2 root, out Vector2 along)
        {
            var f = Mathf.Clamp(u, 0f, 0.9999f) * (Seg - 1);
            var j0 = (int)f;
            var t = f - j0;
            root = Vector2.Lerp(_lash[j0], _lash[j0 + 1], t);
            along = (_lash[Mathf.Min(j0 + 1, Seg - 1)] - _lash[Mathf.Max(j0 - 1, 0)]).normalized;
        }

        void SubdivideArc(Vector2[] ctrl, int n, Vector2[] outp)
        {
            var mi = 0;
            for (var i = 0; i < n - 1; i++)
            {
                var p1 = ctrl[i];
                var p2 = ctrl[i + 1];
                var p0 = i == 0 ? p1 : ctrl[i - 1];
                var p3 = i + 2 > n - 1 ? p2 : ctrl[i + 2];
                outp[mi++] = p1;
                for (var k = 1; k <= Sub; k++)
                    outp[mi++] = CatmullRom(p0, p1, p2, p3, k / (float)(Sub + 1));
            }
            outp[mi++] = ctrl[n - 1];
        }

        static Vector2 CatmullRom(Vector2 p0, Vector2 p1, Vector2 p2, Vector2 p3, float t)
        {
            var t2 = t * t;
            var t3 = t2 * t;
            return 0.5f * (2f * p1 + (p2 - p0) * t
                + (2f * p0 - 5f * p1 + 4f * p2 - p3) * t2
                + (3f * p1 - p0 - 3f * p2 + p3) * t3);
        }

        static float Hash(int n)
        {
            unchecked
            {
                var h = (uint)n * 2654435761u;
                h ^= h >> 13; h *= 2246822519u; h ^= h >> 16;
                return (h & 0xFFFFFF) / (float)0x1000000;
            }
        }

        static Vector2 Perp(Vector2 v) => new Vector2(-v.y, v.x);
        static Vector2 ImgPt(Vector3[] lm, int idx) => new Vector2(lm[idx].x, lm[idx].y);
        float Depth(float z) => DistanceFromCamera * (1f + z * DepthScale);

        Vector3 ImageToWorld(Vector2 img, float depth)
        {
            var vp = FramePresenter.Instance.ImageToViewport(img);
            return _camera.ViewportToWorldPoint(new Vector3(vp.x, vp.y, depth));
        }
    }
}
