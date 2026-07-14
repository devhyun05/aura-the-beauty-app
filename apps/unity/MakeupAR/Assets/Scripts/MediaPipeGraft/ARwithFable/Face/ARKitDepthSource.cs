using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

namespace ARMakeup.Face
{
    /// <summary>
    /// ARKit 인물 세그멘테이션(humanStencilTexture)을 세그 마스크(§11)와 같은 규약의
    /// "보조 오클루전" 전역 유니폼으로 노출하는 소스.
    ///
    /// 노출 전역 (SegmentationSource의 _SegMask/_SegOn과 이름 충돌 금지 — 별도 네임스페이스):
    ///  - _ARKitStencil        : R채널 인물 확률(ARKit 스텐실은 사실상 0/1 + 바이리니어 소프트 엣지)
    ///  - _ARKitOccOn          : 0 = 폴백(게이트 1과 등가), 1 = 스텐실 유효
    ///  - _ARKitScreenToStencilX/Y : 뷰포트 UV(원점 좌하단) → 스텐실 UV 아핀 행
    ///    (xy=선형부, z=오프셋 — _SegScreenToMaskX/Y와 동일 규약, Occlusion.cginc 참조)
    /// 소비자는 아직 없다(셰이더 통합은 다른 트랙) — 전역만 기록하므로 켜져 있어도 렌더
    /// 결과에 완전 무영향.
    ///
    /// ── "TrueDepth 오클루전"의 실체 (AR Foundation 6.4 API 조사 결과) ──
    /// 전면 TrueDepth의 원시 뎁스(ARKit capturedDepthData, 15Hz)는 ARKit XR Plugin이
    /// 노출하지 않는다(네이티브 API 부재 — XROcclusionSubsystem은 인물 세그/환경 뎁스만).
    /// 따라서 접근 가능한 것은 AROcclusionManager의 인물 세그멘테이션 3종:
    ///  - humanStencilTexture : 인물 스텐실(R8, Fastest=256×192) ← 본 소스가 사용
    ///  - humanDepthTexture   : 인물 뎁스(R16F) — 미사용(아래 주의 참조)
    ///  - environmentDepth    : 후면 LiDAR 전용 — 무관, 명시적으로 꺼둔다(기본값 함정 참조)
    /// 인물 뎁스를 쓰지 않는 이유: 얼굴 자체가 "인물"이라 얼굴 픽셀의 인물 뎁스 ≈ 얼굴
    /// 메시 깊이 → 깊이 비교식 오클루전은 메이크업 전체가 자기-오클루전으로 명멸한다.
    /// 스텐실도 같은 이유로 세그(face-skin 양성 게이트)와 달리 "인물=1"이라 얼굴을
    /// 못 가린다 — 용도는 "인물 아님(0) 영역 제외"(배경 오합성 방지)와, 비MEDIAPIPE
    /// 빌드에서 _SegMask 부재 시의 대체 마스크 브리지(어댑터 제안 — 반환 문서 참조)다.
    ///
    /// ── 지원 매트릭스 (실기기 미검증 — currentHumanStencilMode가 최종 판정) ──
    ///  - 기기: A12 Bionic 이상 + iOS 13 이상 (ARKit 3 인물 세그멘테이션).
    ///    게이트 = XROcclusionSubsystemDescriptor.humanSegmentationStencilImageSupported
    ///    (ARKit 플러그인 네이티브 DoesSupportBodySegmentationStencil — 기기 단위 판정).
    ///  - 후면 카메라(ARWorldTrackingConfiguration): personSegmentation 지원 확실(Apple 문서).
    ///  - 전면 카메라(ARFaceTrackingConfiguration): Apple API상 supportsFrameSemantics(
    ///    .personSegmentation)가 A12+에서 true라는 커뮤니티 구현 사례가 있으나,
    ///    Unity ARKit 플러그인의 네이티브 구성 능력 테이블(스태틱 라이브러리 내부)이
    ///    face 구성에 PeopleOcclusionStencil을 광고하는지는 미확인 — 미광고면
    ///    현재 구성에서 스텐실이 조용히 Disabled로 남고 본 소스는 폴백(무영향)한다.
    ///  - personSegmentationWithDepth + face tracking 병용: 미확인(본 소스는 뎁스 미사용).
    ///  - Android/에디터: 디스크립터 미지원 → Start에서 즉시 비활성(완전 무영향).
    ///
    /// ── 구성 선택(DefaultConfigurationChooser) 상호작용 — 카메라 플립 가드 ──
    /// 스텐실 요청은 Feature.PeopleOcclusionStencil로 세션 구성 "다수결 투표"에 들어간다.
    /// MEDIAPIPE 주경로(ARFaceManager 없음) + 전면 요청 시, face 구성이 스텐실 능력을
    /// 광고하지 않으면 {UserFacingCamera:1} vs {PeopleOcclusionStencil:1} 동점 → rank로
    /// 갈려 후면(ARWorldTrackingConfiguration)으로 플립될 수 있다(치명적: 프리뷰 카메라가
    /// 뒤집힘). 대책: requested/currentFacingDirection 불일치가 FacingFlipGuardMs 이상
    /// 지속되면 스텐실 요청을 철회하고 세션 내 영구 래치 오프(재시도 없음 — 진동 방지).
    /// 정상 전환(전↔후 스위치)의 일시 불일치는 가드 창보다 짧아 걸리지 않는다.
    ///
    /// ── 시간 정합 한계 (MEDIAPIPE 지연 재생과의 불일치) ──
    /// 스텐실은 "최신 센서 프레임" 기준인데 MEDIAPIPE 표시는 지연 재생(40~150ms,
    /// FaceLandmarkSource) — 세그 마스크(같은 캡처 타임스탬프로 동기)와 달리 스텐실은
    /// 표시 프레임보다 앞선다. 빠른 손 이동 시 경계가 선행하는 아티팩트가 원리적으로
    /// 존재 → 보조 용도로 한정하고 소비자가 페더로 완화할 것. // 실기기 확인 항목
    /// </summary>
    public class ARKitDepthSource : MonoBehaviour
    {
        public static ARKitDepthSource Instance { get; private set; }

        // 전역 유니폼 — 프레임당 1회 기록(SegmentationSource와 동일 패턴).
        static readonly int ARKitStencilId = Shader.PropertyToID("_ARKitStencil");
        static readonly int ARKitOccOnId = Shader.PropertyToID("_ARKitOccOn");
        static readonly int ScreenToStencilXId = Shader.PropertyToID("_ARKitScreenToStencilX");
        static readonly int ScreenToStencilYId = Shader.PropertyToID("_ARKitScreenToStencilY");

        // 스텐실 해상도 모드. Fastest=256×192 — 세그 마스크(256²)와 같은 급이고 보조
        // 오클루전엔 충분하며 Neural Engine 부하 최소. 경계 품질이 부족하면 Medium.
        //
        // ★ 기본 Disabled(opt-in) — 실기기 확인(2026-07-09): 인물 스텐실은 iOS에서 World
        // 트래킹(후면) 계열 피처라, 전면(User-facing)으로 도는 이 앱에서 이걸 요청하면
        // 세션 ConfigurationChooser의 카메라 구성이 오염돼 전후면 전환이 먹지 않는다
        // (라벨만 바뀌고 물리 카메라는 그대로 — FramePresenter 변환만 적용돼 상하 뒤집힘).
        // 이 오클루전은 아직 소비자가 없으므로(노출만) 기본 끔이 정답. 소비자를 배선할 때
        // Fastest로 되돌리고 그 구성에서 카메라 전환이 유지되는지 실기기 검증할 것.
        // // 실기기 튜닝 대상
        const HumanSegmentationStencilMode RequestedStencilMode = HumanSegmentationStencilMode.Disabled;

        // 이보다 오래 오클루전 프레임이 없으면 스테일 — 낡은 스텐실로 지우느니 안 지운다
        // (_ARKitOccOn=0, SegmentationSource.SegStaleMs와 동일 철학). // 실기기 튜닝 대상
        const float StencilStaleMs = 500f;

        // requested/currentFacingDirection 불일치 지속 허용 — 이보다 길면 구성 투표가
        // 카메라를 플립한 것으로 보고 스텐실 요청 철회(클래스 주석 "카메라 플립 가드").
        // 정상 전환의 프로바이더 재기동(수백 ms)보다 넉넉히 길게. // 실기기 튜닝 대상
        const float FacingFlipGuardMs = 3000f;

        // 이미지 UV(원점 좌상단·y 아래) → 스텐실 UV 세로 반전 스위치.
        // 근거(항등 기대): 스텐실은 capturedImage와 같은 센서 방향의 CVPixelBuffer이고
        // Metal 외부 텍스처는 행0=상단=v0, 프로젝트의 이미지 UV 규약도 행0=상단
        // (FaceLandmarkSource.Px 주석) — 그래도 CPU 변환 경로와 GPU 외부 텍스처의 행
        // 순서 차이가 실기기에서 드러나면 이 스위치로 뒤집는다. // 실기기 튜닝 대상
        static readonly bool StencilFlipY = false;

        ARCameraManager _cameraManager;
        AROcclusionManager _occlusionManager;
        double _lastOcclusionFrameMs = double.NegativeInfinity;
        double _facingMismatchSinceMs = -1.0;
        bool _latchedOff; // 카메라 플립 가드 발동 — 세션 내 재시도 없음

#if !MEDIAPIPE
        // 비MEDIAPIPE 경로: 배경이 ARCameraBackground(최신 프레임 + displayMatrix)라
        // FramePresenter가 없다 — 뷰포트→이미지 매핑을 displayMatrix에서 직접 얻는다.
        Matrix4x4? _displayMatrix;
#endif

        void Awake()
        {
            Instance = this;
            Shader.SetGlobalFloat(ARKitOccOnId, 0f); // 첫 프레임 전 명시적 폴백
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
            Shader.SetGlobalFloat(ARKitOccOnId, 0f); // 소비자 즉시 폴백
            if (_occlusionManager != null) _occlusionManager.frameReceived -= OnOcclusionFrame;
#if !MEDIAPIPE
            if (_cameraManager != null) _cameraManager.frameReceived -= OnCameraFrame;
#endif
        }

        public void Init(ARCameraManager cameraManager)
        {
            _cameraManager = cameraManager;
        }

        void Start()
        {
            // ── 런타임 가드 0: 스텐실 요청 자체가 꺼져 있으면 오클루전 매니저를 아예
            //    만들지 않는다 — 인물 스텐실(World 피처) 요청이 세션 구성에 끼어들어
            //    전후면 카메라 전환을 깨뜨리므로, 소비자가 없는 동안은 완전 무개입. ──
            if (RequestedStencilMode == HumanSegmentationStencilMode.Disabled)
            {
                enabled = false; // _ARKitOccOn=0 유지(폴백) — 세그/게이트에 완전 무영향
                return;
            }

            // ── 런타임 가드 1: 디스크립터 사전 점검 ──
            // AROcclusionManager를 만들기 전에 판정해야 미지원 플랫폼(Android/에디터/
            // A12 미만)에서 SubsystemLifecycleManager의 "No active subsystem" 경고나
            // 불필요한 컴포넌트 없이 완전 무영향으로 끝난다.
            var descriptors = new List<XROcclusionSubsystemDescriptor>();
            SubsystemManager.GetSubsystemDescriptors(descriptors);
            var stencilSupported = false;
            foreach (var d in descriptors)
            {
                if (d.humanSegmentationStencilImageSupported != Supported.Supported) continue;
                stencilSupported = true;
                break;
            }
            if (!stencilSupported)
            {
                Debug.Log("[ARKitDepthSource] 인물 스텐실 미지원(기기/플랫폼) — 비활성(_ARKitOccOn=0 유지)");
                enabled = false;
                return;
            }

            // ── 오클루전 매니저 부트스트랩 ──
            // 별도 자식 GO + 비활성 Camera에 얹는 이유:
            //  - AROcclusionManager는 [RequireComponent(typeof(Camera))] — 컴포넌트만 필요,
            //    카메라는 렌더하면 안 되므로 enabled=false(비활성 카메라는 렌더 0).
            //  - AR Camera GO에 얹으면 비MEDIAPIPE 폴백의 ARCameraBackground가
            //    GetComponent로 발견해 배경 셰이더에 인물 뎁스 오클루전 키워드를 켠다 —
            //    얼굴=인물이라 얼굴 메시 위 메이크업이 자기-오클루전으로 명멸(클래스 주석).
            //    같은 GO를 피해 그 결합 자체를 차단한다.
            // GO를 비활성으로 만들어 두고 요청 모드를 전부 세팅한 뒤 활성화 —
            // OnEnable(OnBeforeStart)이 백킹 필드를 서브시스템에 일괄 반영한다.
            var go = new GameObject("ARKit Occlusion Manager");
            go.transform.SetParent(transform, false);
            go.SetActive(false);
            var dummyCam = go.AddComponent<Camera>();
            dummyCam.enabled = false;
            _occlusionManager = go.AddComponent<AROcclusionManager>();
            _occlusionManager.requestedHumanStencilMode = RequestedStencilMode;
            _occlusionManager.requestedHumanDepthMode = HumanSegmentationDepthMode.Disabled;
            // 기본값 함정: m_EnvironmentDepthMode의 직렬화 기본이 Fastest — 방치하면
            // 후면 전용 EnvironmentDepth 피처가 구성 투표에 끼어들어 카메라 선택을
            // 오염시킨다(클래스 주석 "구성 선택 상호작용"). 반드시 명시적으로 끈다.
            _occlusionManager.requestedEnvironmentDepthMode = EnvironmentDepthMode.Disabled;
            // 배경 렌더러가 향후 이 매니저를 참조하게 되더라도 자동 오클루전 합성은
            // 하지 않도록 선호 모드를 꺼둔다(우리는 전역 유니폼 노출만 담당).
            _occlusionManager.requestedOcclusionPreferenceMode = OcclusionPreferenceMode.NoOcclusion;
            _occlusionManager.frameReceived += OnOcclusionFrame;
            go.SetActive(true);

#if !MEDIAPIPE
            if (_cameraManager != null) _cameraManager.frameReceived += OnCameraFrame;
#endif
            Debug.Log("[ARKitDepthSource] 인물 스텐실 요청 " +
                      $"(mode {RequestedStencilMode}) — 실제 활성 여부는 currentHumanStencilMode로 판정");
        }

        void OnOcclusionFrame(AROcclusionFrameEventArgs args)
        {
            // 신선도 신호만 기록(매니저 비활성화 시에도 기본 이벤트가 한 번 오지만
            // 그 직후 currentHumanStencilMode=Disabled 가드에 걸리므로 무해).
            _lastOcclusionFrameMs = Time.realtimeSinceStartupAsDouble * 1000.0;
        }

#if !MEDIAPIPE
        void OnCameraFrame(ARCameraFrameEventArgs args)
        {
            if (args.displayMatrix.HasValue) _displayMatrix = args.displayMatrix;
        }
#endif

        void Update()
        {
            if (_latchedOff || _occlusionManager == null || _cameraManager == null) return;

            // ── 런타임 가드 2: 카메라 플립 가드 (클래스 주석 "구성 선택 상호작용") ──
            var requested = _cameraManager.requestedFacingDirection;
            var current = _cameraManager.currentFacingDirection;
            var mismatch = requested != CameraFacingDirection.None &&
                           current != CameraFacingDirection.None &&
                           requested != current;
            if (!mismatch)
            {
                _facingMismatchSinceMs = -1.0;
                return;
            }

            var nowMs = Time.realtimeSinceStartupAsDouble * 1000.0;
            if (_facingMismatchSinceMs < 0)
            {
                _facingMismatchSinceMs = nowMs;
                return;
            }
            if (nowMs - _facingMismatchSinceMs < FacingFlipGuardMs) return;

            // 불일치가 가드 창을 넘겼다 — 스텐실 요청이 구성 투표에서 카메라를 플립했을
            // 가능성이 크다. 요청을 철회하고 세션 내 영구 래치(재요청 시 플립 진동).
            _latchedOff = true;
            _occlusionManager.requestedHumanStencilMode = HumanSegmentationStencilMode.Disabled;
            Shader.SetGlobalFloat(ARKitOccOnId, 0f);
            Debug.LogWarning(
                "[ARKitDepthSource] 카메라 facing 불일치 지속 " +
                $"(requested {requested}, current {current}) — 인물 스텐실 요청 철회(세션 내 래치 오프). " +
                "구성 다수결이 스텐실을 위해 카메라를 플립한 것으로 판단.");
        }

        void LateUpdate()
        {
            if (!TryPublish()) Shader.SetGlobalFloat(ARKitOccOnId, 0f);
        }

        /// <summary>
        /// 스텐실 텍스처·좌표 아핀·게이트 플래그를 프레임당 1회 기록.
        /// 실패 경로는 전부 false → _ARKitOccOn=0 (완전 무영향 폴백 불변식).
        /// </summary>
        bool TryPublish()
        {
            if (_latchedOff || _occlusionManager == null) return false;

            // 프로바이더 최종 판정 — 현재 구성이 스텐실을 실제로 돌리는지
            // (요청했어도 face 구성 미지원이면 Disabled로 남는다, 클래스 주석 매트릭스).
            if (_occlusionManager.currentHumanStencilMode == HumanSegmentationStencilMode.Disabled)
                return false;

            var nowMs = Time.realtimeSinceStartupAsDouble * 1000.0;
            if (nowMs - _lastOcclusionFrameMs > StencilStaleMs) return false;

            var stencil = _occlusionManager.humanStencilTexture;
            if (stencil == null) return false;

            if (!TryGetScreenToImage(out var rowU, out var rowV)) return false;

            // 이미지 UV → 스텐실 UV는 항등 기대(StencilFlipY 상수 주석) — 아핀에 합성.
            if (StencilFlipY)
                rowV = new Vector3(-rowV.x, -rowV.y, 1f - rowV.z);

            Shader.SetGlobalTexture(ARKitStencilId, stencil);
            Shader.SetGlobalVector(ScreenToStencilXId, new Vector4(rowU.x, rowU.y, rowU.z, 0f));
            Shader.SetGlobalVector(ScreenToStencilYId, new Vector4(rowV.x, rowV.y, rowV.z, 0f));
            Shader.SetGlobalFloat(ARKitOccOnId, 1f);
            return true;
        }

        /// <summary>
        /// 뷰포트 UV(원점 좌하단) → 카메라 이미지 UV(원점 좌상단·y 아래) 아핀 행.
        /// 경로별 출처가 다르다:
        ///  - MEDIAPIPE: FramePresenter.TryGetViewportToImage(세그 마스크와 동일 매핑 —
        ///    표시 쿼드의 회전·미러·커버스케일 역매핑). 단 스텐실은 최신 프레임이라
        ///    지연 재생 표시와 시간 불일치(클래스 주석 한계).
        ///  - 비MEDIAPIPE: ARCameraFrameEventArgs.displayMatrix. ARKitBackground.shader가
        ///    img = mul(float3(screenUV, 1), M).xy 로 소비하는 행벡터 규약이므로
        ///    imgU = (m00, m10, m20)·(u, v, 1), imgV = (m01, m11, m21)·(u, v, 1).
        ///    배경 쿼드 UV 원점이 뷰포트와 같은 좌하단이라 그대로 쓴다. // 실기기 확인 항목
        /// </summary>
        bool TryGetScreenToImage(out Vector3 rowU, out Vector3 rowV)
        {
#if MEDIAPIPE
            var presenter = FramePresenter.Instance;
            if (presenter != null && presenter.TryGetViewportToImage(out rowU, out rowV))
                return true;
            rowU = default;
            rowV = default;
            return false;
#else
            if (_displayMatrix.HasValue)
            {
                var m = _displayMatrix.Value;
                rowU = new Vector3(m.m00, m.m10, m.m20);
                rowV = new Vector3(m.m01, m.m11, m.m21);
                return true;
            }
            rowU = default;
            rowV = default;
            return false;
#endif
        }
    }
}
