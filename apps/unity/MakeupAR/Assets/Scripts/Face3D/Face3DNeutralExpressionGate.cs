using System;
using System.Collections.Generic;
using UnityEngine;

namespace Aura.Face3D
{
    /// <summary>
    /// G2 neutral-expression gate. ARFoundation-independent: the caller reads ARKit
    /// blend-shape coefficients and passes them in as a name→activation map, so this
    /// stays inside the pure Aura.Face3D module and is fully unit-testable.
    ///
    /// The 5 MVP metrics assume a template-fit surface at rest. A smile, an open jaw, or
    /// raised brows deform the mesh and bias the projections, so distorting frames must be
    /// rejected before aggregation. The gate is deliberately fail-open: if no expression
    /// signals are available (older device, blend shapes off), it does NOT block — a
    /// missing signal must never turn the working G1 extraction back into 0/30.
    /// </summary>
    public enum Face3DExpressionGateStatus
    {
        Neutral,
        NonNeutral,
        SignalsUnavailable
    }

    public sealed class Face3DExpressionGateResult
    {
        public Face3DExpressionGateResult(
            Face3DExpressionGateStatus status,
            string dominantSignal,
            float dominantActivation)
        {
            Status = status;
            DominantSignal = dominantSignal ?? string.Empty;
            DominantActivation = Face3DNumeric.IsFinite(dominantActivation)
                ? Mathf.Clamp01(dominantActivation)
                : 0.0f;
        }

        public Face3DExpressionGateStatus Status { get; private set; }
        public string DominantSignal { get; private set; }
        public float DominantActivation { get; private set; }
    }

    /// <summary>
    /// Signal names the controller maps ARKit blend-shape locations onto. Kept as
    /// constants so the gate, thresholds, and controller mapping never drift apart.
    /// </summary>
    public static class Face3DExpressionSignal
    {
        public const string JawOpen = "jawOpen";
        public const string MouthSmile = "mouthSmile";
        public const string MouthFrown = "mouthFrown";
        public const string MouthPucker = "mouthPucker";
        public const string MouthClose = "mouthClose";
        public const string BrowInnerUp = "browInnerUp";
        public const string BrowDown = "browDown";
        public const string CheekPuff = "cheekPuff";
    }

    public sealed class Face3DExpressionGatePolicy
    {
        // Conservative default: only a clear expression (roughly half activation) blocks a
        // frame, so a relaxed resting face with a slightly parted mouth still passes. Tune
        // against real-device blend shapes before tightening (G2 device evidence).
        public const float ProvisionalMaxActivation = 0.5f;

        private readonly float defaultMaxActivation;
        private readonly Dictionary<string, float> perSignalMaxActivation;

        public Face3DExpressionGatePolicy(
            float defaultMaxActivation = ProvisionalMaxActivation,
            IReadOnlyDictionary<string, float> perSignalMaxActivation = null)
        {
            if (!Face3DNumeric.IsFinite(defaultMaxActivation)
                || defaultMaxActivation <= 0.0f
                || defaultMaxActivation > 1.0f)
            {
                throw new ArgumentOutOfRangeException(nameof(defaultMaxActivation));
            }

            this.defaultMaxActivation = defaultMaxActivation;
            this.perSignalMaxActivation = new Dictionary<string, float>(StringComparer.Ordinal);
            if (perSignalMaxActivation != null)
            {
                foreach (KeyValuePair<string, float> entry in perSignalMaxActivation)
                {
                    if (!string.IsNullOrWhiteSpace(entry.Key)
                        && Face3DNumeric.IsFinite(entry.Value)
                        && entry.Value > 0.0f
                        && entry.Value <= 1.0f)
                    {
                        this.perSignalMaxActivation[entry.Key.Trim()] = entry.Value;
                    }
                }
            }
        }

        public float MaxActivationFor(string signal)
        {
            if (!string.IsNullOrWhiteSpace(signal)
                && perSignalMaxActivation.TryGetValue(signal.Trim(), out float value))
            {
                return value;
            }

            return defaultMaxActivation;
        }
    }

    public static class Face3DNeutralExpressionGate
    {
        /// <summary>
        /// Evaluates whether the frame's expression is neutral enough to measure. Returns
        /// SignalsUnavailable (treated as pass by the caller) when no finite signal is
        /// present, so an unsupported device cannot block extraction.
        /// </summary>
        public static Face3DExpressionGateResult Evaluate(
            IReadOnlyDictionary<string, float> signals,
            Face3DExpressionGatePolicy policy)
        {
            Face3DExpressionGatePolicy resolvedPolicy = policy ?? new Face3DExpressionGatePolicy();
            if (signals == null || signals.Count == 0)
            {
                return new Face3DExpressionGateResult(
                    Face3DExpressionGateStatus.SignalsUnavailable,
                    string.Empty,
                    0.0f);
            }

            bool sawFiniteSignal = false;
            string dominantSignal = string.Empty;
            float dominantActivation = 0.0f;
            bool nonNeutral = false;

            foreach (KeyValuePair<string, float> entry in signals)
            {
                if (string.IsNullOrWhiteSpace(entry.Key)
                    || !Face3DNumeric.IsFinite(entry.Value))
                {
                    continue;
                }

                sawFiniteSignal = true;
                float activation = Mathf.Clamp01(entry.Value);
                float threshold = resolvedPolicy.MaxActivationFor(entry.Key);

                // Track the single most-activated signal for diagnostics regardless of pass/fail.
                if (activation > dominantActivation)
                {
                    dominantActivation = activation;
                    dominantSignal = entry.Key.Trim();
                }

                if (activation > threshold)
                {
                    nonNeutral = true;
                }
            }

            if (!sawFiniteSignal)
            {
                return new Face3DExpressionGateResult(
                    Face3DExpressionGateStatus.SignalsUnavailable,
                    string.Empty,
                    0.0f);
            }

            return new Face3DExpressionGateResult(
                nonNeutral
                    ? Face3DExpressionGateStatus.NonNeutral
                    : Face3DExpressionGateStatus.Neutral,
                dominantSignal,
                dominantActivation);
        }
    }
}
