using NUnit.Framework;

namespace Aura.Face3D.Tests
{
    public sealed class Face3DSensorProvenanceTests
    {
        [Test]
        public void AcceptedSamplesProduceIndependentDepthObservationRatio()
        {
            Face3DSensorProvenanceAccumulator accumulator =
                new Face3DSensorProvenanceAccumulator();

            Assert.That(
                accumulator.TryAdd(true, true, true, "iPhone15,3"),
                Is.True);
            Assert.That(
                accumulator.TryAdd(true, false, true, "iPhone15,3"),
                Is.True);
            Assert.That(
                accumulator.TryBuild(out Face3DSensorProvenance provenance),
                Is.True);
            Assert.That(provenance.TrueDepthHardware, Is.True);
            Assert.That(provenance.FaceTrackingSupported, Is.True);
            Assert.That(provenance.DeviceModel, Is.EqualTo("iPhone15,3"));
            Assert.That(provenance.DepthDataObservedRatio, Is.EqualTo(0.5f));
        }

        [Test]
        public void DepthWithoutTrueDepthHardwareFailsClosed()
        {
            Face3DSensorProvenanceAccumulator accumulator =
                new Face3DSensorProvenanceAccumulator();

            Assert.That(
                accumulator.TryAdd(false, true, true, "iPhone14,7"),
                Is.False);
            Assert.That(
                accumulator.TryBuild(out _),
                Is.False);
        }

        [Test]
        public void HardwareOrDeviceChangesFailClosed()
        {
            Face3DSensorProvenanceAccumulator accumulator =
                new Face3DSensorProvenanceAccumulator();

            Assert.That(
                accumulator.TryAdd(true, true, true, "iPhone15,3"),
                Is.True);
            Assert.That(
                accumulator.TryAdd(true, true, true, "iPhone16,1"),
                Is.False);
            Assert.That(
                accumulator.TryBuild(out _),
                Is.False);
        }
    }
}
