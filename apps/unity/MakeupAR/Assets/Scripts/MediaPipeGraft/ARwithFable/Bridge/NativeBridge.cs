using System;
using System.Runtime.InteropServices;
using UnityEngine;

namespace ARMakeup.Bridge
{
    /// <summary>
    /// RN ↔ Unity message hub.
    /// The GameObject name must stay "NativeBridge": React Native delivers messages with
    /// unityRef.current.postMessage('NativeBridge', 'OnMessageFromRN', json).
    /// </summary>
    public class NativeBridge : MonoBehaviour
    {
#if UNITY_IOS && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void sendMessageToMobileApp(string message);
#endif

        public static event Action<RNToUnityMessage> MessageReceived;

        void Awake()
        {
            DontDestroyOnLoad(gameObject);
        }

        void Start()
        {
            SendReady();
        }

        // Warm Unity preload can finish before the React screen subscribes to
        // native events. The host adapter calls this method on every mount so
        // the original RN resyncAll() handshake is never lost.
        public void SendReady(string ignored)
        {
            SendReady();
        }

        public static void SendReady()
        {
            Send(new UnityToRNMessage { type = "ready" });
        }

        // Invoked by React Native via UnitySendMessage.
        public void OnMessageFromRN(string json)
        {
            if (string.IsNullOrEmpty(json)) return;

            RNToUnityMessage msg;
            try
            {
                msg = JsonUtility.FromJson<RNToUnityMessage>(json);
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[NativeBridge] Failed to parse message '{json}': {e.Message}");
                return;
            }

            if (msg == null || string.IsNullOrEmpty(msg.type)) return;
            MessageReceived?.Invoke(msg);
        }

        public static void Send(UnityToRNMessage msg)
        {
            var json = JsonUtility.ToJson(msg);
#if UNITY_ANDROID && !UNITY_EDITOR
            using (var jc = new AndroidJavaClass("com.azesmwayreactnativeunity.ReactNativeUnityViewManager"))
            {
                jc.CallStatic("sendMessageToMobileApp", json);
            }
#elif UNITY_IOS && !UNITY_EDITOR
            sendMessageToMobileApp(json);
#else
            Debug.Log($"[NativeBridge] → RN: {json}");
#endif
        }
    }
}
