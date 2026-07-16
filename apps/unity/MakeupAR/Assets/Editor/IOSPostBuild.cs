#if UNITY_IOS
using UnityEditor;
using UnityEditor.Callbacks;
using UnityEditor.iOS.Xcode;
using UnityEngine;

namespace ARMakeup.EditorTools
{
    /// <summary>
    /// Prepares the exported Xcode project for UaaL embedding so the manual steps
    /// from the react-native-unity README are not needed:
    ///   - NativeCallProxy.h becomes a public header of UnityFramework
    ///   - the Data folder is bundled into the UnityFramework target
    /// </summary>
    public static class IOSPostBuild
    {
        [PostProcessBuild(100)]
        public static void OnPostProcessBuild(BuildTarget target, string pathToBuiltProject)
        {
            if (target != BuildTarget.iOS) return;

            var projPath = PBXProject.GetPBXProjectPath(pathToBuiltProject);
            var proj = new PBXProject();
            proj.ReadFromFile(projPath);

            var frameworkTarget = proj.GetUnityFrameworkTargetGuid();

            // VideoRecorder.mm(AVAssetWriter H.264 인코더)이 요구하는 프레임워크.
            // UIKit은 Unity 기본 링크라 생략, 나머지는 명시적으로 건다.
            proj.AddFrameworkToProject(frameworkTarget, "AVFoundation.framework", false);
            proj.AddFrameworkToProject(frameworkTarget, "CoreImage.framework", false);
            proj.AddFrameworkToProject(frameworkTarget, "ImageIO.framework", false);
            proj.AddFrameworkToProject(frameworkTarget, "CoreMedia.framework", false);
            proj.AddFrameworkToProject(frameworkTarget, "CoreVideo.framework", false);

            var headerGuid = proj.FindFileGuidByProjectPath("Libraries/Plugins/iOS/NativeCallProxy.h");
            if (!string.IsNullOrEmpty(headerGuid))
                proj.AddPublicHeaderToBuild(frameworkTarget, headerGuid);
            else
                Debug.LogWarning("[IOSPostBuild] NativeCallProxy.h not found in the Xcode project.");

            var dataGuid = proj.FindFileGuidByProjectPath("Data");
            if (!string.IsNullOrEmpty(dataGuid))
                proj.AddFileToBuild(frameworkTarget, dataGuid);
            else
                Debug.LogWarning("[IOSPostBuild] Data folder not found in the Xcode project.");

            proj.WriteToFile(projPath);
            Debug.Log("[IOSPostBuild] UnityFramework configured (public NativeCallProxy.h + Data membership).");
        }
    }
}
#endif
