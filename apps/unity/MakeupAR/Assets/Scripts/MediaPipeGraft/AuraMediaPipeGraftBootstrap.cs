using System;
using System.Collections.Generic;
using ARMakeup.Bridge;
using ARMakeup.Capture;
using UnityEngine;
using UnityEngine.XR.ARFoundation;

namespace ARMakeup.Face
{
    /// <summary>
    /// Mounts the complete tutorial-stencil-0710 AR graph on AURA's existing
    /// ARSession/camera. AURA keeps ownership of the Unity player, native view,
    /// Face3D and still-analysis services; the stencil screen owns only the
    /// ARwithFable render graph while it is visible.
    /// </summary>
    public sealed class AuraMediaPipeGraftBootstrap : MonoBehaviour
    {
        static bool _spawned;
        bool _wired;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Spawn()
        {
            if (_spawned)
            {
                return;
            }

            _spawned = true;
            var go = new GameObject("Aura Stencil Runtime");
            DontDestroyOnLoad(go);
            go.AddComponent<AuraMediaPipeGraftBootstrap>();
        }

        void Update()
        {
            if (_wired)
            {
                return;
            }

            var cameraManager = FindAnyObjectByType<ARCameraManager>();
            if (cameraManager == null)
            {
                return;
            }

            var camera = cameraManager.GetComponent<Camera>();
            if (camera == null)
            {
                camera = Camera.main;
            }
            if (camera == null)
            {
                return;
            }

            Application.targetFrameRate = 60;

            var presenter = FindAnyObjectByType<FramePresenter>();
            if (presenter == null)
            {
                var presenterObject = new GameObject("ARwithFable Frame Presenter");
                presenterObject.transform.SetParent(camera.transform, false);
                presenter = presenterObject.AddComponent<FramePresenter>();
                presenter.Init(camera);
                presenter.SetUserFacing(true);
            }

            var landmarkSource = cameraManager.GetComponent<FaceLandmarkSource>();
            if (landmarkSource == null)
            {
                landmarkSource = cameraManager.gameObject.AddComponent<FaceLandmarkSource>();
                landmarkSource.Init(cameraManager);
            }

            var controlled = new List<Behaviour>();
            var material = MakeupController.CreateMaterial();

            var warp = new GameObject("ARwithFable Face Warp Field")
                .AddComponent<FaceWarpField>();
            warp.Init(landmarkSource);
            controlled.Add(warp);

            var mesh = new GameObject("ARwithFable Canonical Face Mesh")
                .AddComponent<CanonicalFaceMesh>();
            mesh.Init(camera, landmarkSource, cameraManager, material);
            controlled.Add(mesh);

            var iris = new GameObject("ARwithFable Iris Renderer").AddComponent<IrisRenderer>();
            iris.Init(camera, landmarkSource);
            controlled.Add(iris);

            var lip = new GameObject("ARwithFable Lip Renderer").AddComponent<LipRenderer>();
            lip.Init(camera, landmarkSource);
            controlled.Add(lip);

            var lipStyle = new GameObject("ARwithFable Lip Style Renderer")
                .AddComponent<LipStyleRenderer>();
            lipStyle.Init(camera, landmarkSource);
            controlled.Add(lipStyle);

            var blushStyle = new GameObject("ARwithFable Blush Style Renderer")
                .AddComponent<BlushStyleRenderer>();
            blushStyle.Init(camera, landmarkSource);
            controlled.Add(blushStyle);

            var brow = new GameObject("ARwithFable Brow Renderer").AddComponent<BrowRenderer>();
            brow.Init(camera, landmarkSource);
            controlled.Add(brow);

            var pencil = new GameObject("ARwithFable Pencil Renderer")
                .AddComponent<PencilRenderer>();
            pencil.Init(camera, landmarkSource);
            controlled.Add(pencil);

            var style = new GameObject("ARwithFable Style Renderer").AddComponent<StyleRenderer>();
            style.Init(camera, landmarkSource);
            controlled.Add(style);

            var eyelinerStyle = new GameObject("ARwithFable Eyeliner Style Renderer")
                .AddComponent<EyelinerStyleRenderer>();
            eyelinerStyle.Init(camera, landmarkSource);
            controlled.Add(eyelinerStyle);

            var lowerLid = new GameObject("ARwithFable Lower Lid Renderer")
                .AddComponent<LowerLidRenderer>();
            lowerLid.Init(camera, landmarkSource);
            controlled.Add(lowerLid);

            var lashes = new GameObject("ARwithFable Lash Renderer").AddComponent<LashRenderer>();
            lashes.Init(camera, landmarkSource);
            controlled.Add(lashes);

            var auxiliary = new GameObject("ARwithFable ARKit Aux Sources");
            auxiliary.AddComponent<ARKitDepthSource>().Init(cameraManager);
            auxiliary.AddComponent<ARKitBlendshapeSource>();

            var bridgeObject = GameObject.Find("NativeBridge");
            if (bridgeObject == null)
            {
                bridgeObject = new GameObject("NativeBridge");
            }
            if (bridgeObject.GetComponent<NativeBridge>() == null)
            {
                bridgeObject.AddComponent<NativeBridge>();
            }

            var controller = bridgeObject.GetComponent<MakeupController>();
            if (controller == null)
            {
                controller = bridgeObject.AddComponent<MakeupController>();
                controller.Init(material, cameraManager, () => landmarkSource.HasFace);
            }
            controlled.Add(controller);

            AddIfMissing<PhotoCapture>(bridgeObject);
            AddIfMissing<VideoRecorder>(bridgeObject);
            AddIfMissing<UVTemplateExporter>(bridgeObject);
            AddIfMissing<MediaEditController>(bridgeObject);
            AddIfMissing<LookExtractController>(bridgeObject);

            AddControlled(controlled, FindAnyObjectByType<TeethRenderer>());
            AddControlled(controlled, FindAnyObjectByType<DoubleLidRenderer>());
            AddControlled(controlled, FindAnyObjectByType<StencilGuideRenderer>());
            AddControlled(controlled, FindAnyObjectByType<SymmetryGuideRenderer>());
            AddControlled(controlled, FindAnyObjectByType<SplitMaskRenderer>());
            AddControlled(controlled, FindAnyObjectByType<LightingSimRenderer>());

            var host = gameObject.AddComponent<AuraStencilHost>();
            host.Initialize(
                cameraManager.GetComponent<ARCameraBackground>(),
                presenter,
                controlled);

            _wired = true;
            Debug.Log("[AuraStencil] tutorial-stencil-0710 runtime graft ready");

            // AURA는 자체 씬(ARSession 존재)을 소유하므로 ARBootstrap.Init이 25행에서
            // bail한다 → 그 경로의 NativeBridge.MarkReady()가 영영 불리지 않는다. 그래프트
            // 배선이 끝난 지금 인스턴스 MarkReady()를 직접 불러 (1)_bootState=Ready로
            // 만들어 OnMessageFromRN이 applyFilter 레시피를 드롭하지 않게 하고 (2)generation
            // 포함 'ready'를 RN에 보내 핸드셰이크를 완결한다. AuraStencilHost의
            // SetStencilActive/OnApplicationPause 기반 SendReady는 런타임 pause/idle churn에
            // 게이트되어 신뢰할 수 없었다(실기기에서 recipe 드롭·"카메라 연결 확인 중" 고착).
            bridgeObject.GetComponent<NativeBridge>().MarkReady();
        }

        static void AddIfMissing<T>(GameObject target) where T : Component
        {
            if (target.GetComponent<T>() == null)
            {
                target.AddComponent<T>();
            }
        }

        static void AddControlled(List<Behaviour> controlled, Behaviour behaviour)
        {
            if (behaviour != null && !controlled.Contains(behaviour))
            {
                controlled.Add(behaviour);
            }
        }
    }

    /// <summary>
    /// Route-level ownership switch. The host app can keep its original Unity
    /// services alive while the stencil route swaps only the visible camera
    /// presentation and ARwithFable render behaviours.
    /// </summary>
    public sealed class AuraStencilHost : MonoBehaviour
    {
        ARCameraBackground _cameraBackground;
        MeshRenderer _presenterRenderer;
        Behaviour[] _controlled = Array.Empty<Behaviour>();
        bool _stencilRequestedActive;
        bool _runtimeActive = true;

        public void Initialize(
            ARCameraBackground cameraBackground,
            FramePresenter presenter,
            List<Behaviour> controlled)
        {
            _cameraBackground = cameraBackground;
            _presenterRenderer = presenter != null
                ? presenter.GetComponent<MeshRenderer>()
                : null;
            _controlled = controlled.ToArray();
            _stencilRequestedActive = false;
            ApplyState();
        }

        // Called through UnitySendMessage by StencilUnityViewAdapter.
        public void SetStencilActive(string value)
        {
            _stencilRequestedActive =
                string.Equals(value, "true", StringComparison.OrdinalIgnoreCase)
                || value == "1";
            ApplyState();
            if (_stencilRequestedActive && _runtimeActive)
            {
                NativeBridge.SendReady();
            }
        }

        /// <summary>
        /// Runtime-level gate controlled by the host lifecycle coordinator.
        /// It intentionally does not overwrite the route's stencil request,
        /// so returning to AR restores the exact presentation state.
        /// </summary>
        public void SetRuntimeActive(bool active)
        {
            _runtimeActive = active;
            ApplyState();
        }

        void ApplyState()
        {
            var stencilRendering = _runtimeActive && _stencilRequestedActive;
            if (_cameraBackground != null)
            {
                _cameraBackground.enabled = _runtimeActive && !stencilRendering;
            }
            if (_presenterRenderer != null)
            {
                _presenterRenderer.enabled = stencilRendering;
            }
            foreach (var behaviour in _controlled)
            {
                if (behaviour != null)
                {
                    behaviour.enabled = stencilRendering;
                }
            }
        }

        void OnApplicationPause(bool paused)
        {
            if (!paused && _runtimeActive && _stencilRequestedActive)
            {
                NativeBridge.SendReady();
            }
        }
    }
}
