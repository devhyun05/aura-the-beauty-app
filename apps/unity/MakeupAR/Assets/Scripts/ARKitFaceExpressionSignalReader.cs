using System;
using System.Collections.Generic;
using Aura.Face3D;
using Unity.Collections;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARKit;

public static class ARKitFaceExpressionSignalReader
{
    public static Dictionary<string, float> Read(
        ARFaceManager faceManager,
        ARFace face)
    {
        Dictionary<string, float> signals =
            new Dictionary<string, float>(StringComparer.Ordinal);
        if (face == null
            || faceManager == null
            || !(faceManager.subsystem is ARKitFaceSubsystem arkitFaceSubsystem))
        {
            return signals;
        }

        NativeArray<ARKitBlendShapeCoefficient> coefficients = default;
        try
        {
#pragma warning disable 618
            coefficients = arkitFaceSubsystem.GetBlendShapeCoefficients(
                face.trackableId,
                Allocator.Temp);
#pragma warning restore 618
            for (int index = 0; index < coefficients.Length; index += 1)
            {
                ARKitBlendShapeCoefficient coefficient = coefficients[index];
                string signal = MapSignal(coefficient.blendShapeLocation);
                if (signal == null
                    || float.IsNaN(coefficient.coefficient)
                    || float.IsInfinity(coefficient.coefficient))
                {
                    continue;
                }

                if (!signals.TryGetValue(signal, out float existing)
                    || coefficient.coefficient > existing)
                {
                    signals[signal] = coefficient.coefficient;
                }
            }
        }
        catch (Exception)
        {
            return new Dictionary<string, float>(StringComparer.Ordinal);
        }
        finally
        {
            if (coefficients.IsCreated)
            {
                coefficients.Dispose();
            }
        }

        return signals;
    }

    private static string MapSignal(ARKitBlendShapeLocation location)
    {
        switch (location)
        {
            case ARKitBlendShapeLocation.JawOpen:
                return Face3DExpressionSignal.JawOpen;
            case ARKitBlendShapeLocation.MouthClose:
                return Face3DExpressionSignal.MouthClose;
            case ARKitBlendShapeLocation.MouthSmileLeft:
            case ARKitBlendShapeLocation.MouthSmileRight:
                return Face3DExpressionSignal.MouthSmile;
            case ARKitBlendShapeLocation.MouthFrownLeft:
            case ARKitBlendShapeLocation.MouthFrownRight:
                return Face3DExpressionSignal.MouthFrown;
            case ARKitBlendShapeLocation.MouthPucker:
                return Face3DExpressionSignal.MouthPucker;
            case ARKitBlendShapeLocation.BrowInnerUp:
                return Face3DExpressionSignal.BrowInnerUp;
            case ARKitBlendShapeLocation.BrowDownLeft:
            case ARKitBlendShapeLocation.BrowDownRight:
                return Face3DExpressionSignal.BrowDown;
            case ARKitBlendShapeLocation.CheekPuff:
                return Face3DExpressionSignal.CheekPuff;
            default:
                return null;
        }
    }
}
