using System;

namespace Aura.Face3D
{
    /// <summary>
    /// Aggregates only the native ARFrame samples that were accepted into the
    /// profile. Hardware capability is not treated as proof that depth was used:
    /// the observed ratio independently records capturedDepthData presence.
    /// </summary>
    public sealed class Face3DSensorProvenanceAccumulator
    {
        private int sampleCount;
        private int depthObservedCount;
        private bool? trueDepthHardware;
        private bool? faceTrackingSupported;
        private string deviceModel;
        private bool inconsistent;

        public bool TryAdd(
            bool sampleTrueDepthHardware,
            bool sampleDepthDataObserved,
            bool sampleFaceTrackingSupported,
            string sampleDeviceModel)
        {
            string normalizedDeviceModel = string.IsNullOrWhiteSpace(sampleDeviceModel)
                ? null
                : sampleDeviceModel.Trim();
            if (normalizedDeviceModel == null
                || (sampleDepthDataObserved && !sampleTrueDepthHardware))
            {
                inconsistent = true;
                return false;
            }

            if (sampleCount == 0)
            {
                trueDepthHardware = sampleTrueDepthHardware;
                faceTrackingSupported = sampleFaceTrackingSupported;
                deviceModel = normalizedDeviceModel;
            }
            else if (trueDepthHardware != sampleTrueDepthHardware
                || faceTrackingSupported != sampleFaceTrackingSupported
                || !string.Equals(
                    deviceModel,
                    normalizedDeviceModel,
                    StringComparison.Ordinal))
            {
                inconsistent = true;
                return false;
            }

            sampleCount += 1;
            if (sampleDepthDataObserved)
            {
                depthObservedCount += 1;
            }
            return true;
        }

        public bool TryBuild(out Face3DSensorProvenance provenance)
        {
            if (inconsistent
                || sampleCount <= 0
                || !trueDepthHardware.HasValue
                || !faceTrackingSupported.HasValue
                || string.IsNullOrWhiteSpace(deviceModel))
            {
                provenance = Face3DSensorProvenance.Unknown();
                return false;
            }

            provenance = new Face3DSensorProvenance(
                trueDepthHardware,
                (float)depthObservedCount / sampleCount,
                faceTrackingSupported,
                deviceModel);
            return true;
        }

        public void Reset()
        {
            sampleCount = 0;
            depthObservedCount = 0;
            trueDepthHardware = null;
            faceTrackingSupported = null;
            deviceModel = null;
            inconsistent = false;
        }
    }
