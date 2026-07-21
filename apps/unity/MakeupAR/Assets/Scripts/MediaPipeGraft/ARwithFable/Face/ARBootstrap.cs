using System;
using ARMakeup.Bridge;
using ARMakeup.Capture;
using Unity.XR.CoreUtils;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

namespace ARMakeup.Face
{
    /// <summary>
    /// AR 씬 전체를 코드로 구성한다 (빌드 씬은 빈 채로 유지).
    ///
    /// 얼굴 트래킹 경로:
    ///  - MEDIAPIPE 정의 시(=com.github.homuler.mediapipe 설치 시):
    ///    MediaPipe Face Landmarker + canonical 메시. 전/후면 카메라 지원,
    ///    iOS/Android 동일 토폴로지 → 마스크 한 벌.
    ///  - 미설치 시 폴백: ARKit/ARCore 얼굴 트래킹(ARFaceManager). 전면 전용.
    /// </summary>
    public static class ARBootstrap
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Init()
        {
            if (UnityEngine.Object.FindAnyObjectByType<ARSession>() != null) return;

            // 브리지는 카메라/렌더러보다 먼저 살린다. 이후 초기화가 실패해도 RN이
            // requestReady로 실패 원인을 다시 받을 수 있어 카메라만 뜬 채 멈추지 않는다.
            var bridgeGO = new GameObject("NativeBridge");
            var bridge = bridgeGO.AddComponent<NativeBridge>();
            var stage = "bootstrap";

            try
            {
            // 익스포트마다 바뀌는 GUID — 기기에 어떤 빌드가 깔렸는지 syslog로 확인용
            Debug.Log($"[ARBootstrap] Unity build {Application.buildGUID}");

            // 지연 재생(FaceLandmarkSource)은 "매 프레임 캡처·표시(60fps)" 전제로
            // 튜닝돼 있다(보간 브래킷·EMA·슬루 상수). 30Hz로 내리면 캡처 간격이
            // 33ms로 벌어져 빠른 얼굴 움직임에서 립 등 마스크가 프레임에서 미끄러진다
            // (실기기 확인). 발열 디밍은 감수하고 트래킹 정합을 우선한다.
            Application.targetFrameRate = 60;

            stage = "AR session";
            new GameObject("AR Session", typeof(ARSession), typeof(ARInputManager));

            stage = "AR camera";
            var originGO = new GameObject("XR Origin");
            var origin = originGO.AddComponent<XROrigin>();

            var camGO = new GameObject("AR Camera") { tag = "MainCamera" };
            camGO.transform.SetParent(originGO.transform, false);
            var cam = camGO.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = Color.black;
            cam.nearClipPlane = 0.05f;
            cam.farClipPlane = 20f;

            var camManager = camGO.AddComponent<ARCameraManager>();
            camManager.requestedFacingDirection = CameraFacingDirection.User;
            origin.Camera = cam;

            var material = MakeupController.CreateMaterial();
            Func<bool> isTracked;

#if MEDIAPIPE
            stage = "MediaPipe renderers";
            // 시간 동기 합성: ARCameraBackground(최신 프레임) 대신 FramePresenter가
            // 랜드마크가 계산된 그 프레임을 배경으로 그린다 → 메이크업 고정.
            var presenterGO = new GameObject("Frame Presenter");
            presenterGO.transform.SetParent(camGO.transform, false);
            presenterGO.AddComponent<FramePresenter>().Init(cam);

            var landmarkSource = camGO.AddComponent<FaceLandmarkSource>();
            landmarkSource.Init(camManager);

            // 얼굴형 보정 워프 필드 — FramePresenter.ImageToViewport가 참조하므로
            // 렌더러들보다 먼저 만든다(랜드마크 소스 필요, FramePresenter는 위에서 생성됨).
            var warpGO = new GameObject("Face Warp Field");
            warpGO.AddComponent<FaceWarpField>().Init(landmarkSource);

            var meshGO = new GameObject("Canonical Face Mesh");
            meshGO.AddComponent<CanonicalFaceMesh>().Init(cam, landmarkSource, camManager, material);

            // 눈 오버레이(홍채 컬러렌즈 + 아이라이너) — 얼굴 메시 뒤 큐에 합성.
            var irisGO = new GameObject("Iris Renderer");
            irisGO.AddComponent<IrisRenderer>().Init(cam, landmarkSource);

            // 립 오버레이 — 입술 윤곽 랜드마크로 만든 링 메시(칠한 마스크 대체).
            var lipGO = new GameObject("Lip Renderer");
            lipGO.AddComponent<LipRenderer>().Init(cam, landmarkSource);

            // 립 그림 — 사용자 임포트 입술 아트를 립 메시에 워프(데칼).
            var lipStyleGO = new GameObject("Lip Style Renderer");
            lipStyleGO.AddComponent<LipStyleRenderer>().Init(cam, landmarkSource);

            // 볼 그림 — 사용자 임포트 블러셔 아트를 광대 쿼드에 워프(데칼).
            var blushStyleGO = new GameObject("Blush Style Renderer");
            blushStyleGO.AddComponent<BlushStyleRenderer>().Init(cam, landmarkSource);

            // 눈썹 오버레이 — 눈썹 아크 밴드에 결 보존 틴트(마스카라/파우더/라이트너).
            var browGO = new GameObject("Brow Renderer");
            browGO.AddComponent<BrowRenderer>().Init(cam, landmarkSource);

            // 눈썹 펜슬 — 절차적 개별 털 스트로크(밴드 위에 얹힘).
            var pencilGO = new GameObject("Pencil Renderer");
            pencilGO.AddComponent<PencilRenderer>().Init(cam, landmarkSource);

            // 눈썹 스타일 — 텍스처(기본/임포트)를 아치에 워프.
            var styleGO = new GameObject("Style Renderer");
            styleGO.AddComponent<StyleRenderer>().Init(cam, landmarkSource);

            // 아이라인 스타일 — 텍스처(기본/임포트)를 속눈썹 라인+윙 밴드에 워프.
            var eyelinerStyleGO = new GameObject("Eyeliner Style Renderer");
            eyelinerStyleGO.AddComponent<EyelinerStyleRenderer>().Init(cam, landmarkSource);

            // 하안검 밴드 — 아이라인(하) + 애교살 2줄 (캐노니컬 마스크 추정판 대체).
            var lowerLidGO = new GameObject("Lower Lid Renderer");
            lowerLidGO.AddComponent<LowerLidRenderer>().Init(cam, landmarkSource);

            // 마스카라 — 상안검 lash 라인에 절차적 속눈썹 스트로크(Pencil lash 일반화).
            var lashGO = new GameObject("Lash Renderer");
            lashGO.AddComponent<LashRenderer>().Init(cam, landmarkSource);

            isTracked = () => landmarkSource.HasFace;
#else
            stage = "ARFoundation face renderer";
            camGO.AddComponent<ARCameraBackground>();
            Debug.LogWarning("[ARBootstrap] MediaPipe 패키지 미설치 — ARKit/ARCore 얼굴 트래킹 폴백 사용. " +
                             "전/후면 통합 트래킹은 scripts/setup-mediapipe.sh 실행 후 재익스포트.");

            // ARFaceManager는 facePrefab을 얼굴마다 복제한다. 빈 MeshFilter라
            // 템플릿 자체는 아무것도 렌더하지 않는다.
            var template = new GameObject("Face Template");
            template.transform.position = new Vector3(0f, -100f, 0f);
            template.AddComponent<MeshFilter>();
            var renderer = template.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            template.AddComponent<ARFaceMeshVisualizer>();

            var faceManager = originGO.AddComponent<ARFaceManager>();
            faceManager.facePrefab = template;

            isTracked = () => AnyTrackedFace(faceManager);
#endif

            stage = "ARKit auxiliary sources";
            // ── ARKit 보조 소스 (양 경로 공통 — 각자 런타임 가드로 자활) ──
            //  - ARKitDepthSource: 인물 스텐실을 _ARKitStencil/_ARKitOccOn 전역으로 노출.
            //    A12+/iOS13+ 아닌 기기·Android·에디터에선 디스크립터 사전 점검으로 즉시
            //    비활성, 구성 투표가 카메라를 플립하면 자체 가드가 요청을 철회한다.
            //  - ARKitBlendshapeSource: ARFaceManager 존재 시(비MEDIAPIPE 폴백)만 계수
            //    노출, MEDIAPIPE 주경로에선 자동 비활성(근거는 클래스 주석).
            // 둘 다 소비자가 아직 없어(배선은 별도 트랙) 실패·비활성 시 완전 무영향.
            var arkitAuxGO = new GameObject("ARKit Aux Sources");
            arkitAuxGO.AddComponent<ARKitDepthSource>().Init(camManager);
            arkitAuxGO.AddComponent<ARKitBlendshapeSource>();

            stage = "MakeupController";
            bridgeGO.AddComponent<MakeupController>().Init(material, camManager, isTracked);
            stage = "capture and media controllers";
            bridgeGO.AddComponent<PhotoCapture>();
            bridgeGO.AddComponent<VideoRecorder>();
            bridgeGO.AddComponent<UVTemplateExporter>();
            // 사전 촬영 미디어 보정(사진/영상) — 라이브 대신 임포트 프레임을
            // FaceLandmarkSource에 밀어넣어 기존 메이크업 스택을 재사용. MediaPipe 경로에서만
            // 실질 동작(임의 이미지 랜드마크 필요), 그 외엔 error로 응답(자체 가드).
            bridgeGO.AddComponent<MediaEditController>();
            // 사진→룩 추출(#1) — 레퍼런스 사진 1장을 옆에서 측정만(라이브 화면 유지):
            // 온디바이스 색 샘플링 → lookMeasurement 방출. NativeBridge 자체 구독(무배선).
            // MediaPipe 경로에서만 실질 동작, 그 외엔 error로 응답(자체 가드).
            bridgeGO.AddComponent<LookExtractController>();

            // 모든 메시지 소비자가 살아난 뒤에만 ready. RN이 첫 이벤트를 놓쳐도
            // requestReady가 같은 상태를 재전송한다.
            bridge.MarkReady();
            }
            catch (Exception exception)
            {
                bridge.ReportBootFailure(stage, exception);
                Debug.LogException(exception);
                throw;
            }
        }

#if !MEDIAPIPE
        static bool AnyTrackedFace(ARFaceManager faceManager)
        {
            if (faceManager == null) return false;
            foreach (var face in faceManager.trackables)
            {
                if (face.trackingState == TrackingState.Tracking) return true;
            }
            return false;
        }
#endif
    }
}
