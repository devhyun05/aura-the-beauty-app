using System.Collections.Generic;
using NUnit.Framework;

namespace Aura.Face3D.Tests
{
    public sealed class Face3DNeutralExpressionGateTests
    {
        private static Dictionary<string, float> Signals(params (string, float)[] entries)
        {
            Dictionary<string, float> map = new Dictionary<string, float>();
            foreach ((string name, float value) in entries)
            {
                map[name] = value;
            }

            return map;
        }

        [Test]
        public void RestingFace_PassesAsNeutral()
        {
            Dictionary<string, float> signals = Signals(
                (Face3DExpressionSignal.JawOpen, 0.04f),
                (Face3DExpressionSignal.MouthSmile, 0.06f),
                (Face3DExpressionSignal.MouthFrown, 0.02f),
                (Face3DExpressionSignal.BrowInnerUp, 0.05f),
                (Face3DExpressionSignal.CheekPuff, 0.0f));

            Face3DExpressionGateResult result = Face3DNeutralExpressionGate.Evaluate(
                signals,
                new Face3DExpressionGatePolicy());

            Assert.That(result.Status, Is.EqualTo(Face3DExpressionGateStatus.Neutral));
        }

        [Test]
        public void OpenJaw_IsRejectedAsNonNeutral()
        {
            Dictionary<string, float> signals = Signals(
                (Face3DExpressionSignal.JawOpen, 0.72f),
                (Face3DExpressionSignal.MouthSmile, 0.03f));

            Face3DExpressionGateResult result = Face3DNeutralExpressionGate.Evaluate(
                signals,
                new Face3DExpressionGatePolicy());

            Assert.That(result.Status, Is.EqualTo(Face3DExpressionGateStatus.NonNeutral));
            Assert.That(result.DominantSignal, Is.EqualTo(Face3DExpressionSignal.JawOpen));
            Assert.That(result.DominantActivation, Is.EqualTo(0.72f).Within(0.001f));
        }

        [Test]
        public void Smile_IsRejectedAsNonNeutral()
        {
            Dictionary<string, float> signals = Signals(
                (Face3DExpressionSignal.MouthSmile, 0.61f),
                (Face3DExpressionSignal.JawOpen, 0.05f));

            Face3DExpressionGateResult result = Face3DNeutralExpressionGate.Evaluate(
                signals,
                new Face3DExpressionGatePolicy());

            Assert.That(result.Status, Is.EqualTo(Face3DExpressionGateStatus.NonNeutral));
            Assert.That(result.DominantSignal, Is.EqualTo(Face3DExpressionSignal.MouthSmile));
        }

        [Test]
        public void NoSignals_ReportsUnavailable_SoCallerCanFailOpen()
        {
            Face3DExpressionGateResult empty = Face3DNeutralExpressionGate.Evaluate(
                new Dictionary<string, float>(),
                new Face3DExpressionGatePolicy());
            Face3DExpressionGateResult nullSignals = Face3DNeutralExpressionGate.Evaluate(
                null,
                new Face3DExpressionGatePolicy());

            Assert.That(empty.Status, Is.EqualTo(Face3DExpressionGateStatus.SignalsUnavailable));
            Assert.That(nullSignals.Status, Is.EqualTo(Face3DExpressionGateStatus.SignalsUnavailable));
        }

        [Test]
        public void NonFiniteSignalsOnly_ReportsUnavailable()
        {
            Dictionary<string, float> signals = Signals(
                (Face3DExpressionSignal.JawOpen, float.NaN),
                (Face3DExpressionSignal.MouthSmile, float.PositiveInfinity));

            Face3DExpressionGateResult result = Face3DNeutralExpressionGate.Evaluate(
                signals,
                new Face3DExpressionGatePolicy());

            Assert.That(result.Status, Is.EqualTo(Face3DExpressionGateStatus.SignalsUnavailable));
        }

        [Test]
        public void PerSignalThreshold_OverridesDefault()
        {
            // A stricter jawOpen budget rejects a frame the default would have allowed.
            Dictionary<string, float> perSignal = new Dictionary<string, float>
            {
                { Face3DExpressionSignal.JawOpen, 0.2f },
            };
            Dictionary<string, float> signals = Signals((Face3DExpressionSignal.JawOpen, 0.35f));

            Face3DExpressionGateResult strict = Face3DNeutralExpressionGate.Evaluate(
                signals,
                new Face3DExpressionGatePolicy(0.5f, perSignal));
            Face3DExpressionGateResult lenient = Face3DNeutralExpressionGate.Evaluate(
                signals,
                new Face3DExpressionGatePolicy(0.5f));

            Assert.That(strict.Status, Is.EqualTo(Face3DExpressionGateStatus.NonNeutral));
            Assert.That(lenient.Status, Is.EqualTo(Face3DExpressionGateStatus.Neutral));
        }

        [Test]
        public void ActivationAtThreshold_IsStillNeutral()
        {
            Dictionary<string, float> signals = Signals((Face3DExpressionSignal.JawOpen, 0.5f));

            Face3DExpressionGateResult result = Face3DNeutralExpressionGate.Evaluate(
                signals,
                new Face3DExpressionGatePolicy(0.5f));

            Assert.That(result.Status, Is.EqualTo(Face3DExpressionGateStatus.Neutral));
        }
    }
}
