using NUnit.Framework;
using UnityEngine;

namespace Aura.Face3D.Tests
{
    public sealed class Face3DHeadPoseTests
    {
        private const float ToleranceDegrees = 0.05f;

        // The convention offset between the face basis and the camera basis for a
        // frontal face. ARFoundation/ARKit handedness makes this either identity or a
        // 180° yaw; the gate must behave correctly for both without being told which.
        private static readonly Quaternion[] FrontalConventions =
        {
            Quaternion.identity,
            Quaternion.Euler(0.0f, 180.0f, 0.0f),
        };

        [Test]
        public void FrontalFace_WithTiltedDevice_ReadsAsZeroDeviation(
            [ValueSource(nameof(FrontalConventions))] Quaternion convention)
        {
            // Regression: a handheld phone is rarely level, and the camera may point in
            // any heading. A head that faces the camera dead-on must read ~0 in every
            // axis regardless of device tilt or the platform's frontal convention.
            Quaternion camera = Quaternion.Euler(12.0f, 37.0f, 4.0f);
            Quaternion face = camera * convention;

            Vector3 pose = Face3DHeadPose.CameraRelativeEulerDegrees(camera, face);

            Assert.That(pose.x, Is.EqualTo(0.0f).Within(ToleranceDegrees));
            Assert.That(pose.y, Is.EqualTo(0.0f).Within(ToleranceDegrees));
            Assert.That(pose.z, Is.EqualTo(0.0f).Within(ToleranceDegrees));
        }

        [TestCase(10.0f, 0.0f, 0.0f)]
        [TestCase(0.0f, -8.0f, 0.0f)]
        [TestCase(0.0f, 0.0f, 6.0f)]
        [TestCase(-6.5f, 4.0f, -3.0f)]
        public void HeadDeviation_IsMeasuredRelativeToCamera(float pitch, float yaw, float roll)
        {
            foreach (Quaternion convention in FrontalConventions)
            {
                Quaternion camera = Quaternion.Euler(9.0f, -140.0f, 2.5f);
                Quaternion face = camera * convention * Quaternion.Euler(pitch, yaw, roll);

                Vector3 pose = Face3DHeadPose.CameraRelativeEulerDegrees(camera, face);

                Assert.That(pose.x, Is.EqualTo(pitch).Within(ToleranceDegrees), "pitch");
                Assert.That(pose.y, Is.EqualTo(yaw).Within(ToleranceDegrees), "yaw");
                Assert.That(pose.z, Is.EqualTo(roll).Within(ToleranceDegrees), "roll");
            }
        }

        [Test]
        public void TurnedHead_IsRejected_NotFoldedToFrontal(
            [ValueSource(nameof(FrontalConventions))] Quaternion convention)
        {
            // The 180° auto-resolution must not mask a real 25° head turn as frontal.
            Quaternion camera = Quaternion.Euler(5.0f, 80.0f, -3.0f);
            Quaternion face = camera * convention * Quaternion.Euler(0.0f, 25.0f, 0.0f);

            Vector3 pose = Face3DHeadPose.CameraRelativeEulerDegrees(camera, face);

            Assert.That(Mathf.Abs(pose.y), Is.EqualTo(25.0f).Within(ToleranceDegrees));
        }

        [Test]
        public void SessionSpaceEuler_WouldHaveBlockedTheSameFrontalFace()
        {
            // Documents the defect the camera-relative math fixes: raw session-space
            // euler angles for the identical frontal pose exceed the 5°/7° gate.
            Quaternion face = Quaternion.Euler(12.0f, 9.0f, 0.0f);

            Vector3 sessionSpace = Face3DHeadPose.NormalizeEulerDegrees(face.eulerAngles);

            Assert.That(Mathf.Abs(sessionSpace.x), Is.GreaterThan(7.0f));
            Assert.That(Mathf.Abs(sessionSpace.y), Is.GreaterThan(5.0f));
        }

        [TestCase(350.0f, -10.0f)]
        [TestCase(-190.0f, 170.0f)]
        [TestCase(180.0f, 180.0f)]
        [TestCase(-180.0f, 180.0f)]
        [TestCase(0.0f, 0.0f)]
        public void NormalizeAngle_WrapsIntoHalfOpenRange(float input, float expected)
        {
            Assert.That(
                Face3DHeadPose.NormalizeAngle(input),
                Is.EqualTo(expected).Within(ToleranceDegrees));
        }
    }
}
