#if UNITY_EDITOR
using System;
using System.Diagnostics;
using System.IO;
using UnityEditor;
using UnityEngine;
using Debug = UnityEngine.Debug;

/// <summary>
/// One-click / one-command pipeline that rebuilds the Unity side and installs
/// it into the React Native iOS app:
///   1. Export the Unity iOS project        -> apps/unity-builds/ios-export
///   2. xcodebuild the UnityFramework scheme -> apps/unity-builds/framework
///   3. Copy UnityFramework.framework + Data + MediaPipeUnity.framework
///      -> apps/mobile/ios/UnityBuild
/// After this, rebuilding the AURA app (expo run:ios --device or Xcode Run)
/// embeds the fresh framework via the existing "Embed UnityFramework" phase.
///
/// Run from the editor menu:
///   Makeup AR Validation > Export + Build Framework + Install Into RN
/// or headless from a terminal:
///   Unity -batchmode -quit -projectPath "<repo>/apps/unity/MakeupAR" \
///         -executeMethod MakeupARBuildPipeline.ExportBuildAndInstall
/// </summary>
public static class MakeupARBuildPipeline
{
    // Application.dataPath = <repo>/apps/unity/MakeupAR/Assets -> AppsRoot = <repo>/apps
    private static string AppsRoot =>
        Path.GetFullPath(Path.Combine(Application.dataPath, "../../.."));

    private static string ExportPath =>
        Path.Combine(AppsRoot, "unity-builds", "ios-export");

    private static string FrameworkBuildDir =>
        Path.Combine(AppsRoot, "unity-builds", "framework");

    private static string RnUnityBuildDir =>
        Path.Combine(AppsRoot, "mobile", "ios", "UnityBuild");

    [MenuItem("Makeup AR Validation/Export + Build Framework + Install Into RN")]
    public static void ExportBuildAndInstall()
    {
        Debug.Log("[BuildPipeline] step 1/3: exporting Unity iOS project...");
        MakeupARValidationSetup.ExportIosProject();

        Debug.Log("[BuildPipeline] step 2/3: building UnityFramework with xcodebuild...");
        BuildUnityFramework();

        Debug.Log("[BuildPipeline] step 3/3: installing frameworks + Data into the RN app...");
        InstallIntoReactNative();

        Debug.Log(
            "[BuildPipeline] DONE. Now rebuild the app: cd apps/mobile && npm run ios:device"
            + " (or open AURA.xcworkspace in Xcode and press Run).");
    }

    private static void BuildUnityFramework()
    {
        string xcodeProject = Path.Combine(ExportPath, "Unity-iPhone.xcodeproj");
        if (!Directory.Exists(xcodeProject))
        {
            throw new InvalidOperationException(
                "Unity iOS export not found at " + xcodeProject);
        }

        if (Directory.Exists(FrameworkBuildDir))
        {
            Directory.Delete(FrameworkBuildDir, true);
        }

        Directory.CreateDirectory(FrameworkBuildDir);

        RunProcess(
            "/usr/bin/xcodebuild",
            "-project \"" + xcodeProject + "\""
            + " -scheme UnityFramework"
            + " -configuration Release"
            + " -destination \"generic/platform=iOS\""
            + " build"
            + " CONFIGURATION_BUILD_DIR=\"" + FrameworkBuildDir + "\""
            + " CODE_SIGNING_ALLOWED=NO");
    }

    private static void InstallIntoReactNative()
    {
        string builtFramework = Path.Combine(FrameworkBuildDir, "UnityFramework.framework");
        if (!Directory.Exists(builtFramework))
        {
            throw new InvalidOperationException(
                "Built UnityFramework.framework not found at " + builtFramework);
        }

        string exportedData = Path.Combine(ExportPath, "Data");
        if (!Directory.Exists(exportedData))
        {
            throw new InvalidOperationException(
                "Exported Data folder not found at " + exportedData);
        }

        string mediaPipeFramework = Path.Combine(
            ExportPath,
            "Frameworks",
            "com.github.homuler.mediapipe",
            "Runtime",
            "Plugins",
            "iOS",
            "MediaPipeUnity.framework");
        if (!Directory.Exists(mediaPipeFramework))
        {
            throw new InvalidOperationException(
                "Exported MediaPipeUnity.framework not found at " + mediaPipeFramework);
        }

        Directory.CreateDirectory(RnUnityBuildDir);

        string frameworkDestination = Path.Combine(RnUnityBuildDir, "UnityFramework.framework");
        string dataDestination = Path.Combine(RnUnityBuildDir, "Data");
        string mediaPipeDestination = Path.Combine(RnUnityBuildDir, "MediaPipeUnity.framework");

        // ditto preserves symlinks, permissions and code-signature layout.
        RunProcess(
            "/usr/bin/ditto",
            "\"" + builtFramework + "\" \"" + frameworkDestination + "\"");
        RunProcess(
            "/usr/bin/ditto",
            "\"" + exportedData + "\" \"" + dataDestination + "\"");
        RunProcess(
            "/usr/bin/ditto",
            "\"" + mediaPipeFramework + "\" \"" + mediaPipeDestination + "\"");

        Debug.Log(
            "[BuildPipeline] installed UnityFramework.framework, MediaPipeUnity.framework and Data into "
            + RnUnityBuildDir);
    }

    private static void RunProcess(string fileName, string arguments)
    {
        ProcessStartInfo startInfo = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };

        using (Process process = Process.Start(startInfo))
        {
            string standardOutput = process.StandardOutput.ReadToEnd();
            string standardError = process.StandardError.ReadToEnd();
            process.WaitForExit();

            Debug.Log(
                "[BuildPipeline] " + fileName + " exit=" + process.ExitCode
                + "\n" + Tail(standardOutput, 4000));

            if (process.ExitCode != 0)
            {
                throw new InvalidOperationException(
                    fileName + " failed with exit code " + process.ExitCode
                    + "\n" + Tail(standardError, 6000)
                    + "\n" + Tail(standardOutput, 3000));
            }
        }
    }

    private static string Tail(string value, int maxLength)
    {
        if (string.IsNullOrEmpty(value) || value.Length <= maxLength)
        {
            return value ?? string.Empty;
        }

        return "..." + value.Substring(value.Length - maxLength);
    }
}
#endif
