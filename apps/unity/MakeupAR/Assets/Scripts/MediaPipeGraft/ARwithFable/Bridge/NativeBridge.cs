using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
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
        enum BootState
        {
            Booting,
            Ready,
            Failed,
        }

        BootState _bootState = BootState.Booting;
        string _bootErrorMessage;
        string _bootFailureStage;
        string _generation;

#if UNITY_IOS && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void sendMessageToMobileApp(string message);
#endif

        public static event Action<RNToUnityMessage> MessageReceived;

        void Awake()
        {
            EnsureBootGeneration();
            DontDestroyOnLoad(gameObject);
        }

        string EnsureBootGeneration()
        {
            if (string.IsNullOrEmpty(_generation)) _generation = Guid.NewGuid().ToString("N");
            return _generation;
        }

        /// <summary>
        /// ARBootstrap calls this only after every renderer and MakeupController has initialized.
        /// Ready is replayable because the first native event can precede RN emitter attachment.
        /// </summary>
        public void MarkReady()
        {
            if (_bootState == BootState.Failed) return;
            _bootState = BootState.Ready;
            SendBootStatus();
        }

        /// <summary>
        /// Keeps the bridge alive and makes a bootstrap exception visible (and replayable) to RN.
        /// </summary>
        public void ReportBootFailure(string stage, Exception exception)
        {
            _bootState = BootState.Failed;
            var safeStage = string.IsNullOrEmpty(stage) ? "unknown" : stage;
            _bootFailureStage = safeStage;
            var detail = exception != null && !string.IsNullOrEmpty(exception.Message)
                ? exception.Message
                : "unknown error";
            _bootErrorMessage = $"Unity 초기화 실패 ({safeStage}): {detail}";
            SendBootStatus();
        }

        // AURA's warm-host adapter still invokes this UnitySendMessage method on mount.
        // Replay the current boot state instead of manufacturing readiness.
        public void SendReady(string ignored)
        {
            SendBootStatus();
        }

        // Compatibility hook used by AuraStencilHost when the warm runtime is reactivated.
        // The richer requestReady path remains the source of boot-state truth.
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
                // JsonUtility의 wire 기본값(생략 필드=0/null)을 그대로 보존한다. FilterParams
                // initializer로 overwrite하면 구 payload의 생략 필드까지 새 기본값으로 바뀐다.
                var probe = JsonUtility.FromJson<RNToUnityMessage>(json);
                msg = probe;
                if (!RestoreFilterPayload(json, msg)) return;
                RestoreMissingEyeshadowTextureSentinels(json, msg);
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[NativeBridge] Failed to parse message '{json}': {e.Message}");
                SendFilterPayloadError();
                return;
            }

            if (msg == null || string.IsNullOrEmpty(msg.type)) return;

            if (msg.type == "requestReady")
            {
                SendBootStatus();
                return;
            }

            // RN resends the complete look after ready. Dropping early application commands is safer
            // than partially applying them while renderers/controller are not initialized.
            if (_bootState != BootState.Ready)
            {
                SendBootStatus();
                return;
            }

            MessageReceived?.Invoke(msg);
        }

        void SendBootStatus()
        {
            Send(BuildBootStatus());
        }

        UnityToRNMessage BuildBootStatus()
        {
            var generation = EnsureBootGeneration();
            switch (_bootState)
            {
                case BootState.Ready:
                    return new UnityToRNMessage { type = "ready", generation = generation };
                case BootState.Failed:
                    return new UnityToRNMessage
                    {
                        type = "error",
                        message = _bootErrorMessage,
                        generation = generation,
                        fatal = true,
                        code = "unity_boot_failed",
                        stage = _bootFailureStage,
                    };
                default:
                    return new UnityToRNMessage
                    {
                        type = "booting",
                        message = "Unity 메이크업 엔진을 준비하고 있어요.",
                        generation = generation,
                    };
            }
        }

        // top-level wire presence로 filter 누락/null/비객체를 먼저 구분한다. 실제 object는
        // wire 0/null 및 texture -1 sentinel 기본 인스턴스에 overwrite해 명시 필드만 바꾼다.
        static bool RestoreFilterPayload(string json, RNToUnityMessage msg)
        {
            if (msg == null) return true;
            if (!TryGetTopLevelJsonValue(json, "filter", out var filterJson) ||
                filterJson == "null")
            {
                msg.filter = null;
                return true;
            }

            if (filterJson[0] != '{')
            {
                msg.filter = null;
                if (msg.type != "applyFilter") return true;

                Debug.LogWarning("[NativeBridge] applyFilter.filter must be a JSON object or null.");
                SendFilterPayloadError();
                return false;
            }

            // public DTO + JsonUtility overwrite만 사용하므로 IL2CPP/AOT 안전하다.
            var filter = FilterParams.CreateWireDefaults();
            JsonUtility.FromJsonOverwrite(filterJson, filter);
            // JsonUtility는 기존 null 배열에 명시 null을 overwrite하면 빈 배열로 바꾸기도 한다.
            // wire의 null/[] 의미를 보존해 expert override reset 계약이 흐려지지 않게 한다.
            if (TryGetTopLevelJsonValue(filterJson, "expertOverrides", out var expertOverridesJson) &&
                expertOverridesJson == "null")
                filter.expertOverrides = null;
            msg.filter = filter;

            RestoreMissingTextureSentinel(filterJson, "toneTexture", ref filter.toneTexture);
            RestoreMissingTextureSentinel(filterJson, "skinTexture", ref filter.skinTexture);
            RestoreMissingTextureSentinel(filterJson, "concealerTexture", ref filter.concealerTexture);
            RestoreMissingTextureSentinel(filterJson, "powderTexture", ref filter.powderTexture);
            RestoreMissingTextureSentinel(filterJson, "blushTexture", ref filter.blushTexture);
            RestoreMissingTextureSentinel(filterJson, "highlightTexture", ref filter.highlightTexture);
            RestoreMissingTextureSentinel(filterJson, "contourTexture", ref filter.contourTexture);
            RestoreMissingTextureSentinel(filterJson, "eyeshadowTexture", ref filter.eyeshadowTexture);
            RestoreMissingTextureSentinel(filterJson, "eyeshadowLowerTexture", ref filter.eyeshadowLowerTexture);
            RestoreMissingTextureSentinel(filterJson, "aegyoTexture", ref filter.aegyoTexture);
            RestoreMissingTextureSentinel(filterJson, "triangleZoneTexture", ref filter.triangleZoneTexture);
            RestoreMissingTextureSentinel(filterJson, "browConcealTexture", ref filter.browConcealTexture);
            RestoreMissingTextureSentinel(filterJson, "browTexture", ref filter.browTexture);
            RestoreMissingTextureSentinel(filterJson, "browPencilTexture", ref filter.browPencilTexture);
            RestoreMissingTextureSentinel(filterJson, "browLightenerTexture", ref filter.browLightenerTexture);
            RestoreMissingTextureSentinel(filterJson, "browStyleTexture", ref filter.browStyleTexture);
            RestoreMissingTextureSentinel(filterJson, "lipBaseTexture", ref filter.lipBaseTexture);
            RestoreMissingTextureSentinel(filterJson, "lipLinerTexture", ref filter.lipLinerTexture);
            RestoreMissingTextureSentinel(filterJson, "lipGlossTexture", ref filter.lipGlossTexture);
            RestoreMissingTextureSentinel(filterJson, "eyelinerLowerTexture", ref filter.eyelinerLowerTexture);
            return true;
        }

        static void SendFilterPayloadError()
        {
            Send(new UnityToRNMessage
            {
                type = "error",
                message = "메이크업 설정을 적용하지 못했어요. 다시 선택해 주세요.",
            });
        }

        static void RestoreMissingTextureSentinel(string objectJson, string fieldName, ref int value)
        {
            if (!HasTopLevelJsonKey(objectJson, fieldName)) value = -1;
        }

        static bool TryGetTopLevelJsonValue(string json, string fieldName, out string valueJson)
        {
            valueJson = null;
            var cursor = 0;
            SkipWhitespace(json, ref cursor);
            if (cursor >= json.Length || json[cursor++] != '{') return false;

            while (cursor < json.Length)
            {
                SkipWhitespace(json, ref cursor);
                if (cursor >= json.Length || json[cursor] == '}') return false;
                if (!TryReadJsonString(json, ref cursor, out var key)) return false;
                SkipWhitespace(json, ref cursor);
                if (cursor >= json.Length || json[cursor++] != ':') return false;
                SkipWhitespace(json, ref cursor);
                var valueStart = cursor;
                if (!TrySkipJsonValue(json, ref cursor)) return false;
                if (key == fieldName)
                {
                    valueJson = json.Substring(valueStart, cursor - valueStart);
                    return true;
                }
                SkipWhitespace(json, ref cursor);
                if (cursor < json.Length && json[cursor] == ',') { cursor++; continue; }
                if (cursor < json.Length && json[cursor] == '}') return false;
                return false;
            }
            return false;
        }

        static bool HasTopLevelJsonKey(string objectJson, string fieldName)
        {
            return TryGetTopLevelJsonValue(objectJson, fieldName, out _);
        }

        static void SkipWhitespace(string json, ref int cursor)
        {
            while (cursor < json.Length && char.IsWhiteSpace(json[cursor])) cursor++;
        }

        static bool TryReadJsonString(string json, ref int cursor, out string value)
        {
            value = null;
            if (cursor >= json.Length || json[cursor++] != '"') return false;
            var start = cursor;
            var escaped = false;
            while (cursor < json.Length)
            {
                var ch = json[cursor];
                if (escaped) escaped = false;
                else if (ch == '\\') escaped = true;
                else if (ch == '"')
                {
                    value = json.Substring(start, cursor - start);
                    cursor++;
                    return true;
                }
                cursor++;
            }
            return false;
        }

        static bool TrySkipJsonValue(string json, ref int cursor)
        {
            if (cursor >= json.Length) return false;
            if (json[cursor] == '"') return TryReadJsonString(json, ref cursor, out _);
            if (json[cursor] != '{' && json[cursor] != '[')
            {
                var start = cursor;
                while (cursor < json.Length && json[cursor] != ',' &&
                       json[cursor] != '}' && json[cursor] != ']') cursor++;
                while (cursor > start && char.IsWhiteSpace(json[cursor - 1])) cursor--;
                return cursor > start;
            }

            var depth = 0;
            while (cursor < json.Length)
            {
                var ch = json[cursor];
                if (ch == '"')
                {
                    if (!TryReadJsonString(json, ref cursor, out _)) return false;
                    continue;
                }
                cursor++;
                if (ch == '{' || ch == '[') depth++;
                else if ((ch == '}' || ch == ']') && --depth == 0) return true;
            }
            return false;
        }

        static bool TryReadJsonArrayElements(string arrayJson, out List<string> elements)
        {
            elements = new List<string>();
            var cursor = 0;
            SkipWhitespace(arrayJson, ref cursor);
            if (cursor >= arrayJson.Length || arrayJson[cursor++] != '[') return false;
            SkipWhitespace(arrayJson, ref cursor);
            if (cursor < arrayJson.Length && arrayJson[cursor] == ']') return true;

            while (cursor < arrayJson.Length)
            {
                SkipWhitespace(arrayJson, ref cursor);
                var valueStart = cursor;
                if (!TrySkipJsonValue(arrayJson, ref cursor)) return false;
                elements.Add(arrayJson.Substring(valueStart, cursor - valueStart));
                SkipWhitespace(arrayJson, ref cursor);
                if (cursor >= arrayJson.Length) return false;
                if (arrayJson[cursor] == ']') return true;
                if (arrayJson[cursor++] != ',') return false;
            }
            return false;
        }

        // wire 배열을 구조적으로 다시 순회해 모든 JSON 원소가 정확히 한 슬롯을 소비하게 한다.
        // 실제 object는 schema initializer가 적용된 DTO에 overwrite한다. 따라서 생략 필드는
        // height=1/texture=-1/materialStrength=.85 등 V2 기본값을 유지하고, JSON에 명시된 0은
        // overwrite되어 그대로 보존된다. 값 자체로 누락 여부를 추측하면 explicit zero가 깨진다.
        static void RestoreMissingEyeshadowTextureSentinels(string json, RNToUnityMessage msg)
        {
            if (msg == null) return;
            if (!TryGetTopLevelJsonValue(json, "eyeshadowLayers", out var layersJson) ||
                layersJson.Length == 0 || layersJson[0] != '[') return;
            if (!TryReadJsonArrayElements(layersJson, out var layerValues)) return;

            var restored = new EyeshadowLayerParams[layerValues.Count];
            for (var layerIndex = 0; layerIndex < layerValues.Count; layerIndex++)
            {
                var layerJson = layerValues[layerIndex];
                if (layerJson.Length == 0 || layerJson[0] != '{') continue;

                var layer = new EyeshadowLayerParams();
                JsonUtility.FromJsonOverwrite(layerJson, layer);
                RestoreMissingTextureSentinel(layerJson, "texture", ref layer.texture);
                restored[layerIndex] = layer;
            }
            msg.eyeshadowLayers = restored;
        }

        public static void Send(UnityToRNMessage msg)
        {
            var json = SerializeForWire(msg);
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

        /// <summary>
        /// JsonUtility는 float[][]를 지원하지 않아 W5 outline만 전용 deterministic wire를 쓴다.
        /// outlines가 없으면 기존 JsonUtility 결과를 그대로 반환해 모든 레거시 메시지를 보존한다.
        /// </summary>
        public static string SerializeForWire(UnityToRNMessage msg)
        {
            if (msg == null || msg.type != "fitHandles" || msg.outlines == null || msg.outlines.Length == 0)
                return JsonUtility.ToJson(msg);

            var json = new StringBuilder(2048);
            json.Append("{\"type\":\"").Append(EscapeJson(msg.type)).Append("\",\"handles\":[");
            var handles = msg.handles ?? Array.Empty<FitHandle>();
            for (var i = 0; i < handles.Length; i++)
            {
                if (i > 0) json.Append(',');
                var handle = handles[i];
                json.Append("{\"key\":\"").Append(EscapeJson(handle?.key ?? ""))
                    .Append("\",\"x\":").Append(WireFloat(handle != null ? handle.x : 0f, true))
                    .Append(",\"y\":").Append(WireFloat(handle != null ? handle.y : 0f, true))
                    .Append('}');
            }
            json.Append("],\"eyeVp\":").Append(WireFloat(msg.eyeVp, false))
                .Append(",\"sessionId\":").Append(msg.sessionId)
                .Append(",\"outlines\":[");

            var emitted = 0;
            var totalPoints = 0;
            for (var i = 0; i < msg.outlines.Length && emitted < 12 && totalPoints < 96; i++)
            {
                var outline = msg.outlines[i];
                var available = outline?.points?.Length / 2 ?? 0;
                var count = Mathf.Min(12, available, 96 - totalPoints);
                if (string.IsNullOrEmpty(outline?.region) || count < 8) continue;
                if (emitted++ > 0) json.Append(',');
                json.Append("{\"region\":\"").Append(EscapeJson(outline.region)).Append("\",\"points\":[");
                for (var p = 0; p < count; p++)
                {
                    if (p > 0) json.Append(',');
                    json.Append('[')
                        .Append(WireFloat(outline.points[p * 2], true)).Append(',')
                        .Append(WireFloat(outline.points[p * 2 + 1], true)).Append(']');
                }
                json.Append("]}");
                totalPoints += count;
            }
            json.Append("]}");
            return json.ToString();
        }

        static string WireFloat(float value, bool viewport)
        {
            if (float.IsNaN(value) || float.IsInfinity(value)) value = 0f;
            if (viewport) value = Mathf.Clamp01(value);
            return value.ToString("R", CultureInfo.InvariantCulture);
        }

        static string EscapeJson(string value)
        {
            if (string.IsNullOrEmpty(value)) return "";
            var escaped = new StringBuilder(value.Length + 8);
            foreach (var c in value)
            {
                switch (c)
                {
                    case '\"': escaped.Append("\\\""); break;
                    case '\\': escaped.Append("\\\\"); break;
                    case '\b': escaped.Append("\\b"); break;
                    case '\f': escaped.Append("\\f"); break;
                    case '\n': escaped.Append("\\n"); break;
                    case '\r': escaped.Append("\\r"); break;
                    case '\t': escaped.Append("\\t"); break;
                    default:
                        if (c < 0x20) escaped.Append("\\u").Append(((int)c).ToString("x4"));
                        else escaped.Append(c);
                        break;
                }
            }
            return escaped.ToString();
        }
    }
}
