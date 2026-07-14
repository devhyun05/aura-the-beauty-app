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
        bool _active;

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
            ApplyActive(false);
        }

        // Called through UnitySendMessage by StencilUnityViewAdapter.
        public void SetStencilActive(string value)
        {
            var active = string.Equals(value, "true", StringComparison.OrdinalIgnoreCase)
                || value == "1";
            ApplyActive(active);
            if (active)
            {
                NativeBridge.SendReady();
            }
        }

        void ApplyActive(bool active)
        {
            _active = active;
            if (_cameraBackground != null)
            {
                _cameraBackground.enabled = !active;
            }
            if (_presenterRenderer != null)
            {
                _presenterRenderer.enabled = active;
            }
            foreach (var behaviour in _controlled)
            {
                if (behaviour != null)
                {
                    behaviour.enabled = active;
                }
            }
        }

        void OnApplicationPause(bool paused)
        {
            if (!paused && _active)
            {
                NativeBridge.SendReady();
            }
        }
    }
}
