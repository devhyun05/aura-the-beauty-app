using NUnit.Framework;

namespace Aura.Face3D.Tests
{
    /// <summary>
    /// G5 local contract: the tracking-face gate must classify a second tracked face as
    /// Multiple so the session controller blocks collection. Device evidence (two real
    /// people actually blocked) is recorded separately in FACE3D_GATE_STATUS.json.
    /// </summary>
    public sealed class Face3DMultipleFaceGateTests
    {
        [TestCase(2)]
        [TestCase(3)]
        [TestCase(7)]
        public void TwoOrMoreTrackingFaces_ClassifyAsMultiple(int trackingFaceCount)
        {
            Assert.That(
                Face3DTrackingFaceGate.Evaluate(trackingFaceCount),
                Is.EqualTo(Face3DTrackingFaceGateStatus.Multiple));
        }

        [Test]
        public void ExactlyOneTrackingFace_IsReady()
        {
            Assert.That(
                Face3DTrackingFaceGate.Evaluate(1),
                Is.EqualTo(Face3DTrackingFaceGateStatus.Ready));
        }

        [TestCase(0)]
        [TestCase(-1)]
        public void NoTrackingFace_IsMissing_NotReadyNotMultiple(int trackingFaceCount)
        {
            Face3DTrackingFaceGateStatus status = Face3DTrackingFaceGate.Evaluate(trackingFaceCount);

            Assert.That(status, Is.EqualTo(Face3DTrackingFaceGateStatus.Missing));
            Assert.That(status, Is.Not.EqualTo(Face3DTrackingFaceGateStatus.Ready));
        }

        [Test]
        public void OnlyReadyStatusIsCollectible()
        {
            // Encodes the controller's admission rule: collection proceeds only when the
            // gate is Ready. Missing and Multiple must both keep the session out of
            // collection so a second person can never be silently measured.
            Assert.That(Face3DTrackingFaceGate.Evaluate(1), Is.EqualTo(Face3DTrackingFaceGateStatus.Ready));
            Assert.That(Face3DTrackingFaceGate.Evaluate(0), Is.Not.EqualTo(Face3DTrackingFaceGateStatus.Ready));
            Assert.That(Face3DTrackingFaceGate.Evaluate(2), Is.Not.EqualTo(Face3DTrackingFaceGateStatus.Ready));
        }
    }
}
