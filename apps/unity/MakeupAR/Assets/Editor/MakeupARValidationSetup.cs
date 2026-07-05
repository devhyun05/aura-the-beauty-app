#if UNITY_EDITOR
using System;
using System.IO;
using Unity.XR.CoreUtils;
using UnityEditor;
using UnityEditor.Callbacks;
using UnityEditor.SceneManagement;
using UnityEditor.iOS.Xcode;
using UnityEditor.XR.ARKit;
using UnityEditor.XR.Management;
using UnityEditor.XR.Management.Metadata;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.XR;
using UnityEngine.SceneManagement;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.Management;
using UnityEngine.Rendering;

public static class MakeupARValidationSetup
{
    private const string ScenePath = "Assets/Scenes/MakeupARFaceValidation.unity";
    private const string FacePrefabPath = "Assets/Prefabs/ValidationFaceOverlay.prefab";
    private const string FaceMaterialPath = "Assets/Materials/ValidationFaceOverlay.mat";
    private const string XRSettingsFolder = "Assets/XR";
    private const string XRGeneralSettingsPath = XRSettingsFolder + "/XRGeneralSettingsPerBuildTarget.asset";
    private const string ARKitSettingsPath = XRSettingsFolder + "/ARKitSettings.asset";

    [MenuItem("Makeup AR Validation/Configure Project And Scene")]
    public static void ConfigureProjectAndScene()
    {
        EnsureIosBuildTarget();

        PlayerSettings.companyName = "MakeupAR";
        PlayerSettings.productName = "MakeupARUnityValidation";
        PlayerSettings.SetApplicationIdentifier(BuildTargetGroup.iOS, "com.makeupar.validation");
        PlayerSettings.iOS.cameraUsageDescription = "Camera access is required for AR face tracking validation.";
        PlayerSettings.iOS.targetOSVersionString = "15.0";

        EnsureFolders();
        EnableArKitLoaderForIos();
        ConfigureArKitFaceTracking();

        Material faceMaterial = CreateFaceOverlayMaterial();
        GameObject facePrefab = CreateFacePrefab(faceMaterial);
        CreateValidationScene(facePrefab, faceMaterial);

        AssetDatabase.SaveAssets();
        Debug.Log("[M1] Unity AR Foundation validation project and scene configured.");
    }

    [MenuItem("Makeup AR Validation/Export iOS Project")]
    public static void ExportIosProject()
    {
        ConfigureProjectAndScene();

        string exportPath = Path.GetFullPath(Path.Combine(Application.dataPath, "../../..", "unity-builds", "ios-export"));
        Directory.CreateDirectory(exportPath);

        BuildPlayerOptions options = new BuildPlayerOptions
        {
            scenes = new[] { ScenePath },
            locationPathName = exportPath,
            target = BuildTarget.iOS,
            options = BuildOptions.None
        };

        UnityEditor.Build.Reporting.BuildReport report = BuildPipeline.BuildPlayer(options);
        Debug.Log("[M1] Unity iOS export result: " + report.summary.result + " at " + exportPath);
    }

    [PostProcessBuild(100)]
    public static void AddIosNativeFrameworks(BuildTarget target, string pathToBuiltProject)
    {
        if (target != BuildTarget.iOS)
        {
            return;
        }

        string projectPath = PBXProject.GetPBXProjectPath(pathToBuiltProject);
        PBXProject project = new PBXProject();
        project.ReadFromFile(projectPath);
        string targetGuid = project.GetUnityFrameworkTargetGuid();
        EnsureArKitNativePluginLinks(pathToBuiltProject, project, targetGuid);
        project.WriteToFile(projectPath);

        Debug.Log("[E7] Ensured iOS native ARKit/Vision framework links.");
    }

    private static void EnsureArKitNativePluginLinks(string pathToBuiltProject, PBXProject project, string targetGuid)
    {
        string arKitPackagePath = FindPackageCachePath("com.unity.xr.arkit@*");

        string unityArKitSource = CopyPackageFileToExport(
            FindRequiredPackageFile(arKitPackagePath, "UnityARKit.m", "Runtime/iOS/UnityARKit.m"),
            pathToBuiltProject,
            "Libraries/com.unity.xr.arkit/Runtime/iOS/UnityARKit.m");
        string unityArKitLibrary = CopyPackageFileToExport(
            FindRequiredPackageFile(arKitPackagePath, "libUnityARKit.a", "Runtime/iOS/"),
            pathToBuiltProject,
            "Libraries/com.unity.xr.arkit/Runtime/iOS/Xcode2600/libUnityARKit.a");
        string faceTrackingLibrary = CopyPackageFileToExport(
            FindRequiredPackageFile(arKitPackagePath, "libUnityARKitFaceTracking.a", "Runtime/FaceTracking/iOS/"),
            pathToBuiltProject,
            "Libraries/com.unity.xr.arkit/Runtime/FaceTracking/iOS/Xcode2600/libUnityARKitFaceTracking.a");

        AddFileToUnityFrameworkBuildIfMissing(project, targetGuid, unityArKitSource);
        AddFileToUnityFrameworkBuildIfMissing(project, targetGuid, unityArKitLibrary);
        AddFileToUnityFrameworkBuildIfMissing(project, targetGuid, faceTrackingLibrary);

        project.AddBuildProperty(targetGuid, "LIBRARY_SEARCH_PATHS", "$(PROJECT_DIR)/Libraries/com.unity.xr.arkit/Runtime/iOS/Xcode2600");
        project.AddBuildProperty(targetGuid, "LIBRARY_SEARCH_PATHS", "$(PROJECT_DIR)/Libraries/com.unity.xr.arkit/Runtime/FaceTracking/iOS/Xcode2600");

        EnsureSwiftCompatibilityLinks(project, targetGuid);

        project.AddFrameworkToProject(targetGuid, "ARKit.framework", false);
        project.AddFrameworkToProject(targetGuid, "CoreLocation.framework", false);
        project.AddFrameworkToProject(targetGuid, "MetalPerformanceShaders.framework", false);
        project.AddFrameworkToProject(targetGuid, "RoomPlan.framework", true);
        project.AddFrameworkToProject(targetGuid, "Vision.framework", false);
    }

    private static void EnsureSwiftCompatibilityLinks(PBXProject project, string targetGuid)
    {
        project.AddBuildProperty(targetGuid, "LIBRARY_SEARCH_PATHS", "$(TOOLCHAIN_DIR)/usr/lib/swift/iphoneos");
        project.AddBuildProperty(targetGuid, "OTHER_LDFLAGS", "-lswiftCompatibility51");
        project.AddBuildProperty(targetGuid, "OTHER_LDFLAGS", "-lswiftCompatibility56");
        project.AddBuildProperty(targetGuid, "OTHER_LDFLAGS", "-lswiftCompatibilityConcurrency");
        project.AddBuildProperty(targetGuid, "OTHER_LDFLAGS", "-lswiftCompatibilityPacks");
    }

    private static string FindPackageCachePath(string searchPattern)
    {
        string unityProjectRoot = Directory.GetParent(Application.dataPath).FullName;
        string packageCachePath = Path.Combine(unityProjectRoot, "Library", "PackageCache");
        if (!Directory.Exists(packageCachePath))
        {
            throw new DirectoryNotFoundException("Unity PackageCache was not found: " + packageCachePath);
        }

        string[] candidates = Directory.GetDirectories(packageCachePath, searchPattern);
        if (candidates.Length == 0)
        {
            throw new DirectoryNotFoundException("PackageCache entry was not found: " + searchPattern);
        }

        Array.Sort(candidates);
        return candidates[candidates.Length - 1];
    }

    private static string FindRequiredPackageFile(string packageRoot, string fileName, string requiredPathFragment)
    {
        string normalizedFragment = requiredPathFragment.Replace('\\', '/');
        foreach (string candidate in Directory.GetFiles(packageRoot, fileName, SearchOption.AllDirectories))
        {
            if (candidate.Replace('\\', '/').Contains(normalizedFragment))
            {
                return candidate;
            }
        }

        throw new FileNotFoundException(
            "Required package file was not found: " + fileName + " under " + requiredPathFragment,
            Path.Combine(packageRoot, requiredPathFragment));
    }

    private static string CopyPackageFileToExport(string sourcePath, string pathToBuiltProject, string projectRelativePath)
    {
        string destinationPath = Path.Combine(
            pathToBuiltProject,
            projectRelativePath.Replace('/', Path.DirectorySeparatorChar));
        string destinationDirectory = Path.GetDirectoryName(destinationPath);
        if (!string.IsNullOrEmpty(destinationDirectory))
        {
            Directory.CreateDirectory(destinationDirectory);
        }

        File.Copy(sourcePath, destinationPath, true);
        return projectRelativePath;
    }

    private static void AddFileToUnityFrameworkBuildIfMissing(PBXProject project, string targetGuid, string projectRelativePath)
    {
        string fileGuid = project.FindFileGuidByProjectPath(projectRelativePath);
        if (!string.IsNullOrEmpty(fileGuid))
        {
            return;
        }

        fileGuid = project.AddFile(projectRelativePath, projectRelativePath, PBXSourceTree.Source);
        project.AddFileToBuild(targetGuid, fileGuid);
    }

    private static void EnsureFolders()
    {
        EnsureAssetFolder("Assets/Scenes");
        EnsureAssetFolder("Assets/Prefabs");
        EnsureAssetFolder("Assets/Materials");
        EnsureAssetFolder(XRSettingsFolder);
    }

    private static void EnsureIosBuildTarget()
    {
        if (EditorUserBuildSettings.activeBuildTarget == BuildTarget.iOS)
        {
            return;
        }

        EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.iOS, BuildTarget.iOS);
    }

    private static void EnsureAssetFolder(string folderPath)
    {
        folderPath = folderPath.Replace('\\', '/');
        if (folderPath == "Assets" || AssetDatabase.IsValidFolder(folderPath))
        {
            return;
        }

        string parent = Path.GetDirectoryName(folderPath)?.Replace('\\', '/') ?? "Assets";
        string folderName = Path.GetFileName(folderPath);
        EnsureAssetFolder(parent);
        AssetDatabase.CreateFolder(parent, folderName);
    }

    private static Material CreateFaceOverlayMaterial()
    {
        Shader shader = Shader.Find("Universal Render Pipeline/Unlit");
        if (shader == null)
        {
            shader = Shader.Find("Unlit/Color");
        }

        if (shader == null)
        {
            shader = Shader.Find("Standard");
        }

        Material material = AssetDatabase.LoadAssetAtPath<Material>(FaceMaterialPath);
        if (material == null)
        {
            material = new Material(shader);
            AssetDatabase.CreateAsset(material, FaceMaterialPath);
        }
        else
        {
            material.shader = shader;
        }

        ConfigureTransparentMaterial(material, new Color(1.0f, 0.05f, 0.85f, 0.65f));
        EditorUtility.SetDirty(material);
        return material;
    }

    private static void ConfigureTransparentMaterial(Material material, Color color)
    {
        material.color = color;
        if (material.HasProperty("_BaseColor"))
        {
            material.SetColor("_BaseColor", color);
        }

        if (material.HasProperty("_Color"))
        {
            material.SetColor("_Color", color);
        }

        if (material.HasProperty("_Surface"))
        {
            material.SetFloat("_Surface", 1.0f);
        }

        material.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
        material.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
        material.SetInt("_ZWrite", 0);
        material.DisableKeyword("_ALPHATEST_ON");
        material.EnableKeyword("_ALPHABLEND_ON");
        material.DisableKeyword("_ALPHAPREMULTIPLY_ON");
        material.renderQueue = (int)UnityEngine.Rendering.RenderQueue.Transparent;
    }

    private static GameObject CreateFacePrefab(Material faceMaterial)
    {
        bool loadedExistingPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(FacePrefabPath) != null;
        GameObject prefabRoot = loadedExistingPrefab
            ? PrefabUtility.LoadPrefabContents(FacePrefabPath)
            : new GameObject("ValidationFaceOverlay");

        GetOrAddComponent<ARFace>(prefabRoot);
        GetOrAddComponent<MeshFilter>(prefabRoot);

        MeshRenderer renderer = GetOrAddComponent<MeshRenderer>(prefabRoot);
        renderer.sharedMaterial = faceMaterial;
        renderer.shadowCastingMode = ShadowCastingMode.Off;
        renderer.receiveShadows = false;
        renderer.allowOcclusionWhenDynamic = false;

        GetOrAddComponent<ARFaceMeshVisualizer>(prefabRoot);
        GetOrAddComponent<FaceTrackingMarker>(prefabRoot);

        GameObject prefab = PrefabUtility.SaveAsPrefabAsset(prefabRoot, FacePrefabPath);

        if (loadedExistingPrefab)
        {
            PrefabUtility.UnloadPrefabContents(prefabRoot);
        }
        else
        {
            UnityEngine.Object.DestroyImmediate(prefabRoot);
        }

        return prefab;
    }

    private static T GetOrAddComponent<T>(GameObject gameObject) where T : Component
    {
        T component = gameObject.GetComponent<T>();
        if (component == null)
        {
            component = gameObject.AddComponent<T>();
        }

        return component;
    }

    private static void CreateValidationScene(GameObject facePrefab, Material faceMaterial)
    {
        Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

        GameObject arSessionObject = new GameObject("AR Session");
        arSessionObject.AddComponent<ARSession>();
        arSessionObject.AddComponent<ARInputManager>();

        GameObject xrOriginObject = new GameObject("XR Origin");
        XROrigin xrOrigin = xrOriginObject.AddComponent<XROrigin>();

        GameObject cameraOffsetObject = new GameObject("Camera Offset");
        cameraOffsetObject.transform.SetParent(xrOriginObject.transform, false);
        xrOrigin.CameraFloorOffsetObject = cameraOffsetObject;

        GameObject cameraObject = new GameObject("AR Camera");
        cameraObject.transform.SetParent(cameraOffsetObject.transform, false);
        cameraObject.tag = "MainCamera";

        Camera camera = cameraObject.AddComponent<Camera>();
        camera.clearFlags = CameraClearFlags.SolidColor;
        camera.backgroundColor = Color.black;
        camera.nearClipPlane = 0.1f;
        camera.farClipPlane = 20.0f;
        cameraObject.AddComponent<AudioListener>();
        ARCameraManager cameraManager = cameraObject.AddComponent<ARCameraManager>();
        cameraManager.requestedFacingDirection = CameraFacingDirection.User;
        cameraObject.AddComponent<ARCameraBackground>();
        ConfigureTrackedPoseDriver(cameraObject);
        xrOrigin.Camera = camera;

        ARFaceManager faceManager = xrOriginObject.AddComponent<ARFaceManager>();
        faceManager.facePrefab = facePrefab;
        faceManager.requestedMaximumFaceCount = 1;

        GameObject statusObject = new GameObject("RNBridge");
        FaceTrackingStatusReporter reporter = statusObject.AddComponent<FaceTrackingStatusReporter>();
        SerializedObject serializedReporter = new SerializedObject(reporter);
        serializedReporter.FindProperty("arSession").objectReferenceValue = arSessionObject.GetComponent<ARSession>();
        serializedReporter.FindProperty("cameraManager").objectReferenceValue = cameraManager;
        serializedReporter.FindProperty("faceManager").objectReferenceValue = faceManager;
        serializedReporter.FindProperty("xrOrigin").objectReferenceValue = xrOrigin;
        serializedReporter.FindProperty("arCamera").objectReferenceValue = camera;
        serializedReporter.FindProperty("drawDebugOverlay").boolValue = true;
        serializedReporter.FindProperty("logE1Diagnostics").boolValue = true;
        serializedReporter.ApplyModifiedPropertiesWithoutUndo();

        RNBridge bridge = statusObject.AddComponent<RNBridge>();
        SerializedObject serializedBridge = new SerializedObject(bridge);
        serializedBridge.FindProperty("faceManager").objectReferenceValue = faceManager;
        serializedBridge.FindProperty("overlayMaterial").objectReferenceValue = faceMaterial;
        serializedBridge.ApplyModifiedPropertiesWithoutUndo();

        serializedReporter.Update();
        serializedReporter.FindProperty("rnBridge").objectReferenceValue = bridge;
        serializedReporter.ApplyModifiedPropertiesWithoutUndo();

        MakeupRegionDebugControls debugControls = statusObject.AddComponent<MakeupRegionDebugControls>();
        SerializedObject serializedDebugControls = new SerializedObject(debugControls);
        serializedDebugControls.FindProperty("rnBridge").objectReferenceValue = bridge;
        serializedDebugControls.ApplyModifiedPropertiesWithoutUndo();

        GameObject lightObject = new GameObject("Directional Light");
        Light light = lightObject.AddComponent<Light>();
        light.type = LightType.Directional;
        light.intensity = 1.0f;
        lightObject.transform.rotation = Quaternion.Euler(50.0f, -30.0f, 0.0f);

        EditorSceneManager.SaveScene(scene, ScenePath);
        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
    }

    private static void ConfigureTrackedPoseDriver(GameObject cameraObject)
    {
        TrackedPoseDriver trackedPoseDriver = GetOrAddComponent<TrackedPoseDriver>(cameraObject);
        trackedPoseDriver.trackingType = TrackedPoseDriver.TrackingType.RotationAndPosition;
        // Update-only, NOT UpdateAndBeforeRender: the before-render pass
        // moves the camera to a fresher device pose than the one the face
        // anchor (and the screen-locked camera image) came from, so during
        // device motion every face-anchored overlay slides against the face
        // in the image — most visible on the thin eyeliner line. Keeping the
        // camera on the Update pose renders image, anchor and camera from
        // the same frame; a face-mirror app doesn't need the extra pose
        // freshness that world-anchored AR wants.
        trackedPoseDriver.updateType = TrackedPoseDriver.UpdateType.Update;
        trackedPoseDriver.ignoreTrackingState = false;

        InputAction positionAction = new InputAction("Position", binding: "<XRHMD>/centerEyePosition", expectedControlType: "Vector3");
        positionAction.AddBinding("<HandheldARInputDevice>/devicePosition");

        InputAction rotationAction = new InputAction("Rotation", binding: "<XRHMD>/centerEyeRotation", expectedControlType: "Quaternion");
        rotationAction.AddBinding("<HandheldARInputDevice>/deviceRotation");

        trackedPoseDriver.positionInput = new InputActionProperty(positionAction);
        trackedPoseDriver.rotationInput = new InputActionProperty(rotationAction);
    }

    private static void EnableArKitLoaderForIos()
    {
        const string settingsKey = "Unity.XR.Management.XRGeneralSettingsPerBuildTarget";

        if (!EditorBuildSettings.TryGetConfigObject(settingsKey, out XRGeneralSettingsPerBuildTarget settingsPerBuildTarget))
        {
            settingsPerBuildTarget = AssetDatabase.LoadAssetAtPath<XRGeneralSettingsPerBuildTarget>(XRGeneralSettingsPath);
            if (settingsPerBuildTarget == null)
            {
                settingsPerBuildTarget = ScriptableObject.CreateInstance<XRGeneralSettingsPerBuildTarget>();
                AssetDatabase.CreateAsset(settingsPerBuildTarget, XRGeneralSettingsPath);
                AssetDatabase.SaveAssets();
            }

            EditorBuildSettings.AddConfigObject(settingsKey, settingsPerBuildTarget, true);
        }

        XRGeneralSettings generalSettings = settingsPerBuildTarget.SettingsForBuildTarget(BuildTargetGroup.iOS);
        if (generalSettings == null)
        {
            generalSettings = ScriptableObject.CreateInstance<XRGeneralSettings>();
            generalSettings.name = "iOS XR General Settings";
            AssetDatabase.AddObjectToAsset(generalSettings, settingsPerBuildTarget);
            settingsPerBuildTarget.SetSettingsForBuildTarget(BuildTargetGroup.iOS, generalSettings);
        }

        XRManagerSettings managerSettings = generalSettings.AssignedSettings;
        if (managerSettings == null)
        {
            managerSettings = ScriptableObject.CreateInstance<XRManagerSettings>();
            managerSettings.name = "iOS XR Manager Settings";
            AssetDatabase.AddObjectToAsset(managerSettings, settingsPerBuildTarget);
            generalSettings.AssignedSettings = managerSettings;
        }

        bool assigned = XRPackageMetadataStore.AssignLoader(managerSettings, "UnityEngine.XR.ARKit.ARKitLoader", BuildTargetGroup.iOS);
        if (!assigned)
        {
            Debug.LogWarning("[M1] ARKit loader was not assigned automatically. Confirm XR Plug-in Management > iOS > ARKit in the Unity UI.");
        }

        EditorUtility.SetDirty(settingsPerBuildTarget);
        EditorUtility.SetDirty(generalSettings);
        EditorUtility.SetDirty(managerSettings);
        AssetDatabase.SaveAssets();
    }

    private static void ConfigureArKitFaceTracking()
    {
        ARKitSettings settings = ARKitSettings.currentSettings;
        if (settings == null)
        {
            settings = AssetDatabase.LoadAssetAtPath<ARKitSettings>(ARKitSettingsPath);
        }

        if (settings == null)
        {
            settings = ScriptableObject.CreateInstance<ARKitSettings>();
            AssetDatabase.CreateAsset(settings, ARKitSettingsPath);
            AssetDatabase.SaveAssets();
        }

        settings.requirement = ARKitSettings.Requirement.Required;
        settings.faceTracking = true;
        ARKitSettings.currentSettings = settings;
        EditorUtility.SetDirty(settings);
        AssetDatabase.SaveAssets();
    }
}
#endif
