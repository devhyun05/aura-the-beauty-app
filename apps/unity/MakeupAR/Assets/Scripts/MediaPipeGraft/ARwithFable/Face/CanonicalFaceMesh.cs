using System;
using System.Collections;
using System.Globalization;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.XR.ARFoundation;

namespace ARMakeup.Face
{
    /// <summary>
    /// MediaPipe canonical face mesh(468버텍스) 렌더러.
    ///
    /// - 토폴로지(삼각형/UV)는 StreamingAssets/canonical_face_model.obj에서 로드
    ///   (MediaPipe 공식 canonical 모델 → 마스크가 iOS/Android 한 벌로 통일됨)
    /// - 버텍스 위치는 매 프레임 FaceLandmarkSource의 정규화 이미지 좌표를
    ///   ARCameraManager displayMatrix로 화면 좌표로 변환해 갱신
    ///
    /// TODO(기기 캘리브레이션): displayMatrix 적용 방향(iOS 행벡터/Android 열벡터,
    /// y 플립)은 플랫폼·기기별 실측 확인이 필요하다. 어긋나면 아래
    /// ImageToViewport()의 #if 분기와 flipY를 조정할 것.
    /// </summary>
    public class CanonicalFaceMesh : MonoBehaviour
    {
        const string ObjFileName = "canonical_face_model.obj";
        const float DistanceFromCamera = 0.5f;

        // MediaPipe 랜드마크 z(이미지 폭 기준 상대 깊이, 카메라 쪽이 음수)를
        // 월드 깊이로 반영하는 배율. 0이면 평면 메시가 되는데, 평면은 고개를
        // 45°쯤 돌리면 반대쪽 삼각형이 앞쪽 위로 접혀 메이크업이 깨진다.
        // 깊이 + 셰이더 ZWrite로 자기 가림이 처리되게 한다.
        const float DepthScale = 1.0f;

        // canonical 메시는 이마 상단을 짧게 덮어서 헤어라인 근처엔 파운데이션이
        // 안 닿는다. 얼굴 윤곽(FACEMESH_FACE_OVAL)의 위쪽 아크를 미간 반대
        // 방향으로 연장한 밴드를 덧붙이고, 밴드 끝은 셰이더에서 효과를 0으로
        // 페이드시킨다(uv2.x = 1 본 메시, 0 연장 테두리).
        static readonly int[] ForeheadArc =
            { 127, 162, 21, 54, 103, 67, 109, 10, 338, 297, 332, 284, 251, 389, 356 };
        const int NasionIndex = 168;           // 연장 방향 기준점(미간)
        const float ForeheadExtension = 0.45f; // 정수리 방향 최대 연장 비율
        const float ExtOffsetEma = 0.35f;      // 이마 연장 오프셋 EMA 계수(작을수록 안정·지연↑) 실기기 튜닝 대상

        // 관자놀이 쪽 얼굴 경계는 머리카락이 겹치기 쉬워 효과를 미리 감쇠한다
        // (경계에서 안쪽으로 자연스럽게 페더링됨). 좌/우 대칭 인덱스.
        // 귀 아래~턱 옆(93/132/58, 323/361/288)도 완만히 페더링: MediaPipe가
        // 머리카락에 가려진 윤곽을 그 아래로 추정해 메시 테두리가 머리카락
        // 위에 얹히는데, 이 구간만 fade=1이면 머리카락 위 세로 줄로 남는다
        // (실기기 확인). 턱선 자체(172/397 아래)는 노출 얼굴이라 fade=1 유지.
        static readonly (int index, float fade)[] TempleFades =
        {
            (234, 0.45f), (454, 0.45f), // 귀 앞
            (127, 0.35f), (356, 0.35f), // 관자놀이
            (162, 0.6f),  (389, 0.6f),
            (21, 0.85f),  (251, 0.85f),
            (93, 0.55f),  (323, 0.55f), // 귀 바로 아래
            (132, 0.7f),  (361, 0.7f),
            (58, 0.85f),  (288, 0.85f), // 턱 옆으로 갈수록 원복
        };

        // 립 윤곽 테셀레이션: 마스크는 Catmull-Rom 곡선(generate-masks.py의
        // smooth_loop)인데 메시는 링 랜드마크 20각형을 직선으로 이어서
        // 아랫입술 라인이 각져 보인다(실기기 확인). 외곽 링의 각 변에 보간
        // 정점 2개를 추가하고 매 프레임 이웃 랜드마크 4점의 uniform
        // Catmull-Rom(마스크와 동일 기저) 위에 배치해 곡선을 일치시킨다.
        //
        // 내곽 링(LIPS_INNER)은 분할하지 않는다: 입 안쪽 밴드 삼각형이
        // 극단적으로 얇아 스플라인 휨이 삼각형을 접고(winding 반전), 컬링에
        // 사라져 sliver 구멍이 깜빡인다 — canonical 투영 + 지터 시뮬레이션으로
        // 확인. 내곽 직선은 현행 동작 그대로고 치아 보호 경계는 마스크
        // 블러 + 치아색 게이트가 처리한다.
        static readonly int[] LipsOuter =
            { 61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291,
              375, 321, 405, 314, 17, 84, 181, 91, 146 };
        const int LipEdgeSubdiv = 2; // 변당 보간 정점 수

        // 입꼬리(61/291)는 위·아래 입술 라인이 예각 V로 만나는 코너다.
        // uniform Catmull-Rom의 코너 접선은 (next−prev)/2 — V를 가로지르는
        // 방향이라 코너 양옆 변의 곡선이 부풀거나 되감기고, 입꼬리 랜드마크의
        // 지터가 양쪽 곡선의 출렁임으로 증폭된다(입꼬리 우글거림 — 실기기
        // 확인). 코너에 닿는 변은 건너편 제어점을 코너 자신으로 복제해 접선을
        // 코드 방향으로 눕힌다: 곡선이 코너에 직선으로 진입/이탈하고 코너는
        // 뾰족하게 유지된다. 마스크(generate-masks.py LIP_CORNERS)도 동일
        // 규칙으로 굽는다.
        static bool IsLipCorner(int index) => index == 61 || index == 291;

        // 옆 라인 랜드마크는 편차가 도드라지고, 스플라인은 랜드마크를 정확히
        // 통과하므로 노이즈까지 곡선으로 증폭한다 (입 벌릴 때 특히 — 실기기
        // 확인). 체인 중간 점만 이웃 평균으로 스무딩해 링부터 안정화한다.
        // 양끝(입꼬리 61/291, 입술산 37/267, 아랫입술 181/405)은 고정되어
        // 형태가 보존된다. 메시 정점과 스플라인 제어점이 같이 움직이므로
        // 곡선은 여전히 정점에 앵커링된다.
        static readonly int[][] LipSmoothChains =
        {
            new[] { 61, 185, 40, 39, 37 },     // 윗입술 오른쪽
            new[] { 267, 269, 270, 409, 291 }, // 윗입술 왼쪽
            new[] { 61, 146, 91, 181 },        // 아랫입술 오른쪽 입꼬리 쪽
            new[] { 291, 375, 321, 405 },      // 아랫입술 왼쪽 입꼬리 쪽
        };

        // 스플라인이 변의 코드(chord)에서 벗어날 수 있는 최대 수직 비율.
        // 정상 곡률의 휨은 코드의 수 % 수준이라 안 걸리고, 입 벌릴 때
        // 랜드마크 지그재그·입꼬리 급커브가 만드는 스파이크만 눌러준다.
        const float LipMaxBowRatio = 0.3f;

        struct LipEdge
        {
            public int prev, a, b, next; // 스플라인 제어점(랜드마크 인덱스), 곡선은 a~b 구간
            public int vertBase;         // 첫 보간 정점의 메시 인덱스 (LipEdgeSubdiv개 연속)
        }
        LipEdge[] _lipEdges;

        float[] _arcWeights;
        int[] _triangles;
        Vector2[] _uv;       // 정점별 캐노니컬 UV (마스크 좌표) — UV→이미지 투영용
        int _baseIndexCount;

        /// <summary>
        /// 캐노니컬 UV 점을 포함하는 삼각형(메시 정점 3개)과 무게중심을 찾는다.
        /// UV 토폴로지는 정적이라 튜토리얼 가이드가 마스크 존 경계점마다 1회 호출해
        /// (정점 인덱스 a/b/c, bary)를 캐시하고, 매 프레임은 ViewportOfVertex를 bary로
        /// 보간해 화면 위치를 싸게 얻는다(마스크 가이드 정확 투영). 립 둘레 곡선용 보간
        /// 정점(>=baseVertexCount)도 포함해야 립 인접 존(콧대 아래·큐피드)이 빠지지 않는다
        /// — 그 정점들도 _viewports에 실제 화면 위치가 있으므로 ViewportOfVertex로 해석 가능.
        /// </summary>
        public bool TryResolveUv(Vector2 uv, out int a, out int b, out int c, out Vector3 bary)
        {
            a = b = c = 0; bary = Vector3.zero;
            if (!TopologyReady || _uv == null || _triangles == null) return false;
            for (var t = 0; t + 2 < _triangles.Length; t += 3)
            {
                int i0 = _triangles[t], i1 = _triangles[t + 1], i2 = _triangles[t + 2];
                var bc = Bary2D(uv, _uv[i0], _uv[i1], _uv[i2]);
                if (bc.x >= -1e-4f && bc.y >= -1e-4f && bc.z >= -1e-4f)
                {
                    a = i0; b = i1; c = i2; bary = bc; return true;
                }
            }
            return false;
        }

        /// <summary>정점의 현재 화면 뷰포트 좌표(베이스·확장·립보간 정점 공통).</summary>
        public Vector2 ViewportOfVertex(int i) =>
            _viewports != null && i >= 0 && i < _viewports.Length ? _viewports[i] : Vector2.zero;

        static Vector3 Bary2D(Vector2 p, Vector2 a, Vector2 b, Vector2 c)
        {
            var v0 = b - a; var v1 = c - a; var v2 = p - a;
            var den = v0.x * v1.y - v1.x * v0.y;
            if (Mathf.Abs(den) < 1e-12f) return new Vector3(-1f, -1f, -1f);
            var v = (v2.x * v1.y - v1.x * v2.y) / den;
            var w = (v0.x * v2.y - v2.x * v0.y) / den;
            return new Vector3(1f - v - w, v, w);
        }

        public static CanonicalFaceMesh Instance { get; private set; }

        /// <summary>UV/삼각형 토폴로지 (UVTemplateExporter에서 사용).</summary>
        public Mesh MeshTopology => _mesh;
        public bool TopologyReady { get; private set; }

        [Tooltip("랜드마크 y축 플립 (기기 캘리브레이션용)")]
#if UNITY_IOS
        // iOS 실기기 확정값: displayMatrix(matrixMode 1)가 y뒤집기를 이미 포함한다.
        public bool flipY = false;
#else
        public bool flipY = true; // Android 미확정 — 실기기 캘리브레이션 필요
#endif

        /// <summary>displayMatrix 적용 방식: 0 = 미적용, 1 = 전치역행렬, 2 = 역행렬+y플립.</summary>
#if UNITY_IOS
        public int matrixMode = 1;
#else
        public int matrixMode = 2;
#endif

        Camera _camera;
        FaceLandmarkSource _source;
        Mesh _mesh;
        MeshRenderer _renderer;
        Material _makeupMaterial;
        Material _debugMaterial;
        Vector3[] _vertices;
        Vector2[] _viewports;
        float[] _depths;
        int _baseVertexCount;
        Vector2[] _extOffsetPrev; // 이마 연장 오프셋 EMA 상태(정점별)
        bool _extEmaInit;

        static bool IsFinite(Vector2 v) =>
            !float.IsNaN(v.x) && !float.IsInfinity(v.x) && !float.IsNaN(v.y) && !float.IsInfinity(v.y);
        Matrix4x4 _displayMatrix = Matrix4x4.identity;
        bool _hasDisplayMatrix;

        void Awake()
        {
            Instance = this;
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        public void Init(Camera cam, FaceLandmarkSource source, ARCameraManager cameraManager, Material material)
        {
            _camera = cam;
            _source = source;

            var filter = gameObject.AddComponent<MeshFilter>();
            _renderer = gameObject.AddComponent<MeshRenderer>();
            _makeupMaterial = material;
            _renderer.sharedMaterial = material;
            _renderer.enabled = false;

            _mesh = new Mesh { name = "CanonicalFaceMesh" };
            _mesh.MarkDynamic();
            filter.sharedMesh = _mesh;

            cameraManager.frameReceived += OnFrameReceived;
            StartCoroutine(LoadTopology());
        }

        /// <summary>RN 디버그 UI에서 온 캘리브레이션 값을 즉시 반영한다.</summary>
        static readonly int CullId = Shader.PropertyToID("_Cull");

        public void ApplyCalibration(ARMakeup.Bridge.CalibrationParams p)
        {
            flipY = p.flipY;
            if (p.matrixMode >= 0) matrixMode = p.matrixMode;

            if (p.debugMesh && _debugMaterial == null)
            {
                var shader = Resources.Load<Shader>("DebugMesh");
                if (shader != null) _debugMaterial = new Material(shader);
            }
            _renderer.sharedMaterial = p.debugMesh && _debugMaterial != null
                ? _debugMaterial
                : _makeupMaterial;

            // fold-over 제거용 컬링 (0=Off, 1=Front, 2=Back) — 실측으로 방향 결정
            if (p.cullMode >= 0)
            {
                _makeupMaterial.SetInt(CullId, p.cullMode);
                if (_debugMaterial != null) _debugMaterial.SetInt(CullId, p.cullMode);
            }

            Debug.Log($"[CanonicalFaceMesh] calibration: flipY={flipY} matrixMode={matrixMode} " +
                      $"debugMesh={p.debugMesh} cullMode={p.cullMode}");
        }

        void OnFrameReceived(ARCameraFrameEventArgs args)
        {
            if (args.displayMatrix.HasValue)
            {
                _displayMatrix = args.displayMatrix.Value;
                _hasDisplayMatrix = true;
            }
        }

        IEnumerator LoadTopology()
        {
            var path = System.IO.Path.Combine(Application.streamingAssetsPath, ObjFileName);
            string objText = null;

            if (path.Contains("://")) // Android: StreamingAssets는 APK 내부라 UnityWebRequest 필요
            {
                using var req = UnityWebRequest.Get(path);
                yield return req.SendWebRequest();
                if (req.result == UnityWebRequest.Result.Success) objText = req.downloadHandler.text;
            }
            else if (System.IO.File.Exists(path))
            {
                objText = System.IO.File.ReadAllText(path);
            }

            if (string.IsNullOrEmpty(objText))
            {
                Debug.LogError($"[CanonicalFaceMesh] {ObjFileName} 없음 — scripts/setup-mediapipe.sh 실행 필요");
                yield break;
            }

            try
            {
                ParseObj(objText);
                TopologyReady = true;
                Debug.Log($"[CanonicalFaceMesh] topology loaded: {_mesh.vertexCount} verts, {_mesh.triangles.Length / 3} tris");
            }
            catch (Exception e)
            {
                Debug.LogError($"[CanonicalFaceMesh] OBJ 파싱 실패: {e}");
            }
        }

        void ParseObj(string objText)
        {
            var uvsRaw = new System.Collections.Generic.List<Vector2>(512);
            var triangles = new System.Collections.Generic.List<int>(3072);
            // uv[버텍스 인덱스] — canonical 모델은 v/vt가 1:1 대응이지만 f의 페어로 안전하게 매핑
            System.Collections.Generic.Dictionary<int, int> vtOfVertex = new(512);
            var vertexCount = 0;

            foreach (var rawLine in objText.Split('\n'))
            {
                var line = rawLine.Trim();
                if (line.StartsWith("v "))
                {
                    vertexCount++;
                }
                else if (line.StartsWith("vt "))
                {
                    var p = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                    uvsRaw.Add(new Vector2(
                        float.Parse(p[1], CultureInfo.InvariantCulture),
                        float.Parse(p[2], CultureInfo.InvariantCulture)));
                }
                else if (line.StartsWith("f "))
                {
                    var p = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                    if (p.Length < 4) continue;
                    for (var i = 1; i <= 3; i++)
                    {
                        var pair = p[i].Split('/');
                        var v = int.Parse(pair[0], CultureInfo.InvariantCulture) - 1;
                        triangles.Add(v);
                        if (pair.Length > 1 && pair[1].Length > 0)
                            vtOfVertex[v] = int.Parse(pair[1], CultureInfo.InvariantCulture) - 1;
                    }
                }
            }

            _baseVertexCount = vertexCount;
            var extCount = ForeheadArc.Length;
            _lipEdges = BuildLipEdges(vertexCount + extCount);
            var total = vertexCount + extCount + _lipEdges.Length * LipEdgeSubdiv;

            _vertices = new Vector3[total];
            _viewports = new Vector2[total];
            _depths = new float[total];
            var uvs = new Vector2[total];
            var fades = new Vector2[total];
            for (var v = 0; v < vertexCount; v++)
            {
                if (vtOfVertex.TryGetValue(v, out var vt) && vt < uvsRaw.Count)
                    uvs[v] = uvsRaw[vt];
                fades[v] = Vector2.right; // x=1: 효과 100%
            }

            // 연장 정점: UV는 원본 테두리 값을 복사(그 위치의 마스크는 전부 0),
            // fade는 0으로 남겨 밴드 끝에서 효과가 사라지게 한다.
            for (var i = 0; i < extCount; i++)
                uvs[vertexCount + i] = uvs[ForeheadArc[i]];

            // 립 보간 정점 UV: 링 UV의 동일 스플라인 위 지점 → 화면 곡선 위
            // 위치와 마스크 샘플 위치의 대응이 곡선 위에서도 유지된다.
            foreach (var e in _lipEdges)
            {
                for (var k = 0; k < LipEdgeSubdiv; k++)
                {
                    var t = (k + 1) / (float)(LipEdgeSubdiv + 1);
                    uvs[e.vertBase + k] = CatmullRom(uvs[e.prev], uvs[e.a], uvs[e.b], uvs[e.next], t);
                    fades[e.vertBase + k] = Vector2.right;
                }
            }

            // 연장 가중치: 아크 중앙(정수리 방향)은 1, 양끝(관자놀이)은 0에 수렴
            // — 균일 연장은 위쪽은 모자라고 옆쪽은 머리카락을 덮는다.
            _arcWeights = new float[extCount];
            _extOffsetPrev = new Vector2[extCount];
            _extEmaInit = false;
            for (var i = 0; i < extCount; i++)
            {
                var t = i / (float)(extCount - 1);
                _arcWeights[i] = Mathf.Pow(Mathf.Sin(Mathf.PI * t), 1.5f);
            }

            foreach (var (index, fade) in TempleFades)
                fades[index] = new Vector2(fade, 0f);

            var rebuilt = SubdivideLipTriangles(triangles);

            _baseIndexCount = rebuilt.Count;
            for (var i = 0; i + 1 < extCount; i++)
            {
                int a = ForeheadArc[i], b = ForeheadArc[i + 1];
                int ea = vertexCount + i, eb = vertexCount + i + 1;
                rebuilt.Add(a); rebuilt.Add(ea); rebuilt.Add(b);
                rebuilt.Add(b); rebuilt.Add(ea); rebuilt.Add(eb);
            }

            _triangles = rebuilt.ToArray();
            _uv = uvs; // UV→이미지 투영(TryResolveUv)용 보관
            _mesh.vertices = _vertices;
            _mesh.uv = uvs;
            _mesh.uv2 = fades;
            _mesh.triangles = _triangles;
        }

        void LateUpdate()
        {
            if (!TopologyReady || _source == null || _camera == null) return;

            // Guard against invalid camera aspects to prevent NaN propagation during division or scaling
            if (float.IsNaN(_camera.aspect) || float.IsInfinity(_camera.aspect) || _camera.aspect <= 0.001f)
            {
                _renderer.enabled = false;
                return;
            }

            var visible = _source.HasFace;
            if (_renderer.enabled != visible) _renderer.enabled = visible;
            if (!visible) return;

            var landmarks = _source.Landmarks;
            var count = Mathf.Min(_baseVertexCount, FaceLandmarkSource.MeshVertexCount);
            for (var i = 0; i < count; i++)
            {
                var lm = landmarks[i];
                _viewports[i] = ImageToViewport(new Vector2(lm.x, lm.y));
                _depths[i] = DistanceFromCamera * (1f + lm.z * DepthScale);
            }

            // 옆 라인 공간 스무딩 (체인 중간 점만, 형태 보존) — 스플라인 배치
            // 전에 링부터 안정화해야 노이즈가 곡선으로 증폭되지 않는다
            foreach (var chain in LipSmoothChains)
            {
                for (var k = 1; k + 1 < chain.Length; k++)
                {
                    _viewports[chain[k]] = 0.5f * _viewports[chain[k]]
                        + 0.25f * (_viewports[chain[k - 1]] + _viewports[chain[k + 1]]);
                }
            }

            // 립 보간 정점: 이웃 랜드마크 4점 스플라인 위에 배치 → 메시 경계가
            // 마스크의 Catmull-Rom 곡선과 일치 (직선 연결로 각지던 문제 해소).
            // 휨 클램프는 화면 픽셀 기준이어야 해서 aspect 보정 공간에서 계산
            // (CR 자체는 아핀 불변이라 클램프가 안 걸리면 결과 동일).
            var lipScale = new Vector2(_camera.aspect, 1f);
            var lipScaleInv = new Vector2(1f / _camera.aspect, 1f);
            foreach (var e in _lipEdges)
            {
                Vector2 q0 = Vector2.Scale(_viewports[e.prev], lipScale);
                Vector2 q1 = Vector2.Scale(_viewports[e.a], lipScale);
                Vector2 q2 = Vector2.Scale(_viewports[e.b], lipScale);
                Vector2 q3 = Vector2.Scale(_viewports[e.next], lipScale);
                var chord = q2 - q1;
                var chordLen2 = chord.sqrMagnitude;
                for (var k = 0; k < LipEdgeSubdiv; k++)
                {
                    var t = (k + 1) / (float)(LipEdgeSubdiv + 1);
                    var p = CatmullRom(q0, q1, q2, q3, t);
                    if (chordLen2 > 1e-12f)
                    {
                        var rel = p - q1;
                        var perp = rel - chord * (Vector2.Dot(rel, chord) / chordLen2);
                        var maxBow2 = LipMaxBowRatio * LipMaxBowRatio * chordLen2;
                        if (perp.sqrMagnitude > maxBow2)
                            p -= perp * (1f - Mathf.Sqrt(maxBow2 / perp.sqrMagnitude));
                    }
                    _viewports[e.vertBase + k] = Vector2.Scale(p, lipScaleInv);
                    _depths[e.vertBase + k] = Mathf.Lerp(_depths[e.a], _depths[e.b], t);
                }
            }

            // 이마 연장: 윤곽 아크 정점을 미간 반대 방향으로 밀어낸다.
            // (p−nasion)×amount는 외삽이라 랜드마크 노이즈를 증폭 → 이마 파운데 경계가
            // 프레임마다 흔들려 "연결부가 움직이는" 지터의 뿌리(실기기). 처방: 연장
            // 오프셋을 앵커(arcPoint p) 상대 EMA로 평활 — 앵커는 그대로라 얼굴 추종엔
            // 지연이 없고, 외삽 방향·길이 노이즈만 제거된다(AGENTS.md 검증 안티지터 패턴).
            var nasion = _viewports[NasionIndex];
            for (var i = 0; i < ForeheadArc.Length; i++)
            {
                var p = _viewports[ForeheadArc[i]];
                var amount = ForeheadExtension * (0.08f + 0.92f * _arcWeights[i]);
                var offset = (p - nasion) * amount;
                if (_extEmaInit && IsFinite(offset) && IsFinite(_extOffsetPrev[i]))
                    offset = Vector2.Lerp(_extOffsetPrev[i], offset, ExtOffsetEma);
                _extOffsetPrev[i] = offset;
                _viewports[_baseVertexCount + i] = p + offset;
                _depths[_baseVertexCount + i] = _depths[ForeheadArc[i]];
            }
            _extEmaInit = true;

            EnsureExtensionWinding();

            // Validate all calculated viewport coordinates and depths before converting them to world points
            var hasInvalidValue = false;
            for (var i = 0; i < _viewports.Length; i++)
            {
                if (!IsFinite(_viewports[i]) || float.IsNaN(_depths[i]) || float.IsInfinity(_depths[i]))
                {
                    hasInvalidValue = true;
                    break;
                }
            }

            if (hasInvalidValue)
            {
                _renderer.enabled = false;
                // Clean up any NaNs/Infinities in _viewports so other renderers don't read them
                for (var i = 0; i < _viewports.Length; i++)
                {
                    if (!IsFinite(_viewports[i])) _viewports[i] = Vector2.zero;
                    if (float.IsNaN(_depths[i]) || float.IsInfinity(_depths[i])) _depths[i] = 0f;
                }
                return;
            }

            for (var i = 0; i < _vertices.Length; i++)
                _vertices[i] = _camera.ViewportToWorldPoint(
                    new Vector3(_viewports[i].x, _viewports[i].y, _depths[i]));

            _mesh.vertices = _vertices;
            _mesh.RecalculateBounds();
            // 법선 — MatCap 재질(메탈/홀로)이 얼굴 굴곡·시점에 반응하려면 필요. 468정점이라
            // 매 프레임 재계산 저렴. (법선 없으면 재질이 화면 luma에 의존해 조명 깜빡임 증폭.)
            _mesh.RecalculateNormals();

            UpdateMouthOpenness(landmarks);
        }

        static LipEdge[] BuildLipEdges(int firstVertex)
        {
            var ring = LipsOuter;
            var n = ring.Length;
            var edges = new LipEdge[n];
            for (var i = 0; i < n; i++)
            {
                int a = ring[i], b = ring[(i + 1) % n];
                edges[i] = new LipEdge
                {
                    prev = IsLipCorner(a) ? a : ring[(i + n - 1) % n],
                    a = a,
                    b = b,
                    next = IsLipCorner(b) ? b : ring[(i + 2) % n],
                    vertBase = firstVertex + i * LipEdgeSubdiv,
                };
            }
            return edges;
        }

        /// <summary>
        /// 립 링 변을 포함한 삼각형을 보간 정점을 경유하도록 재구성한다.
        /// 링 변은 양쪽 삼각형이 같은 보간 정점을 공유해 크랙이 없다.
        /// 부채꼴 기준점은 분할 변의 반대 꼭짓점(1개 분할이 현 토폴로지의
        /// 전부) — 스플라인이 안팎 어느 쪽으로 휘어도 접히지 않는 방향이다.
        /// </summary>
        System.Collections.Generic.List<int> SubdivideLipTriangles(
            System.Collections.Generic.List<int> source)
        {
            var edgeOf = new System.Collections.Generic.Dictionary<(int, int), int>(_lipEdges.Length);
            for (var e = 0; e < _lipEdges.Length; e++)
                edgeOf[(_lipEdges[e].a, _lipEdges[e].b)] = e;

            var result = new System.Collections.Generic.List<int>(
                source.Count + _lipEdges.Length * LipEdgeSubdiv * 2 * 3);
            var poly = new System.Collections.Generic.List<int>(3 * (1 + LipEdgeSubdiv));
            var corner = new int[3];
            var subdivided = new bool[3];

            for (var t = 0; t + 2 < source.Count; t += 3)
            {
                poly.Clear();
                var hit = 0;
                for (var s = 0; s < 3; s++)
                {
                    int x = source[t + s], y = source[t + (s + 1) % 3];
                    corner[s] = poly.Count;
                    poly.Add(x);
                    subdivided[s] = false;
                    if (edgeOf.TryGetValue((x, y), out var e))
                    {
                        for (var k = 0; k < LipEdgeSubdiv; k++)
                            poly.Add(_lipEdges[e].vertBase + k);
                        subdivided[s] = true; hit++;
                    }
                    else if (edgeOf.TryGetValue((y, x), out e))
                    {
                        for (var k = LipEdgeSubdiv - 1; k >= 0; k--)
                            poly.Add(_lipEdges[e].vertBase + k);
                        subdivided[s] = true; hit++;
                    }
                }

                if (hit == 0)
                {
                    result.Add(source[t]); result.Add(source[t + 1]); result.Add(source[t + 2]);
                    continue;
                }

                int apex;
                if (hit == 1)
                    apex = corner[(Array.IndexOf(subdivided, true) + 2) % 3];
                else if (hit == 2)
                    apex = corner[(Array.IndexOf(subdivided, false) + 2) % 3];
                else
                    apex = corner[0];

                var m = poly.Count;
                for (var i = 1; i + 1 < m; i++)
                {
                    result.Add(poly[apex]);
                    result.Add(poly[(apex + i) % m]);
                    result.Add(poly[(apex + i + 1) % m]);
                }
            }
            return result;
        }

        /// <summary>uniform Catmull-Rom — generate-masks.py catmull_rom()과 동일 기저.</summary>
        static Vector2 CatmullRom(Vector2 p0, Vector2 p1, Vector2 p2, Vector2 p3, float t)
        {
            var t2 = t * t;
            var t3 = t2 * t;
            return 0.5f * (2f * p1 + (p2 - p0) * t
                + (2f * p0 - 5f * p1 + 4f * p2 - p3) * t2
                + (3f * p1 - p0 - 3f * p2 + p3) * t3);
        }

        /// <summary>
        /// 이마 연장 밴드 삼각형의 winding을 베이스 메시와 일치시킨다.
        /// 컬링(Front)이 켜져 있어 winding이 어긋나면 밴드가 통째로 잘리는데,
        /// 올바른 방향은 미러/회전 조합에 따라 달라 화면상 부호로 판정한다.
        /// 부호가 맞으면 아무것도 안 하므로 매 프레임 호출해도 싸다.
        /// </summary>
        void EnsureExtensionWinding()
        {
            var baseSign = 0f;
            for (var t = 0; t < 30 && t + 2 < _baseIndexCount; t += 3)
                baseSign += SignedArea(_triangles[t], _triangles[t + 1], _triangles[t + 2]);

            var e = _baseIndexCount;
            var extSign = SignedArea(_triangles[e], _triangles[e + 1], _triangles[e + 2]);
            if (baseSign == 0f || extSign == 0f) return;
            if (baseSign > 0f == extSign > 0f) return;

            for (var t = _baseIndexCount; t + 2 < _triangles.Length; t += 3)
                (_triangles[t + 1], _triangles[t + 2]) = (_triangles[t + 2], _triangles[t + 1]);
            _mesh.triangles = _triangles;
        }

        float SignedArea(int a, int b, int c)
        {
            Vector2 p0 = _viewports[a], p1 = _viewports[b], p2 = _viewports[c];
            return (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
        }

        static readonly int MouthOpenId = Shader.PropertyToID("_MouthOpen");

        /// <summary>
        /// 입 벌림 정도(0=다묾, 1=크게 벌림)를 셰이더에 전달한다.
        /// 립 마스크의 안쪽 확장 채널(G)이 다물었을 때만 나타나게 하는 데 쓴다
        /// — 정적 마스크로는 "다물면 안쪽까지 / 벌리면 치아 보호"가 양립 불가.
        /// 13/14 = 안쪽 입술 중앙 상/하, 33/263 = 좌우 눈꼬리(크기 정규화용).
        /// </summary>
        void UpdateMouthOpenness(Vector3[] landmarks)
        {
            if (_makeupMaterial == null) return;

            var gap = Vector2.Distance(landmarks[13], landmarks[14]);
            var interocular = Vector2.Distance(landmarks[33], landmarks[263]);
            var openness = Mathf.Clamp01(
                (gap / Mathf.Max(interocular, 1e-4f) - 0.03f) / 0.12f);
            _makeupMaterial.SetFloat(MouthOpenId, openness);
        }

        /// <summary>
        /// MediaPipe 정규화 이미지 좌표(원점 좌상단) → 화면 뷰포트 좌표(원점 좌하단).
        /// ARCameraBackground가 쓰는 displayMatrix의 역변환을 적용해, 화면에 실제로
        /// 그려진 카메라 영상 위 위치와 일치시킨다.
        /// </summary>
        Vector2 ImageToViewport(Vector2 imageUV)
        {
            // 시간 동기 경로: 배경 영상과 같은 매핑을 공유 (어긋남 원리적 불가)
            if (FramePresenter.Instance != null)
                return FramePresenter.Instance.ImageToViewport(imageUV);

            // 이미지 좌상단 원점 → GL 텍스처 좌하단 원점
            var uv = flipY ? new Vector2(imageUV.x, 1f - imageUV.y) : imageUV;

            if (!_hasDisplayMatrix || matrixMode == 0) return uv;

            if (matrixMode == 1)
            {
                // ARKit식: imageUV(행벡터) = displayUV(행벡터) × M  →  displayUV = imageUV × M⁻¹
                var inv = _displayMatrix.transpose.inverse;
                var mapped = inv.MultiplyPoint3x4(new Vector3(uv.x, uv.y, 1f));
                return new Vector2(mapped.x, mapped.y);
            }

            // ARCore식: imageUV = M × (u, 1-v, 1, 0)  →  (u, 1-v) = M⁻¹ × imageUV
            var inverse = _displayMatrix.inverse;
            var point = inverse.MultiplyPoint3x4(new Vector3(uv.x, uv.y, 1f));
            return new Vector2(point.x, 1f - point.y);
        }
    }
}
