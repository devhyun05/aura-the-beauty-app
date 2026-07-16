using System;
using System.Collections.Generic;
using UnityEngine;

namespace Aura.Face3D
{
    public static class HairlineDetectionContract
    {
        // Unified capture wire contract. The downstream vertical-thirds
        // adapter maps this to its historical keypoint provider name
        // "mediapipe_hairline_boundary".
        public const string Provider = "mediapipe_selfie_multiclass";
        public const string ProviderNone = "none";
        public const string Method = "mediapipe_hair_skin_boundary";

        public const string OutcomeHighConfidence = "detected_high_confidence";
        public const string OutcomeLowConfidence = "detected_low_confidence";
        public const string OutcomeOmitted = "omitted";

        public const string AdvisoryLikelyVisible = "likely_visible";
        public const string AdvisoryLikelyOccluded = "likely_occluded";
        public const string AdvisoryUnknown = "unknown";
    }

    /// <summary>
    /// Exact projected references for the synchronized native face sample.
    /// Coordinates are normalized portrait-unmirrored image coordinates with
    /// origin at the top-left and y increasing downwards.
    /// </summary>
    public sealed class HairlineFaceReference
    {
        public HairlineFaceReference(
            Vector2 leftFace,
            Vector2 rightFace,
            Vector2 foreheadTop,
            Vector2 glabella,
            float yawDegrees,
            float pitchDegrees,
            float rollDegrees)
        {
            LeftFace = leftFace;
            RightFace = rightFace;
            ForeheadTop = foreheadTop;
            Glabella = glabella;
            YawDegrees = yawDegrees;
            PitchDegrees = pitchDegrees;
            RollDegrees = rollDegrees;
        }

        public Vector2 LeftFace { get; }
        public Vector2 RightFace { get; }
        public Vector2 ForeheadTop { get; }
        public Vector2 Glabella { get; }
        public float YawDegrees { get; }
        public float PitchDegrees { get; }
        public float RollDegrees { get; }
    }

    /// <summary>
    /// Metadata for one immutable copied segmentation frame.
    ///
    /// The packed pixels are supplied separately to Evaluate. ReferenceToMaskX/Y
    /// map the face-reference coordinate space into the packed mask coordinate
    /// space:
    ///   maskU = dot(ReferenceToMaskX, (u, v, 1))
    ///   maskV = dot(ReferenceToMaskY, (u, v, 1))
    /// </summary>
    public sealed class HairlineMaskReference
    {
        public HairlineMaskReference(
            string frameToken,
            double sensorTimestampMs,
            double observedAtMs,
            int inputWidth,
            int inputHeight,
            int maskWidth,
            int maskHeight,
            int rotationDegrees,
            Vector3 referenceToMaskX,
            Vector3 referenceToMaskY)
        {
            FrameToken = frameToken ?? string.Empty;
            SensorTimestampMs = sensorTimestampMs;
            ObservedAtMs = observedAtMs;
            InputWidth = inputWidth;
            InputHeight = inputHeight;
            MaskWidth = maskWidth;
            MaskHeight = maskHeight;
            RotationDegrees = NormalizeRotation(rotationDegrees);
            ReferenceToMaskX = referenceToMaskX;
            ReferenceToMaskY = referenceToMaskY;
        }

        public string FrameToken { get; }
        public double SensorTimestampMs { get; }
        public double ObservedAtMs { get; }
        public int InputWidth { get; }
        public int InputHeight { get; }
        public int MaskWidth { get; }
        public int MaskHeight { get; }
        public int RotationDegrees { get; }
        public Vector3 ReferenceToMaskX { get; }
        public Vector3 ReferenceToMaskY { get; }

        public int ReferenceHeightPixels
        {
            get
            {
                int height = RotationDegrees == 90 || RotationDegrees == 270
                    ? InputWidth
                    : InputHeight;
                return height > 0 ? height : MaskHeight;
            }
        }

        public static HairlineMaskReference CreateUprightIdentity(
            string frameToken,
            double sensorTimestampMs,
            double observedAtMs,
            int inputWidth,
            int inputHeight,
            int maskWidth,
            int maskHeight,
            int rotationDegrees)
        {
            return new HairlineMaskReference(
                frameToken,
                sensorTimestampMs,
                observedAtMs,
                inputWidth,
                inputHeight,
                maskWidth,
                maskHeight,
                rotationDegrees,
                new Vector3(1.0f, 0.0f, 0.0f),
                new Vector3(0.0f, 1.0f, 0.0f));
        }

        public bool TryMapReferenceToMask(Vector2 referencePoint, out Vector2 maskPoint)
        {
            maskPoint = new Vector2(
                ReferenceToMaskX.x * referencePoint.x
                    + ReferenceToMaskX.y * referencePoint.y
                    + ReferenceToMaskX.z,
                ReferenceToMaskY.x * referencePoint.x
                    + ReferenceToMaskY.y * referencePoint.y
                    + ReferenceToMaskY.z);
            return IsFinite(maskPoint.x) && IsFinite(maskPoint.y);
        }

        private static int NormalizeRotation(int rotationDegrees)
        {
            int normalized = rotationDegrees % 360;
            return normalized < 0 ? normalized + 360 : normalized;
        }

        private static bool IsFinite(float value)
        {
            return !float.IsNaN(value) && !float.IsInfinity(value);
        }
    }

    /// <summary>
    /// Seed limits ported from AURAFaceRatioHairline.m. These are deliberately
    /// immutable and remain calibration inputs, not claims of device validation.
    /// </summary>
    public sealed class HairlineEstimatorLimits
    {
        public static readonly HairlineEstimatorLimits Default =
            new HairlineEstimatorLimits();

        public HairlineEstimatorLimits(
            float roiHalfWidthFraction = 0.28f,
            float roiTopOffsetFraction = 0.35f,
            float roiBottomMarginFraction = 0.03f,
            float roiUpwardExtensionFraction = 0.20f,
            float hairAlphaThreshold = 0.45f,
            float skinAlphaThreshold = 0.35f,
            float gradientThreshold = 0.25f,
            float hairWindowFraction = 0.005f,
            float skinWindowFraction = 0.010f,
            float gradientOffsetFraction = 0.004f,
            int sampledColumnCount = 48,
            int minimumCandidateCount = 8,
            float outlierMaximumDeviationFraction = 0.08f,
            float minimumSkinFraction = 0.20f,
            float minimumGapToGlabellaFraction = 0.02f,
            float boundarySharpnessWeight = 0.40f,
            float candidateConsistencyWeight = 0.30f,
            float foreheadSkinVisibilityWeight = 0.20f,
            float poseQualityWeight = 0.10f,
            float sharpnessNormalizationGradient = 0.60f,
            float skinVisibilityNormalization = 0.60f,
            float poseYawLimitDegrees = 8.0f,
            float posePitchLimitDegrees = 8.0f,
            float poseRollLimitDegrees = 5.0f,
            float highConfidenceMinimum = 0.70f,
            float lowConfidenceMinimum = 0.45f,
            float occlusionHairProbabilityMinimum = 0.55f,
            float occlusionHairDominanceMargin = 0.20f,
            float strongOcclusionHairFractionMinimum = 0.72f,
            float strongOcclusionCentralHairFractionMinimum = 0.80f,
            float strongOcclusionSkinFractionMaximum = 0.12f)
        {
            RoiHalfWidthFraction = roiHalfWidthFraction;
            RoiTopOffsetFraction = roiTopOffsetFraction;
            RoiBottomMarginFraction = roiBottomMarginFraction;
            RoiUpwardExtensionFraction = roiUpwardExtensionFraction;
            HairAlphaThreshold = hairAlphaThreshold;
            SkinAlphaThreshold = skinAlphaThreshold;
            GradientThreshold = gradientThreshold;
            HairWindowFraction = hairWindowFraction;
            SkinWindowFraction = skinWindowFraction;
            GradientOffsetFraction = gradientOffsetFraction;
            SampledColumnCount = Math.Max(8, sampledColumnCount);
            MinimumCandidateCount = Math.Max(1, minimumCandidateCount);
            OutlierMaximumDeviationFraction = outlierMaximumDeviationFraction;
            MinimumSkinFraction = minimumSkinFraction;
            MinimumGapToGlabellaFraction = minimumGapToGlabellaFraction;
            BoundarySharpnessWeight = boundarySharpnessWeight;
            CandidateConsistencyWeight = candidateConsistencyWeight;
            ForeheadSkinVisibilityWeight = foreheadSkinVisibilityWeight;
            PoseQualityWeight = poseQualityWeight;
            SharpnessNormalizationGradient = sharpnessNormalizationGradient;
            SkinVisibilityNormalization = skinVisibilityNormalization;
            PoseYawLimitDegrees = poseYawLimitDegrees;
            PosePitchLimitDegrees = posePitchLimitDegrees;
            PoseRollLimitDegrees = poseRollLimitDegrees;
            HighConfidenceMinimum = highConfidenceMinimum;
            LowConfidenceMinimum = lowConfidenceMinimum;
            OcclusionHairProbabilityMinimum = occlusionHairProbabilityMinimum;
            OcclusionHairDominanceMargin = occlusionHairDominanceMargin;
            StrongOcclusionHairFractionMinimum = strongOcclusionHairFractionMinimum;
            StrongOcclusionCentralHairFractionMinimum =
                strongOcclusionCentralHairFractionMinimum;
            StrongOcclusionSkinFractionMaximum = strongOcclusionSkinFractionMaximum;
        }

        public float RoiHalfWidthFraction { get; }
        public float RoiTopOffsetFraction { get; }
        public float RoiBottomMarginFraction { get; }
        public float RoiUpwardExtensionFraction { get; }
        public float HairAlphaThreshold { get; }
        public float SkinAlphaThreshold { get; }
        public float GradientThreshold { get; }
        public float HairWindowFraction { get; }
        public float SkinWindowFraction { get; }
        public float GradientOffsetFraction { get; }
        public int SampledColumnCount { get; }
        public int MinimumCandidateCount { get; }
        public float OutlierMaximumDeviationFraction { get; }
        public float MinimumSkinFraction { get; }
        public float MinimumGapToGlabellaFraction { get; }
        public float BoundarySharpnessWeight { get; }
        public float CandidateConsistencyWeight { get; }
        public float ForeheadSkinVisibilityWeight { get; }
        public float PoseQualityWeight { get; }
        public float SharpnessNormalizationGradient { get; }
        public float SkinVisibilityNormalization { get; }
        public float PoseYawLimitDegrees { get; }
        public float PosePitchLimitDegrees { get; }
        public float PoseRollLimitDegrees { get; }
        public float HighConfidenceMinimum { get; }
        public float LowConfidenceMinimum { get; }
        public float OcclusionHairProbabilityMinimum { get; }
        public float OcclusionHairDominanceMargin { get; }
        public float StrongOcclusionHairFractionMinimum { get; }
        public float StrongOcclusionCentralHairFractionMinimum { get; }
        public float StrongOcclusionSkinFractionMaximum { get; }
    }

    public sealed class HairlineDetectionResult
    {
        internal HairlineDetectionResult(
            string outcome,
            string advisoryStatus,
            Vector2? position,
            float? confidence,
            int candidateCount,
            float? boundaryStandardDeviationPixels,
            float skinFraction,
            float hairDominantFraction,
            float centralHairDominantFraction,
            bool usedExpandedRoi,
            string failureReason,
            HairlineMaskReference mask)
        {
            Outcome = outcome;
            AdvisoryStatus = advisoryStatus;
            Position = position;
            Confidence = confidence;
            CandidateCount = candidateCount;
            BoundaryStandardDeviationPixels = boundaryStandardDeviationPixels;
            SkinFraction = Mathf.Clamp01(skinFraction);
            HairDominantFraction = Mathf.Clamp01(hairDominantFraction);
            CentralHairDominantFraction = Mathf.Clamp01(
                centralHairDominantFraction);
            UsedExpandedRoi = usedExpandedRoi;
            FailureReason = failureReason ?? string.Empty;
            FrameToken = mask != null ? mask.FrameToken : string.Empty;
            SensorTimestampMs = mask != null
                ? mask.SensorTimestampMs
                : double.NaN;
            ObservedAtMs = mask != null
                ? mask.ObservedAtMs
                : double.NaN;
        }

        public string Provider => Position.HasValue
            ? HairlineDetectionContract.Provider
            : HairlineDetectionContract.ProviderNone;
        public string Method => Position.HasValue
            ? HairlineDetectionContract.Method
            : string.Empty;
        public string Outcome { get; }
        public string AdvisoryStatus { get; }
        public Vector2? Position { get; }
        public float? Confidence { get; }
        public int CandidateCount { get; }
        public float? BoundaryStandardDeviationPixels { get; }
        public float SkinFraction { get; }
        public float HairDominantFraction { get; }
        public float CentralHairDominantFraction { get; }
        public bool UsedExpandedRoi { get; }
        public string FailureReason { get; }
        public string FrameToken { get; }
        public double SensorTimestampMs { get; }
        public double ObservedAtMs { get; }

        public bool HasActualMeasurement => Position.HasValue;
        public bool AnalysisEligible =>
            string.Equals(
                Outcome,
                HairlineDetectionContract.OutcomeHighConfidence,
                StringComparison.Ordinal);
    }

    /// <summary>
    /// Pure RGBA estimator. R is face-skin probability and G is hair
    /// probability. It never fabricates a forehead point: only a measured
    /// boundary at confidence >= 0.45 is returned, and only >= 0.70 is analysis
    /// eligible. Missing/weak boundaries are omitted.
    /// </summary>
    public static class HairlineVisibilityEstimator
    {
        private const int SkinChannelOffset = 0;
        private const int HairChannelOffset = 1;

        private sealed class Candidate
        {
            public float X;
            public float Y;
            public float Gradient;
            public float Weight;
        }

        private sealed class Occupancy
        {
            public float SkinFraction;
            public float HairDominantFraction;
            public float CentralHairDominantFraction;
        }

        public static HairlineDetectionResult Evaluate(
            byte[] packedRgba,
            HairlineMaskReference mask,
            HairlineFaceReference face,
            HairlineEstimatorLimits limits = null)
        {
            limits = limits ?? HairlineEstimatorLimits.Default;
            if (!TryValidateInputs(packedRgba, mask, face, out string invalidReason))
            {
                return Omitted(
                    HairlineDetectionContract.AdvisoryUnknown,
                    invalidReason,
                    mask);
            }

            float faceWidth = Mathf.Abs(face.RightFace.x - face.LeftFace.x);
            float faceCenterX = (face.LeftFace.x + face.RightFace.x) * 0.5f;
            float roiX0 = Mathf.Clamp01(
                faceCenterX - faceWidth * limits.RoiHalfWidthFraction);
            float roiX1 = Mathf.Clamp01(
                faceCenterX + faceWidth * limits.RoiHalfWidthFraction);
            float roiY0 = Mathf.Clamp01(
                face.ForeheadTop.y - faceWidth * limits.RoiTopOffsetFraction);
            float roiY1 = Mathf.Clamp01(
                face.Glabella.y - faceWidth * limits.RoiBottomMarginFraction);

            if (roiX1 - roiX0 < 0.02f || roiY1 - roiY0 < 0.02f)
            {
                return Omitted(
                    HairlineDetectionContract.AdvisoryUnknown,
                    "roi_invalid",
                    mask);
            }

            Occupancy occupancy = ComputeOccupancy(
                packedRgba,
                mask,
                roiX0,
                roiX1,
                roiY0,
                roiY1,
                limits);
            float poseQuality = ComputePoseQuality(face, limits);

            List<Candidate> candidates = FindCandidates(
                packedRgba,
                mask,
                roiX0,
                roiX1,
                roiY0,
                roiY1,
                faceCenterX,
                limits,
                1.0f);
            bool usedExpandedRoi = false;

            if (candidates.Count < limits.MinimumCandidateCount)
            {
                float expandedY0 = Mathf.Clamp01(
                    roiY0 - faceWidth * limits.RoiUpwardExtensionFraction);
                if (roiY0 - expandedY0 >= 0.01f
                    && HasUpperContinuationEvidence(
                        packedRgba,
                        mask,
                        roiX0,
                        roiX1,
                        expandedY0,
                        roiY0,
                        faceCenterX,
                        limits))
                {
                    List<Candidate> expanded = FindCandidates(
                        packedRgba,
                        mask,
                        roiX0,
                        roiX1,
                        expandedY0,
                        roiY1,
                        faceCenterX,
                        limits,
                        1.0f);
                    if (expanded.Count >= limits.MinimumCandidateCount)
                    {
                        candidates = expanded;
                        roiY0 = expandedY0;
                        usedExpandedRoi = true;
                        occupancy = ComputeOccupancy(
                            packedRgba,
                            mask,
                            roiX0,
                            roiX1,
                            roiY0,
                            roiY1,
                            limits);
                    }
                }
            }

            string occlusionAdvisory = IsStrongLikelyOcclusion(
                    occupancy,
                    poseQuality,
                    limits)
                ? HairlineDetectionContract.AdvisoryLikelyOccluded
                : HairlineDetectionContract.AdvisoryUnknown;

            if (candidates.Count < limits.MinimumCandidateCount)
            {
                return Omitted(
                    occlusionAdvisory,
                    "no_candidates",
                    mask,
                    candidates.Count,
                    occupancy,
                    usedExpandedRoi);
            }

            List<Candidate> filtered = FilterOutliers(
                candidates,
                faceWidth * limits.OutlierMaximumDeviationFraction);
            if (filtered.Count < limits.MinimumCandidateCount)
            {
                return Omitted(
                    occlusionAdvisory,
                    "no_candidates",
                    mask,
                    filtered.Count,
                    occupancy,
                    usedExpandedRoi);
            }

            filtered.Sort((left, right) => left.Y.CompareTo(right.Y));
            float totalWeight = 0.0f;
            float weightedX = 0.0f;
            float meanGradient = 0.0f;
            for (int index = 0; index < filtered.Count; index += 1)
            {
                totalWeight += filtered[index].Weight;
                weightedX += filtered[index].X * filtered[index].Weight;
                meanGradient += filtered[index].Gradient;
            }

            meanGradient /= filtered.Count;
            float hairlineY = WeightedMedianY(filtered, totalWeight);
            float hairlineX = Mathf.Clamp01(
                weightedX / Mathf.Max(totalWeight, 0.001f));
            hairlineY = Mathf.Clamp01(hairlineY);

            float variance = 0.0f;
            for (int index = 0; index < filtered.Count; index += 1)
            {
                float delta = filtered[index].Y - hairlineY;
                variance += delta * delta;
            }
            float standardDeviation = Mathf.Sqrt(variance / filtered.Count);
            float boundaryStandardDeviationPixels =
                standardDeviation * Math.Max(1, mask.ReferenceHeightPixels);
            float foreheadSkinFraction = ComputeSkinFraction(
                packedRgba,
                mask,
                roiX0,
                roiX1,
                hairlineY,
                roiY1);

            float boundarySharpness = Mathf.Clamp01(
                meanGradient
                / Mathf.Max(limits.SharpnessNormalizationGradient, 0.001f));
            float coverage = Mathf.Clamp01(
                filtered.Count / (float)limits.SampledColumnCount);
            float consistencyStandardDeviationTerm = 1.0f - Mathf.Clamp01(
                standardDeviation / Mathf.Max(0.08f * faceWidth, 0.001f));
            float candidateConsistency = Mathf.Clamp01(
                0.5f * coverage + 0.5f * consistencyStandardDeviationTerm);
            float foreheadSkinVisibility = Mathf.Clamp01(
                foreheadSkinFraction
                / Mathf.Max(limits.SkinVisibilityNormalization, 0.001f));
            float confidence = Mathf.Clamp01(
                limits.BoundarySharpnessWeight * boundarySharpness
                + limits.CandidateConsistencyWeight * candidateConsistency
                + limits.ForeheadSkinVisibilityWeight * foreheadSkinVisibility
                + limits.PoseQualityWeight * poseQuality);

            bool visible =
                foreheadSkinFraction >= limits.MinimumSkinFraction
                && hairlineY
                    <= face.Glabella.y
                        - faceWidth * limits.MinimumGapToGlabellaFraction;
            if (!visible)
            {
                return Omitted(
                    occlusionAdvisory,
                    "visibility_gate_failed",
                    mask,
                    filtered.Count,
                    occupancy,
                    usedExpandedRoi,
                    confidence,
                    boundaryStandardDeviationPixels,
                    foreheadSkinFraction);
            }

            if (confidence < limits.LowConfidenceMinimum)
            {
                return Omitted(
                    occlusionAdvisory,
                    "confidence_below_minimum",
                    mask,
                    filtered.Count,
                    occupancy,
                    usedExpandedRoi,
                    confidence,
                    boundaryStandardDeviationPixels,
                    foreheadSkinFraction);
            }

            bool highConfidence = confidence >= limits.HighConfidenceMinimum;
            return new HairlineDetectionResult(
                highConfidence
                    ? HairlineDetectionContract.OutcomeHighConfidence
                    : HairlineDetectionContract.OutcomeLowConfidence,
                highConfidence
                    ? HairlineDetectionContract.AdvisoryLikelyVisible
                    : HairlineDetectionContract.AdvisoryUnknown,
                new Vector2(hairlineX, hairlineY),
                confidence,
                filtered.Count,
                boundaryStandardDeviationPixels,
                foreheadSkinFraction,
                occupancy.HairDominantFraction,
                occupancy.CentralHairDominantFraction,
                usedExpandedRoi,
                string.Empty,
                mask);
        }

        private static bool TryValidateInputs(
            byte[] packedRgba,
            HairlineMaskReference mask,
            HairlineFaceReference face,
            out string reason)
        {
            if (packedRgba == null
                || mask == null
                || mask.MaskWidth <= 0
                || mask.MaskHeight <= 0
                || packedRgba.Length != mask.MaskWidth * mask.MaskHeight * 4)
            {
                reason = "mask_invalid";
                return false;
            }
            if (face == null
                || !IsNormalized(face.LeftFace)
                || !IsNormalized(face.RightFace)
                || !IsNormalized(face.ForeheadTop)
                || !IsNormalized(face.Glabella)
                || !IsFinite(face.YawDegrees)
                || !IsFinite(face.PitchDegrees)
                || !IsFinite(face.RollDegrees)
                || Mathf.Abs(face.RightFace.x - face.LeftFace.x) <= 0.05f)
            {
                reason = "face_reference_invalid";
                return false;
            }
            if (!mask.TryMapReferenceToMask(Vector2.zero, out _)
                || !mask.TryMapReferenceToMask(Vector2.one, out _))
            {
                reason = "mask_transform_invalid";
                return false;
            }

            reason = string.Empty;
            return true;
        }

        private static List<Candidate> FindCandidates(
            byte[] packedRgba,
            HairlineMaskReference mask,
            float roiX0,
            float roiX1,
            float roiY0,
            float roiY1,
            float faceCenterX,
            HairlineEstimatorLimits limits,
            float thresholdScale)
        {
            List<Candidate> candidates =
                new List<Candidate>(limits.SampledColumnCount);
            int referenceHeight = Math.Max(1, mask.ReferenceHeightPixels);
            float hairWindow = Mathf.Max(
                2.0f / referenceHeight,
                limits.HairWindowFraction);
            float skinWindow = Mathf.Max(
                3.0f / referenceHeight,
                limits.SkinWindowFraction);
            float gradientOffset = Mathf.Max(
                2.0f / referenceHeight,
                limits.GradientOffsetFraction);
            int rowStart = Mathf.Clamp(
                Mathf.FloorToInt(roiY0 * (referenceHeight - 1)),
                0,
                referenceHeight - 1);
            int rowEnd = Mathf.Clamp(
                Mathf.CeilToInt(roiY1 * (referenceHeight - 1)),
                0,
                referenceHeight - 1);

            for (int column = 0; column < limits.SampledColumnCount; column += 1)
            {
                float columnRatio =
                    (column + 0.5f) / limits.SampledColumnCount;
                float x = Mathf.Lerp(roiX0, roiX1, columnRatio);
                for (int row = rowStart; row <= rowEnd; row += 1)
                {
                    float y = (row + 0.5f) / referenceHeight;
                    float hairAbove = AverageChannelRange(
                        packedRgba,
                        mask,
                        HairChannelOffset,
                        x,
                        y - hairWindow,
                        y);
                    float hairBelow = AverageChannelRange(
                        packedRgba,
                        mask,
                        HairChannelOffset,
                        x,
                        y,
                        y + hairWindow);
                    float skinBelow = AverageChannelRange(
                        packedRgba,
                        mask,
                        SkinChannelOffset,
                        x,
                        y,
                        y + skinWindow);
                    float skinAbove = AverageChannelRange(
                        packedRgba,
                        mask,
                        SkinChannelOffset,
                        x,
                        y - skinWindow,
                        y);
                    float hairGradient = hairAbove - AverageChannelRange(
                        packedRgba,
                        mask,
                        HairChannelOffset,
                        x,
                        y + gradientOffset,
                        y + gradientOffset + hairWindow);
                    float skinGradient = AverageChannelRange(
                            packedRgba,
                            mask,
                            SkinChannelOffset,
                            x,
                            y + gradientOffset,
                            y + gradientOffset + skinWindow)
                        - skinAbove;
                    float gradient = Mathf.Max(
                        0.0f,
                        (hairGradient + skinGradient) * 0.5f);

                    if (hairAbove
                            < limits.HairAlphaThreshold * thresholdScale
                        || skinBelow
                            < limits.SkinAlphaThreshold * thresholdScale
                        || gradient
                            < limits.GradientThreshold * thresholdScale
                        || hairAbove <= hairBelow)
                    {
                        continue;
                    }

                    float sigma = Mathf.Max(
                        (roiX1 - roiX0) * 0.33f,
                        0.001f);
                    float normalizedOffset = (x - faceCenterX) / sigma;
                    float centerWeight = Mathf.Exp(
                        -0.5f * normalizedOffset * normalizedOffset);
                    candidates.Add(new Candidate
                    {
                        X = x,
                        Y = y,
                        Gradient = gradient,
                        Weight = Mathf.Max(0.001f, gradient * centerWeight)
                    });
                    break;
                }
            }

            return candidates;
        }

        private static bool HasUpperContinuationEvidence(
            byte[] packedRgba,
            HairlineMaskReference mask,
            float roiX0,
            float roiX1,
            float expandedY0,
            float initialY0,
            float faceCenterX,
            HairlineEstimatorLimits limits)
        {
            List<Candidate> weakUpperCandidates = FindCandidates(
                packedRgba,
                mask,
                roiX0,
                roiX1,
                expandedY0,
                initialY0,
                faceCenterX,
                limits,
                0.65f);
            int requiredEvidence = Math.Max(
                3,
                limits.MinimumCandidateCount / 2);
            return weakUpperCandidates.Count >= requiredEvidence;
        }

        private static List<Candidate> FilterOutliers(
            List<Candidate> candidates,
            float maximumDeviation)
        {
            float[] ys = new float[candidates.Count];
            for (int index = 0; index < candidates.Count; index += 1)
            {
                ys[index] = candidates[index].Y;
            }
            Array.Sort(ys);
            float median = ys.Length % 2 == 1
                ? ys[ys.Length / 2]
                : (ys[ys.Length / 2 - 1] + ys[ys.Length / 2]) * 0.5f;

            List<Candidate> filtered =
                new List<Candidate>(candidates.Count);
            for (int index = 0; index < candidates.Count; index += 1)
            {
                if (Mathf.Abs(candidates[index].Y - median)
                    <= maximumDeviation)
                {
                    filtered.Add(candidates[index]);
                }
            }
            return filtered;
        }

        private static float WeightedMedianY(
            List<Candidate> sortedCandidates,
            float totalWeight)
        {
            float runningWeight = 0.0f;
            for (int index = 0; index < sortedCandidates.Count; index += 1)
            {
                runningWeight += sortedCandidates[index].Weight;
                if (runningWeight >= totalWeight * 0.5f)
                {
                    return sortedCandidates[index].Y;
                }
            }
            return sortedCandidates[sortedCandidates.Count - 1].Y;
        }

        private static float ComputePoseQuality(
            HairlineFaceReference face,
            HairlineEstimatorLimits limits)
        {
            float severity = Mathf.Max(
                Mathf.Abs(face.YawDegrees)
                    / Mathf.Max(limits.PoseYawLimitDegrees, 0.001f),
                Mathf.Max(
                    Mathf.Abs(face.PitchDegrees)
                        / Mathf.Max(limits.PosePitchLimitDegrees, 0.001f),
                    Mathf.Abs(face.RollDegrees)
                        / Mathf.Max(limits.PoseRollLimitDegrees, 0.001f)));
            return 1.0f - Mathf.Clamp01(severity);
        }

        private static Occupancy ComputeOccupancy(
            byte[] packedRgba,
            HairlineMaskReference mask,
            float roiX0,
            float roiX1,
            float roiY0,
            float roiY1,
            HairlineEstimatorLimits limits)
        {
            const int columns = 24;
            const int rows = 24;
            int sampled = 0;
            int skin = 0;
            int hairDominant = 0;
            int centralSampled = 0;
            int centralHairDominant = 0;
            float centralX0 = Mathf.Lerp(roiX0, roiX1, 0.25f);
            float centralX1 = Mathf.Lerp(roiX0, roiX1, 0.75f);

            for (int column = 0; column < columns; column += 1)
            {
                float x = Mathf.Lerp(
                    roiX0,
                    roiX1,
                    (column + 0.5f) / columns);
                bool central = x >= centralX0 && x <= centralX1;
                for (int row = 0; row < rows; row += 1)
                {
                    float y = Mathf.Lerp(
                        roiY0,
                        roiY1,
                        (row + 0.5f) / rows);
                    float faceSkin = SampleChannel(
                        packedRgba,
                        mask,
                        SkinChannelOffset,
                        x,
                        y);
                    float hair = SampleChannel(
                        packedRgba,
                        mask,
                        HairChannelOffset,
                        x,
                        y);
                    bool isHairDominant =
                        hair >= limits.OcclusionHairProbabilityMinimum
                        && hair
                            >= faceSkin
                                + limits.OcclusionHairDominanceMargin;
                    if (faceSkin >= 0.5f)
                    {
                        skin += 1;
                    }
                    if (isHairDominant)
                    {
                        hairDominant += 1;
                    }
                    sampled += 1;
                    if (central)
                    {
                        centralSampled += 1;
                        if (isHairDominant)
                        {
                            centralHairDominant += 1;
                        }
                    }
                }
            }

            return new Occupancy
            {
                SkinFraction = sampled > 0
                    ? skin / (float)sampled
                    : 0.0f,
                HairDominantFraction = sampled > 0
                    ? hairDominant / (float)sampled
                    : 0.0f,
                CentralHairDominantFraction = centralSampled > 0
                    ? centralHairDominant / (float)centralSampled
                    : 0.0f
            };
        }

        private static bool IsStrongLikelyOcclusion(
            Occupancy occupancy,
            float poseQuality,
            HairlineEstimatorLimits limits)
        {
            return poseQuality >= 0.35f
                && occupancy.HairDominantFraction
                    >= limits.StrongOcclusionHairFractionMinimum
                && occupancy.CentralHairDominantFraction
                    >= limits.StrongOcclusionCentralHairFractionMinimum
                && occupancy.SkinFraction
                    <= limits.StrongOcclusionSkinFractionMaximum;
        }

        private static float ComputeSkinFraction(
            byte[] packedRgba,
            HairlineMaskReference mask,
            float roiX0,
            float roiX1,
            float hairlineY,
            float roiY1)
        {
            if (roiY1 <= hairlineY)
            {
                return 0.0f;
            }

            const int columns = 32;
            const int rows = 32;
            int sampled = 0;
            int visible = 0;
            for (int column = 0; column < columns; column += 1)
            {
                float x = Mathf.Lerp(
                    roiX0,
                    roiX1,
                    (column + 0.5f) / columns);
                for (int row = 0; row < rows; row += 1)
                {
                    float y = Mathf.Lerp(
                        hairlineY,
                        roiY1,
                        (row + 0.5f) / rows);
                    if (SampleChannel(
                            packedRgba,
                            mask,
                            SkinChannelOffset,
                            x,
                            y)
                        > 0.5f)
                    {
                        visible += 1;
                    }
                    sampled += 1;
                }
            }
            return sampled > 0 ? visible / (float)sampled : 0.0f;
        }

        private static float AverageChannelRange(
            byte[] packedRgba,
            HairlineMaskReference mask,
            int channelOffset,
            float x,
            float y0,
            float y1)
        {
            float start = Mathf.Clamp01(Mathf.Min(y0, y1));
            float end = Mathf.Clamp01(Mathf.Max(y0, y1));
            int sampleCount = Math.Max(
                1,
                Mathf.CeilToInt(
                    (end - start)
                    * Math.Max(1, mask.ReferenceHeightPixels)));
            float sum = 0.0f;
            for (int index = 0; index < sampleCount; index += 1)
            {
                float y = Mathf.Lerp(
                    start,
                    end,
                    (index + 0.5f) / sampleCount);
                sum += SampleChannel(
                    packedRgba,
                    mask,
                    channelOffset,
                    x,
                    y);
            }
            return sum / sampleCount;
        }

        private static float SampleChannel(
            byte[] packedRgba,
            HairlineMaskReference mask,
            int channelOffset,
            float referenceX,
            float referenceY)
        {
            if (!mask.TryMapReferenceToMask(
                    new Vector2(referenceX, referenceY),
                    out Vector2 maskPoint))
            {
                return 0.0f;
            }

            float pixelX = Mathf.Clamp01(maskPoint.x) * (mask.MaskWidth - 1);
            float pixelY = Mathf.Clamp01(maskPoint.y) * (mask.MaskHeight - 1);
            int x0 = Mathf.FloorToInt(pixelX);
            int y0 = Mathf.FloorToInt(pixelY);
            int x1 = Math.Min(x0 + 1, mask.MaskWidth - 1);
            int y1 = Math.Min(y0 + 1, mask.MaskHeight - 1);
            float tx = pixelX - x0;
            float ty = pixelY - y0;

            float value00 = ReadChannel(
                packedRgba,
                mask.MaskWidth,
                x0,
                y0,
                channelOffset);
            float value10 = ReadChannel(
                packedRgba,
                mask.MaskWidth,
                x1,
                y0,
                channelOffset);
            float value01 = ReadChannel(
                packedRgba,
                mask.MaskWidth,
                x0,
                y1,
                channelOffset);
            float value11 = ReadChannel(
                packedRgba,
                mask.MaskWidth,
                x1,
                y1,
                channelOffset);
            return Mathf.Lerp(
                Mathf.Lerp(value00, value10, tx),
                Mathf.Lerp(value01, value11, tx),
                ty);
        }

        private static float ReadChannel(
            byte[] packedRgba,
            int width,
            int x,
            int y,
            int channelOffset)
        {
            int offset = (y * width + x) * 4 + channelOffset;
            return packedRgba[offset] / 255.0f;
        }

        private static HairlineDetectionResult Omitted(
            string advisory,
            string reason,
            HairlineMaskReference mask,
            int candidateCount = 0,
            Occupancy occupancy = null,
            bool usedExpandedRoi = false,
            float? diagnosticConfidence = null,
            float? boundaryStandardDeviationPixels = null,
            float? skinFraction = null)
        {
            return new HairlineDetectionResult(
                HairlineDetectionContract.OutcomeOmitted,
                advisory,
                null,
                diagnosticConfidence,
                candidateCount,
                boundaryStandardDeviationPixels,
                skinFraction
                    ?? (occupancy != null ? occupancy.SkinFraction : 0.0f),
                occupancy != null ? occupancy.HairDominantFraction : 0.0f,
                occupancy != null
                    ? occupancy.CentralHairDominantFraction
                    : 0.0f,
                usedExpandedRoi,
                reason,
                mask);
        }

        private static bool IsNormalized(Vector2 value)
        {
            return IsFinite(value.x)
                && IsFinite(value.y)
                && value.x >= 0.0f
                && value.x <= 1.0f
                && value.y >= 0.0f
                && value.y <= 1.0f;
        }

        private static bool IsFinite(float value)
        {
            return !float.IsNaN(value) && !float.IsInfinity(value);
        }
    }
}
