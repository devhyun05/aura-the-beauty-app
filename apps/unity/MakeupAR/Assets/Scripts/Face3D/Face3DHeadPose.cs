using UnityEngine;

namespace Aura.Face3D
{
    /// <summary>
    /// Camera-relative head pose math for the frontal pose gate. ARKit face anchors
    /// arrive in session space, so their raw euler angles include device tilt and the
    /// session's initial heading; the gate must only measure how far the head deviates
    /// from facing the camera dead-on.
    /// </summary>
    public static class Face3DHeadPose
    {
        /// <summary>
        /// Deviation of the tracked face from a camera-frontal pose, in degrees within
        /// (-180, 180], expressed in the camera's own frame so device tilt and the AR
        /// session's initial heading are removed (only the head's turn/nod/tilt remains).
        ///
        /// ARKit only reports a tracked face when the camera sees the front of it, so the
        /// head is always facing the camera; the platform/handedness convention only
        /// decides whether that frontal orientation coincides with the camera basis (0°)
        /// or is flipped 180° about the camera's up axis. Rather than hard-code a guess at
        /// that convention — a 180° error would reject every frontal face — this resolves
        /// it from the data: it reports the deviation against whichever frontal reference
        /// (aligned or flipped) the face is actually closer to. A genuinely turned head
        /// still reports its true off-frontal angle, because the flip only removes a fixed
        /// 180° yaw, never the residual turn.
        /// </summary>
        public static Vector3 CameraRelativeEulerDegrees(
            Quaternion cameraRotation,
            Quaternion faceRotation)
        {
            Quaternion relative = Quaternion.Inverse(cameraRotation) * faceRotation;
            Quaternion flipped = Quaternion.Euler(0.0f, 180.0f, 0.0f) * relative;
            Quaternion frontal =
                Quaternion.Angle(Quaternion.identity, flipped)
                    < Quaternion.Angle(Quaternion.identity, relative)
                    ? flipped
                    : relative;
            return NormalizeEulerDegrees(frontal.eulerAngles);
        }

        public static Vector3 NormalizeEulerDegrees(Vector3 euler)
        {
            return new Vector3(
                NormalizeAngle(euler.x),
                NormalizeAngle(euler.y),
                NormalizeAngle(euler.z));
        }

        public static float NormalizeAngle(float angle)
        {
            float normalized = Mathf.Repeat(angle + 180.0f, 360.0f) - 180.0f;
            return Mathf.Approximately(normalized, -180.0f) ? 180.0f : normalized;
        }
    }
}
