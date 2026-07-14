using System;
using Unity.Collections;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

namespace ARMakeup.Face
{
    /// <summary>
    /// ARKit blendshape 계수(0..1)를 정적 프로퍼티로 노출하는 소스.
    /// 예정 소비자(배선은 별도 트랙): 치아 미백의 입 벌림 게이트 보조(JawOpen),
    /// 윙크 이벤트(EyeBlinkL/R 비대칭), 표정 반응 이펙트(MouthSmileL/R, BrowInnerUp).
    ///
    /// API 경로 (AR Foundation 6.4): 크로스플랫폼 XRFaceSubsystem.TryGetBlendShapes
    /// (ARKit 플러그인 6.3+에서 ARKitFaceSubsystem.GetBlendShapeCoefficients를 대체).
    /// Unity.XR.ARKit 어셈블리 참조 없이 동작한다 — ARMakeup.Runtime.asmdef가 ARKit
    /// 어셈블리를 참조하지 않으므로(iOS 전용 어셈블리 참조는 Android 빌드를 조건부
    /// 컴파일 지옥으로 만든다), blendShapeId는 아래 서수 상수로 해석한다.
    ///
    /// ── 활성 조건과 자동 비활성 근거 ──
    /// ARFaceManager가 씬에 있어야 XRFaceSubsystem이 생성·기동된다(SubsystemLifecycle).
    ///  - 비MEDIAPIPE 폴백: ARBootstrap이 ARFaceManager를 만든다 → 여기서 계수 접근 가능.
    ///  - MEDIAPIPE 주경로: ARFaceManager를 만들지 않는다(캐노니컬 478 토폴로지 사용).
    ///    전면 카메라면 ARKit 세션이 어차피 ARFaceTrackingConfiguration으로 돌 공산이
    ///    크지만(전면을 지원하는 네이티브 구성이 그것뿐), face 서브시스템 자체가
    ///    미기동이라 계수를 얻을 수 없다. 여기서 몰래 ARFaceManager를 만들면
    ///    ① FaceTracking 피처 요청이 세션 구성 다수결(DefaultConfigurationChooser)에
    ///    끼어들어 주경로의 카메라 구성을 흔들 수 있고 ② 얼굴마다 facePrefab 복제 등
    ///    부작용이 있다 → ARFaceManager 부재 시 자동 비활성이 정답.
    ///  - ARCore(Android 폴백): XRFaceSubsystemDescriptor.supportsBlendShapes=false →
    ///    디스크립터 게이트로 영구 비활성(ARKit만 true).
    ///
    /// ── 좌/우 규약 ──
    /// ARKit 계수의 Left/Right는 피사체 해부학 기준(EyeBlinkLeft = 피사체의 왼눈).
    /// 전면 미러 프리뷰에서는 화면상 좌우가 반대이므로 소비자가 표시 미러 여부에 따라
    /// 스왑할 것(MakeupController의 미러 상태 참조 — 배선 제안 문서).
    /// </summary>
    public class ARKitBlendshapeSource : MonoBehaviour
    {
        // ── ARKitBlendShapeLocation 서수 (Apple ARKit XR Plugin 6.4 기준) ──
        // XRFaceBlendShape.blendShapeId는 "플랫폼이 정의한 ID"이고, ARKit 플러그인은
        // (ARKitBlendShapeLocation)blendShapeId 캐스트를 공식 해석으로 제공한다
        // (XRFaceBlendShapeExtensions.AsARKitBlendShapeLocation). 그 enum은 명시값 없는
        // 알파벳순 서수 — 아래 값은 플러그인 6.4 소스에서 확인한 서수다.
        // 플러그인 메이저 업그레이드 시 enum 순서 변동 여부를 재확인할 것.
        const int IdBrowInnerUp = 2;
        const int IdEyeBlinkLeft = 8;
        const int IdEyeBlinkRight = 9;
        const int IdJawOpen = 24;
        const int IdMouthSmileLeft = 43;
        const int IdMouthSmileRight = 44;

        // 이보다 오래 갱신이 없으면(트래킹 상실·서브시스템 정지) 계수를 0으로 리셋 —
        // 낡은 JawOpen으로 치아 미백 게이트가 열린 채 고정되는 것을 방지.
        // // 실기기 튜닝 대상
        const float StaleMs = 500f;

        public static ARKitBlendshapeSource Instance { get; private set; }

        /// <summary>이번 프레임에 유효한 계수가 있는지. false면 아래 값은 전부 0.</summary>
        public static bool HasData { get; private set; }

        /// <summary>마지막 유효 갱신 시각(ms, realtimeSinceStartup 기준) — 이벤트 검출용.</summary>
        public static double LastUpdateMs { get; private set; } = double.NegativeInfinity;

        public static float JawOpen { get; private set; }
        public static float EyeBlinkL { get; private set; }      // 피사체 왼눈 (좌/우 규약 주석)
        public static float EyeBlinkR { get; private set; }
        public static float MouthSmileL { get; private set; }
        public static float MouthSmileR { get; private set; }
        public static float BrowInnerUp { get; private set; }

        ARFaceManager _faceManager;
        bool _supportChecked;

        void Awake()
        {
            Instance = this;
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
            Clear(); // 정적 상태 — 컴포넌트 사후에 낡은 값이 남지 않게
        }

        void Start()
        {
            // ARBootstrap이 (비MEDIAPIPE 경로에서) 이 컴포넌트보다 먼저 ARFaceManager를
            // 만들므로 Start 시점 1회 탐색으로 충분하다. 부재 = MEDIAPIPE 주경로 —
            // 자동 비활성(클래스 주석 근거).
            _faceManager = FindAnyObjectByType<ARFaceManager>();
            if (_faceManager == null)
            {
                Debug.Log("[ARKitBlendshapeSource] ARFaceManager 없음(MediaPipe 주경로) — 비활성");
                enabled = false;
            }
        }

        void Update()
        {
            var subsystem = _faceManager != null ? _faceManager.subsystem : null;
            if (subsystem == null || !subsystem.running)
            {
                ClearIfStale();
                return;
            }

            // 디스크립터 게이트는 서브시스템 생성 후에만 판정 가능 — 1회 검사.
            // ARCore 등 blendshape 미지원 프로바이더는 여기서 영구 비활성.
            if (!_supportChecked)
            {
                _supportChecked = true;
                var descriptor = _faceManager.descriptor;
                if (descriptor == null || !descriptor.supportsBlendShapes)
                {
                    Debug.Log("[ARKitBlendshapeSource] 프로바이더가 blendshape 미지원 — 비활성");
                    Clear();
                    enabled = false;
                    return;
                }
            }

            ARFace face = null;
            foreach (var f in _faceManager.trackables)
            {
                if (f.trackingState != TrackingState.Tracking) continue;
                face = f;
                break;
            }
            if (face == null)
            {
                ClearIfStale();
                return;
            }

            // TryGetBlendShapes는 매 호출 새 NativeArray를 돌려준다(호출자 소유) —
            // Temp 할당이라 프레임당 비용은 무시 가능(52계수 × 8바이트).
            // 미지원 프로바이더의 기본 구현은 NotSupportedException을 던지므로
            // (디스크립터 게이트가 막지만) 방어적으로 감싼다 — 런타임 가드 원칙.
            try
            {
                var result = subsystem.TryGetBlendShapes(face.trackableId, Allocator.Temp);
                if (!result.status.IsSuccess())
                {
                    ClearIfStale();
                    return;
                }

                var shapes = result.value;
                if (!shapes.IsCreated || shapes.Length == 0)
                {
                    ClearIfStale();
                    return;
                }

                for (var i = 0; i < shapes.Length; i++)
                {
                    var w = Mathf.Clamp01(shapes[i].weight);
                    switch (shapes[i].blendShapeId)
                    {
                        case IdJawOpen: JawOpen = w; break;
                        case IdEyeBlinkLeft: EyeBlinkL = w; break;
                        case IdEyeBlinkRight: EyeBlinkR = w; break;
                        case IdMouthSmileLeft: MouthSmileL = w; break;
                        case IdMouthSmileRight: MouthSmileR = w; break;
                        case IdBrowInnerUp: BrowInnerUp = w; break;
                    }
                }
                shapes.Dispose();

                HasData = true;
                LastUpdateMs = Time.realtimeSinceStartupAsDouble * 1000.0;
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[ARKitBlendshapeSource] TryGetBlendShapes 실패: {e.Message} — 비활성");
                Clear();
                enabled = false;
            }
        }

        /// <summary>
        /// 일시적 결측(트래킹 상실 한두 프레임)엔 마지막 값을 유지하고, StaleMs를
        /// 넘긴 결측만 0으로 리셋 — 게이트 소비자의 명멸을 막는 히스테리시스.
        /// </summary>
        void ClearIfStale()
        {
            if (!HasData) return;
            if (Time.realtimeSinceStartupAsDouble * 1000.0 - LastUpdateMs <= StaleMs) return;
            Clear();
        }

        static void Clear()
        {
            HasData = false;
            JawOpen = 0f;
            EyeBlinkL = 0f;
            EyeBlinkR = 0f;
            MouthSmileL = 0f;
            MouthSmileR = 0f;
            BrowInnerUp = 0f;
        }
    }
}
