using System;
using System.Collections;
using System.Collections.Generic;
using ARMakeup.Bridge;
using ARMakeup.Capture;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

namespace ARMakeup.Face
{
    /// <summary>
    /// React Native에서 온 필터 파라미터를 공유 얼굴 머티리얼에 적용하고,
    /// 얼굴 인식 상태를 RN으로 보고하며, 카메라 전환(setCamera)을 처리한다.
    /// 트래킹 소스(MediaPipe/ARFace)와 무관하게 isTracked 델리게이트로 동작한다.
    /// </summary>
    public class MakeupController : MonoBehaviour
    {
        // 립은 LipRenderer(윤곽 링 메시)로 이관 — 얼굴 머티리얼엔 블러셔 + 사용자 룩 오버레이.
        static readonly int BlushMaskId = Shader.PropertyToID("_BlushMask");
        static readonly int BlushColorId = Shader.PropertyToID("_BlushColor");
        static readonly int BlushIntensityId = Shader.PropertyToID("_BlushIntensity");
        static readonly int BlushTextureId = Shader.PropertyToID("_BlushTexture"); // 제형(텍스처) W1
        // 제형(텍스처) 배선 — 얼굴 메시 6부위(tone/skin=TONE 템플릿 grain만, 나머지=GENERIC).
        // 블러셔(_BlushTexture) 선례. 0=현행=무변조(하위호환). 컨실러는 하안검 밴드와 값 공유.
        static readonly int ToneTextureId = Shader.PropertyToID("_ToneTexture");
        static readonly int SkinTextureId = Shader.PropertyToID("_SkinTexture");
        static readonly int HighlightTextureId = Shader.PropertyToID("_HighlightTexture");
        static readonly int ContourTextureId = Shader.PropertyToID("_ContourTexture");
        static readonly int ConcealerTextureId = Shader.PropertyToID("_ConcealerTexture");
        static readonly int PowderTextureId = Shader.PropertyToID("_PowderTexture");
        static readonly int BlushFinishId = Shader.PropertyToID("_BlushFinish");
        static readonly int BlushShimmerId = Shader.PropertyToID("_BlushShimmer");
        static readonly int BlushLiftId = Shader.PropertyToID("_BlushLift");
        static readonly int BlushSpreadId = Shader.PropertyToID("_BlushSpread");
        // 제형 스튜디오(#21) — 블러셔 마감 세부(0=미지정=enum 기존 동작).
        static readonly int BlushGlossLoId = Shader.PropertyToID("_BlushGlossLo");
        static readonly int BlushGlossGainId = Shader.PropertyToID("_BlushGlossGain");
        static readonly int BlushShimmerSizeId = Shader.PropertyToID("_BlushShimmerSize");
        static readonly int BlushShimmerDensityId = Shader.PropertyToID("_BlushShimmerDensity");
        static readonly int BlushMatteId = Shader.PropertyToID("_BlushMatte");
        static readonly int BlushSheenId = Shader.PropertyToID("_BlushSheen"); // 벨벳 시(0=무효, 머티리얼 기본과 동일)
        // 재질 아키타입(벨벳/메탈/홀로) — 0=없음(무변조 하위호환).
        static readonly int BlushMaterialId = Shader.PropertyToID("_BlushMaterial");
        static readonly int BlushMaterialStrengthId = Shader.PropertyToID("_BlushMaterialStrength");
        // 입자 레이어(7축) — 볼 반짝 알갱이. density=0=끔(하위호환).
        static readonly int BlushParticleSizeId = Shader.PropertyToID("_BlushParticleSize");
        static readonly int BlushParticleDensityId = Shader.PropertyToID("_BlushParticleDensity");
        static readonly int BlushParticleBrightnessId = Shader.PropertyToID("_BlushParticleBrightness");
        static readonly int BlushParticleColorId = Shader.PropertyToID("_BlushParticleColor");
        static readonly int BlushParticleTwinkleId = Shader.PropertyToID("_BlushParticleTwinkle");
        static readonly int BlushParticleShapeId = Shader.PropertyToID("_BlushParticleShape");
        static readonly int BlushParticleFeatherId = Shader.PropertyToID("_BlushParticleFeather");
        static readonly int BlushParticleParallaxId = Shader.PropertyToID("_BlushParticleParallax");
        static readonly int BlushParticleConfettiId = Shader.PropertyToID("_BlushParticleConfetti");
        // 질감 맵(#22) — 블러셔 픽셀별 광 지도 슬롯(FaceMakeup 머티리얼 소유).
        static readonly int BlushFinishMapId = Shader.PropertyToID("_BlushFinishMap");
        static readonly int BlushHasFinishMapId = Shader.PropertyToID("_BlushHasFinishMap");
        static readonly int HighlightMaskId = Shader.PropertyToID("_HighlightMask");
        static readonly int HighlightColorId = Shader.PropertyToID("_HighlightColor");
        static readonly int HighlightIntensityId = Shader.PropertyToID("_HighlightIntensity");
        // 하이라이터/컨투어 마감 — 블러셔와 동일 enum(0 새틴=기존 출력, 하위호환).
        static readonly int HighlightFinishId = Shader.PropertyToID("_HighlightFinish");
        static readonly int HighlightShimmerId = Shader.PropertyToID("_HighlightShimmer");
        // 제형 스튜디오(#21) — 하이라이터 마감 세부(0=미지정=enum 기존 동작).
        static readonly int HighlightGlossLoId = Shader.PropertyToID("_HighlightGlossLo");
        static readonly int HighlightGlossGainId = Shader.PropertyToID("_HighlightGlossGain");
        static readonly int HighlightShimmerSizeId = Shader.PropertyToID("_HighlightShimmerSize");
        static readonly int HighlightShimmerDensityId = Shader.PropertyToID("_HighlightShimmerDensity");
        static readonly int HighlightMatteId = Shader.PropertyToID("_HighlightMatte");
        static readonly int HighlightSheenId = Shader.PropertyToID("_HighlightSheen");
        static readonly int ContourMaskId = Shader.PropertyToID("_ContourMask");
        static readonly int ContourColorId = Shader.PropertyToID("_ContourColor");
        static readonly int ContourIntensityId = Shader.PropertyToID("_ContourIntensity");
        static readonly int ContourFinishId = Shader.PropertyToID("_ContourFinish");
        static readonly int ContourShimmerId = Shader.PropertyToID("_ContourShimmer");
        static readonly int ContourGlossLoId = Shader.PropertyToID("_ContourGlossLo");
        static readonly int ContourGlossGainId = Shader.PropertyToID("_ContourGlossGain");
        static readonly int ContourShimmerSizeId = Shader.PropertyToID("_ContourShimmerSize");
        static readonly int ContourShimmerDensityId = Shader.PropertyToID("_ContourShimmerDensity");
        static readonly int ContourMatteId = Shader.PropertyToID("_ContourMatte");
        static readonly int ContourSheenId = Shader.PropertyToID("_ContourSheen");
        // 부위 핏 아핀(배치 A ②) — 하이라이터·컨투어 존 UV 오프셋(블러셔 Lift/Spread 일반화).
        static readonly int HighlightLiftId = Shader.PropertyToID("_HighlightLift");
        static readonly int HighlightSpreadId = Shader.PropertyToID("_HighlightSpread");
        static readonly int ContourLiftId = Shader.PropertyToID("_ContourLift");
        static readonly int ContourSpreadId = Shader.PropertyToID("_ContourSpread");
        // 눈밑 존 컨실러(shape=0)는 하안검 밴드(LowerLidRenderer)로 이관(§08) —
        // 캐노니컬 _ConcealerMask 슬롯 삭제. FaceMakeup의 Color/Intensity는 붉은기
        // 자동(shape=1) 경로에서만 소비된다.
        static readonly int ConcealerColorId = Shader.PropertyToID("_ConcealerColor");
        static readonly int ConcealerIntensityId = Shader.PropertyToID("_ConcealerIntensity");
        // 컨실러 마감(concealerFinish) — FaceMakeup 붉은기 자동 경로. 눈밑존은 LowerLidRenderer가
        // 같은 필드를 소비한다(두 경로 공용). 0=새틴=기존 출력(하위호환).
        static readonly int ConcealerFinishId = Shader.PropertyToID("_ConcealerFinish");
        // 축 개선(#19b) — 부분 커버 붉은기 자동·파우더 존 (FaceMakeup 머티리얼 float 분기).
        static readonly int ConcealerShapeId = Shader.PropertyToID("_ConcealerShape");
        // 잡티 지우기(밀어내기) — FaceMakeup 피부 경로 outlier 억제. 0=현행 픽셀 동일.
        static readonly int BlemishRemovalId = Shader.PropertyToID("_BlemishRemoval");
        static readonly int PowderShapeId = Shader.PropertyToID("_PowderShape");
        // 모양 축 W3 피부 존 — 얼굴 메시(FaceMakeup 머티리얼) float 분기. 0=전체=현행.
        static readonly int ToneShapeId = Shader.PropertyToID("_ToneShape");
        static readonly int SkinShapeId = Shader.PropertyToID("_SkinShape");
        static readonly int FoundationShapeId = Shader.PropertyToID("_FoundationShape");
        // 베이스 팩(#18) — 톤/파우더/윤광은 얼굴 메시(머티리얼) 전용. 파운데이션은
        // 머티리얼 + 이마·목 확장(CameraFeed 전역)이라 같은 이름을 두 곳에 세팅한다
        // (같은 프로퍼티 id로 mat.Set* + Shader.SetGlobal* — 값 동일이라 정합).
        static readonly int FoundationColorId = Shader.PropertyToID("_FoundationColor");
        static readonly int FoundationIntensityId = Shader.PropertyToID("_FoundationIntensity");
        static readonly int FoundationFinishId = Shader.PropertyToID("_FoundationFinish");
        static readonly int FoundationTextureId = Shader.PropertyToID("_FoundationTexture"); // 제형 텍스처(①)
        // ── 임시 디버그(파운데 색 튜닝) — Foundation.cginc 전역 유니폼(얼굴·목 공유). 확정값을
        //    셰이더 리터럴로 굽고 나면 이 3개(및 BridgeMessages 필드·RN 슬라이더)를 걷어낸다. ──
        static readonly int FndRefLumaDbgId = Shader.PropertyToID("_FndRefLumaDbg");
        static readonly int FndLumaGainDbgId = Shader.PropertyToID("_FndLumaGainDbg");
        static readonly int FndChromaDbgId = Shader.PropertyToID("_FndChromaDbg");
        // ── 임시 디버그(이음새 세그 게이트 튜닝) — CameraFeed 전역 유니폼(파운데 seg 게이트
        //    임계 4종+시각화 토글). 확정 후 이 5개(및 BridgeMessages 필드·RN 슬라이더)를 걷어낸다. ──
        static readonly int SegSeamDbgId = Shader.PropertyToID("_SegSeamDbg");
        static readonly int FndSegLoDbgId = Shader.PropertyToID("_FndSegLoDbg");
        static readonly int FndSegHiDbgId = Shader.PropertyToID("_FndSegHiDbg");
        static readonly int FndOvalSizeDbgId = Shader.PropertyToID("_FndOvalSizeDbg");
        static readonly int FndOvalFeatherDbgId = Shader.PropertyToID("_FndOvalFeatherDbg");
        static readonly int PowderIntensityId = Shader.PropertyToID("_PowderIntensity");
        // 컬러/펄 파우더 — ""=무색(흰색=identity)·0=새틴=기존 출력(하위호환).
        static readonly int PowderColorId = Shader.PropertyToID("_PowderColor");
        static readonly int PowderFinishId = Shader.PropertyToID("_PowderFinish");
        static readonly int PowderShimmerId = Shader.PropertyToID("_PowderShimmer");
        static readonly int ToneBaseColorId = Shader.PropertyToID("_ToneBaseColor");
        static readonly int SkinGlowId = Shader.PropertyToID("_SkinGlow");
        // A15 펄/시머 방향 게인 — Finish.cginc 공용(립·아이섀도·블러셔). Init에서 1회 전역
        // 설정하는 고정값(v1은 RN 필드 없음). 0=완전 하위호환, 시머 있는 룩만 시각 변화.
        static readonly int PearlLightGainId = Shader.PropertyToID("_PearlLightGain");
        static readonly int MatteGrainId = Shader.PropertyToID("_MatteGrain"); // 전역 매트 그레인(0=끔)
        static readonly int MatCapChromeId = Shader.PropertyToID("_MatCapChrome"); // 크롬 MatCap 전역 텍스처
        static readonly int MatCapHoloId = Shader.PropertyToID("_MatCapHolo");     // 홀로(오일슬릭) MatCap
        static readonly int MatCapMultiId = Shader.PropertyToID("_MatCapMulti");   // 멀티크롬(듀오크롬) MatCap
        Texture2D _matcapChrome, _matcapHolo, _matcapMulti; // 절차 생성 MatCap(소유 — GC 방지)
        const float PearlLightGain = 0.6f; // 실기기 튜닝 대상
        // 애교살은 LowerLidRenderer(하안검 밴드 정식판)로 이관 — 얼굴 머티리얼에서 제거.
        // 캐노니컬 오버레이 N장 슬롯(설계 섹션 07 블로커 스파이크) — 슬롯0=기존 _MakeupOverlay.
        // setFaceOverlay(단일 임포트)는 슬롯0 어댑터, setOverlayLayers(배열)가 전 슬롯을 소유.
        // _MakeupOverlayIntensity(=faceOverlayIntensity)는 전 슬롯에 곱해지는 마스터 강도.
        const int MaxOverlayLayers = 4;
        static readonly int[] OverlayTexIds =
        {
            Shader.PropertyToID("_MakeupOverlay"), Shader.PropertyToID("_Overlay1"),
            Shader.PropertyToID("_Overlay2"), Shader.PropertyToID("_Overlay3"),
        };
        static readonly int[] OverlayTransformIds =
        {
            Shader.PropertyToID("_Overlay0Transform"), Shader.PropertyToID("_Overlay1Transform"),
            Shader.PropertyToID("_Overlay2Transform"), Shader.PropertyToID("_Overlay3Transform"),
        };
        static readonly int[] OverlayIntensityIds =
        {
            Shader.PropertyToID("_Overlay0Intensity"), Shader.PropertyToID("_Overlay1Intensity"),
            Shader.PropertyToID("_Overlay2Intensity"), Shader.PropertyToID("_Overlay3Intensity"),
        };
        static readonly int[] OverlayBlendIds =
        {
            Shader.PropertyToID("_Overlay0Blend"), Shader.PropertyToID("_Overlay1Blend"),
            Shader.PropertyToID("_Overlay2Blend"), Shader.PropertyToID("_Overlay3Blend"),
        };
        static readonly int[] OverlayColorIds =
        {
            Shader.PropertyToID("_Overlay0Color"), Shader.PropertyToID("_Overlay1Color"),
            Shader.PropertyToID("_Overlay2Color"), Shader.PropertyToID("_Overlay3Color"),
        };
        // 데코 마감 0새틴/1매트/2듀이(FOUNDATION_FINISHES) — FaceMakeup ApplyOverlay 소비(0=새틴=항등).
        static readonly int[] OverlayFinishIds =
        {
            Shader.PropertyToID("_Overlay0Finish"), Shader.PropertyToID("_Overlay1Finish"),
            Shader.PropertyToID("_Overlay2Finish"), Shader.PropertyToID("_Overlay3Finish"),
        };
        static readonly Vector4 OverlayIdentity = new Vector4(0.5f, 0.5f, 1f, 0f); // 캔버스 전체
        // 디자이너 마스크(모양 축, §16) — 부위 "존"을 정의하는 캐노니컬 UV 마스크 슬롯을
        // 임포트 흑백/알파 스텐실로 런타임 스왑. 대상은 FaceMakeup의 캐노니컬 UV 존 마스크
        // (블러셔·하이라이터·컨투어). 색·마감·농도 축은 그대로(마스크=색 없는 스텐실).
        // (아이섀도는 IrisRenderer 동적 밴드라 캐노니컬 마스크 슬롯이 없어 대상 제외 — 밴드
        //  마스크 지원은 후속. 셰이더 .r 샘플 계약이라 슬롯 텍스처만 교체, 셰이더 무변경.)
        enum MaskRegion { Blush = 0, Highlight = 1, Contour = 2 }
        static readonly int[] MaskSlotIds = { BlushMaskId, HighlightMaskId, ContourMaskId };
        static readonly int MakeupOverlayIntensityId = Shader.PropertyToID("_MakeupOverlayIntensity");
        static readonly int SmoothingId = Shader.PropertyToID("_Smoothing");
        static readonly int BrighteningId = Shader.PropertyToID("_Brightening");
        // 세그 확장(§11 P3·§14) — CameraFeed(배경) 셰이더가 소비하는 전역 유니폼.
        // 머티리얼이 아니라 전역인 이유: CameraFeed 머티리얼은 FramePresenter 소유라
        // 컨트롤러가 직접 만지지 않는다(SegmentationSource의 전역 기록과 같은 규약).
        static readonly int SkinSmoothExtId = Shader.PropertyToID("_SkinSmoothExt");
        static readonly int HairTintColorId = Shader.PropertyToID("_HairTintColor");
        static readonly int HairTintIntensityId = Shader.PropertyToID("_HairTintIntensity");
        static readonly int HairFinishId = Shader.PropertyToID("_HairFinish"); // 헤어 염색 마감(0=새틴=기존)
        static readonly int HairShapeId = Shader.PropertyToID("_HairShape");   // 헤어 존(W6, 0=전체=현행)

        // 얼굴 오버레이: 투명 영역이 이보다 적으면 배경째 저장한 그림 → 얼굴 전체를
        // 덮으므로 거부(사용자에게 투명 PNG 안내).
        const float FaceOverlayMinTransparent = 0.05f;

        Material _material;
        ARCameraManager _cameraManager;
        Func<bool> _isTracked;
        ARSession _session;
        bool _lastTracked;
        readonly Texture2D[] _overlayTexes = new Texture2D[MaxOverlayLayers]; // 슬롯별 소유(교체 시 파기)
        readonly string[] _overlayPaths = new string[MaxOverlayLayers];       // 재전송 시 재로드 방지 캐시 키
        // 디자이너 마스크 오버라이드(모양 축) — null=절차 마스크(회귀 0). 슬롯별 소유(교체 시 파기).
        readonly Texture2D[] _maskOverrides = new Texture2D[3];
        // 질감 맵(#22) — 블러셔 광 지도(FaceMakeup 머티리얼 슬롯). 립·아이섀도 맵은 각
        // 렌더러(LipRenderer/IrisRenderer)가 소유. null=맵 없음. 소유(교체·해제 시 파기).
        Texture2D _blushFinishMap;

        public static Material CreateMaterial()
        {
            var shader = Resources.Load<Shader>("FaceMakeup");
            if (shader == null) shader = Shader.Find("ARMakeup/FaceMakeup");
            if (shader == null)
            {
                Debug.LogError("[MakeupController] FaceMakeup shader not found");
                shader = Shader.Find("Unlit/Color");
            }

            var mat = new Material(shader);
            // 베이스 캔버스는 항상 최하 큐 — GrabPass(_CameraFeed) 그랩 시점의 기준.
            mat.renderQueue = MakeupQueues.Face;
            mat.SetTexture(BlushMaskId, MaskGenerator.BlushMask);
            mat.SetTexture(HighlightMaskId, MaskGenerator.HighlightMask);
            mat.SetTexture(ContourMaskId, MaskGenerator.ContourMask);
            // 임포트 전엔 투명 텍스처라 오버레이가 얼굴을 덮지 않는다. 슬롯0 강도만 1 —
            // 단일 임포트(setFaceOverlay) 경로가 마스터 강도만으로 기존과 동일하게 돌게.
            for (var slot = 0; slot < MaxOverlayLayers; slot++)
            {
                mat.SetTexture(OverlayTexIds[slot], ImageFileLoader.ClearTexture);
                mat.SetVector(OverlayTransformIds[slot], OverlayIdentity);
                mat.SetFloat(OverlayIntensityIds[slot], slot == 0 ? 1f : 0f);
            }
            ApplyTo(mat, new FilterParams());
            return mat;
        }

        public void Init(Material material, ARCameraManager cameraManager, Func<bool> isTracked)
        {
            _material = material;
            _cameraManager = cameraManager;
            _isTracked = isTracked;

            // 치아 미백 렌더러 부트스트랩 — 씬 구성(ARBootstrap)은 타 트랙이 사용 중이라
            // 동결. 컨트롤러는 랜드마크 렌더러들보다 나중에 생성되므로 이 시점엔
            // FaceLandmarkSource 싱글턴이 이미 살아 있고, AR 카메라는 MainCamera 태그.
            // ARKit 폴백(랜드마크 소스 없음)에선 생성 자체를 건너뛴다 — 다른 랜드마크
            // 렌더러들과 동일한 MediaPipe 전용 범위.
            if (FaceLandmarkSource.Instance != null && Camera.main != null)
            {
                var teethGO = new GameObject("Teeth Renderer");
                teethGO.AddComponent<TeethRenderer>().Init(Camera.main, FaceLandmarkSource.Instance);

                // 쌍꺼풀 크리스(#19b) — TeethRenderer 선례대로 부트스트랩. 자활 가드(Instance
                // 싱글턴+Init)를 갖춘 렌더러라 여기서 생성·Init만 하면 된다. MediaPipe 전용.
                var doubleLidGO = new GameObject("DoubleLid Renderer");
                doubleLidGO.AddComponent<DoubleLidRenderer>().Init(Camera.main, FaceLandmarkSource.Instance);

                // 튜토리얼 스텐실(#2) — 같은 부트스트랩 경로. 부위 가이드 라인을 완성본 위에
                // 얹는 코치 오버레이라 랜드마크가 필요(MediaPipe 전용).
                var stencilGO = new GameObject("Stencil Guide Renderer");
                stencilGO.AddComponent<StencilGuideRenderer>().Init(Camera.main, FaceLandmarkSource.Instance);

                // 좌우 대칭 가이드(#6) — 같은 경로. 중심축·대칭 쌍 커넥터로 비대칭 표시.
                var symmetryGO = new GameObject("Symmetry Guide Renderer");
                symmetryGO.AddComponent<SymmetryGuideRenderer>().Init(Camera.main, FaceLandmarkSource.Instance);

                // 반반 모드 — 맨얼굴 쪽 절반에 원본 피드 복원 + 얼굴 중심축 전역 기록.
                // 랜드마크로 중심축을 잡으므로 MediaPipe 경로 전용.
                var splitGO = new GameObject("Split Mask Renderer");
                splitGO.AddComponent<SplitMaskRenderer>().Init(Camera.main, FaceLandmarkSource.Instance);
            }

            // 조명 시뮬레이션(#4) — 화면 그레이드라 랜드마크가 필요 없다(Camera.main만).
            // 랜드마크 가드 밖에 두어 MediaPipe/ARKit 경로 모두에서 동작한다.
            if (Camera.main != null)
            {
                var lightingGO = new GameObject("Lighting Sim Renderer");
                lightingGO.AddComponent<LightingSimRenderer>().Init(Camera.main);
            }

            // 세그멘테이션 소스(§11 오클루전·§14 헤어) — TeethRenderer와 같은 부트스트랩
            // 경로(ARBootstrap 동결 규약 유지). FaceLandmarkSource가 캡처 프레임을 밀어주는
            // 구조라 MediaPipe 경로에서만 의미가 있다(ARKit 폴백에선 생성 생략).
            if (FaceLandmarkSource.Instance != null)
            {
                // Face3D와 공유하는 입력 생산자를 중복 생성하지 않는다.
                if (SegmentationSource.Instance == null)
                {
                    var segGO = new GameObject("Segmentation Source");
                    segGO.AddComponent<SegmentationSource>();
                }

                // L2 립/눈 영역 마스크(랜드마크 폴리곤 1차) — 같은 부트스트랩 경로.
                // 랜드마크만 소비하므로 MediaPipe 경로 전용(ARKit 폴백에선 생성 생략).
                var regionGO = new GameObject("Region Mask Source");
                regionGO.AddComponent<RegionMaskSource>().Init(FaceLandmarkSource.Instance);

                // 헤드포즈 프록시(재질 확장) — 시점 각도·움직임 세기를 전역(_ViewAngle,
                // _MotionEnergy)으로 흘려 글리터 명멸·홀로그램·메탈 하이라이트 이동을 구동.
                // 없어도(또는 얼굴 소실 시) 마감은 무변조 하위호환.
                var headPoseGO = new GameObject("Head Pose Source");
                headPoseGO.AddComponent<HeadPoseSource>().Init(FaceLandmarkSource.Instance);
            }

            // A15 펄/시머 방향 게인 — 전역 1회 설정(고정값). 시머 스파클 항이 있는 룩만
            // 밝은 쪽에서 더 반짝이도록 변조하며, 시머가 없는 룩은 스파클 항이 0이라 무영향.
            Shader.SetGlobalFloat(PearlLightGainId, PearlLightGain);

            // 임시 디버그(파운데 색 튜닝) — 첫 applyFilter 전에도 셰이더가 유효값을 받도록
            // 옛 #define 상수(0.798322/1.0/0.4)를 전역 1회 세팅(미설정 0 방지). chroma는 0도
            // 유효값이라 셰이더 음수 sentinel이 아닌 실제 기본 0.4를 넣는다.
            Shader.SetGlobalFloat(FndRefLumaDbgId, 0.798322f);
            Shader.SetGlobalFloat(FndLumaGainDbgId, 1f);
            Shader.SetGlobalFloat(FndChromaDbgId, 0.4f);

            // 임시 디버그(이음새 세그 게이트) — 임계 4종(전이 2 + 타원 크기·페더)은 sentinel -1
            // (미설정=셰이더 리터럴 폴백, 전이 LO는 0도 유효값이라 음수 sentinel)로, 시각화
            // 토글은 0(끔)으로 1회 시딩. 첫 applyFilter 전에도 게이트가 리터럴로 동작해 현행
            // 픽셀과 동일. (얼굴 오벌 유니폼 _FndOval/_FndOvalAxis는 StencilGuideRenderer가
            // 소유·매 프레임 기록하고 Init에서 무효 시딩 — MediaPipe 경로에만 존재.)
            Shader.SetGlobalFloat(SegSeamDbgId, 0f);
            Shader.SetGlobalFloat(FndSegLoDbgId, -1f);
            Shader.SetGlobalFloat(FndSegHiDbgId, -1f);
            Shader.SetGlobalFloat(FndOvalSizeDbgId, -1f);
            Shader.SetGlobalFloat(FndOvalFeatherDbgId, -1f);

            // 텍스처 MatCap(크롬) — "조명 구운 구슬" 이미지를 절차 생성해 전역 텍스처로.
            // 메탈 재질이 법선으로 이걸 샘플해 진짜 반사에 가까운 크롬을 낸다(수식 근사 대체).
            _matcapChrome = GenChromeMatcap(128);
            Shader.SetGlobalTexture(MatCapChromeId, _matcapChrome);
            _matcapHolo = GenHoloMatcap(128);
            Shader.SetGlobalTexture(MatCapHoloId, _matcapHolo);
            _matcapMulti = GenMultichromeMatcap(128);
            Shader.SetGlobalTexture(MatCapMultiId, _matcapMulti);
        }

        // 각 MatCap 텍셀의 구슬 법선 계산(공용). 구슬 밖이면 z<0.
        static Vector3 BallNormal(int x, int y, int size, out bool outside)
        {
            float u = (x + 0.5f) / size * 2f - 1f;
            float v = (y + 0.5f) / size * 2f - 1f;
            float r2 = u * u + v * v;
            outside = r2 > 1f;
            float nz = outside ? 0f : Mathf.Sqrt(1f - r2);
            return new Vector3(u, v, nz);
        }

        // cos 팔레트 무지개색(phase 0..1로 순환).
        static Color CosPalette(float phase)
        {
            const float TAU = 6.2831853f;
            return new Color(
                0.5f + 0.5f * Mathf.Cos(TAU * (phase + 0.00f)),
                0.5f + 0.5f * Mathf.Cos(TAU * (phase + 0.33f)),
                0.5f + 0.5f * Mathf.Cos(TAU * (phase + 0.67f)));
        }

        // 홀로그램(오일슬릭) MatCap — 법선 방향으로 무지개 hue 순환 + 하이라이트 + 림.
        static Texture2D GenHoloMatcap(int size)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGB24, false)
            { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            var px = new Color[size * size];
            var light = new Vector3(0.4f, 0.65f, 0.65f).normalized;
            for (var y = 0; y < size; y++)
                for (var x = 0; x < size; x++)
                {
                    var n = BallNormal(x, y, size, out var outside);
                    Color c;
                    if (outside) c = new Color(0.05f, 0.05f, 0.08f);
                    else
                    {
                        float phase = n.x * 1.3f + n.y * 0.9f + n.z * 0.4f; // 오일슬릭 무지개
                        var iri = CosPalette(phase);
                        float spec = Mathf.Pow(Mathf.Clamp01(Vector3.Dot(n, light)), 40f);
                        float rim = Mathf.Pow(1f - n.z, 3f) * 0.3f;
                        c = iri * 0.85f + Color.white * spec * 0.6f + Color.white * rim;
                    }
                    px[y * size + x] = c;
                }
            tex.SetPixels(px); tex.Apply(false, true);
            return tex;
        }

        // 멀티크롬(듀오크롬) MatCap — 법선 세로로 두 색(보라↔초록) 사이 travel + 하이라이트 + 림.
        static Texture2D GenMultichromeMatcap(int size)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGB24, false)
            { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            var px = new Color[size * size];
            var light = new Vector3(0.4f, 0.65f, 0.65f).normalized;
            var colA = new Color(0.55f, 0.25f, 0.75f);  // 보라
            var colB = new Color(0.25f, 0.72f, 0.55f);  // 초록
            for (var y = 0; y < size; y++)
                for (var x = 0; x < size; x++)
                {
                    var n = BallNormal(x, y, size, out var outside);
                    Color c;
                    if (outside) c = new Color(0.05f, 0.05f, 0.08f);
                    else
                    {
                        float t = Mathf.Clamp01((n.x * 0.6f + n.y * 0.5f) * 0.5f + 0.5f);
                        var duo = Color.Lerp(colA, colB, t * t * (3f - 2f * t)); // smoothstep 2색
                        float spec = Mathf.Pow(Mathf.Clamp01(Vector3.Dot(n, light)), 40f);
                        float rim = Mathf.Pow(1f - n.z, 3f) * 0.3f;
                        c = duo * 0.9f + Color.white * spec * 0.55f + Color.white * rim;
                    }
                    px[y * size + x] = c;
                }
            tex.SetPixels(px); tex.Apply(false, true);
            return tex;
        }

        // 크롬 MatCap 절차 생성 — 각 텍셀 = 구슬 위 그 방향의 반사색(환경 그라데 + 키 하이라이트
        // + 프레넬 림). 셰이더가 법선.xy로 샘플한다. 외부 에셋 없이 코드로 생성.
        static Texture2D GenChromeMatcap(int size)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGB24, false)
            {
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear,
            };
            var px = new Color[size * size];
            var light = new Vector3(0.4f, 0.65f, 0.65f).normalized;   // 키 라이트 방향
            var sky = new Color(0.88f, 0.92f, 0.98f);                 // 위(밝은 환경)
            var ground = new Color(0.10f, 0.12f, 0.16f);              // 아래(어두운 바닥)
            for (var y = 0; y < size; y++)
            {
                for (var x = 0; x < size; x++)
                {
                    float u = (x + 0.5f) / size * 2f - 1f;
                    float v = (y + 0.5f) / size * 2f - 1f;
                    float r2 = u * u + v * v;
                    Color c;
                    if (r2 > 1f)
                    {
                        c = ground; // 구슬 밖 — 어둡게(엣지 클램프라 거의 안 쓰임)
                    }
                    else
                    {
                        float nz = Mathf.Sqrt(1f - r2);
                        var n = new Vector3(u, v, nz);
                        float t = n.y * 0.5f + 0.5f;                  // 세로 = 환경 그라데
                        var env = Color.Lerp(ground, sky, t * t);    // 위로 밝은 반사
                        float spec = Mathf.Pow(Mathf.Clamp01(Vector3.Dot(n, light)), 48f); // 키 하이라이트
                        float rim = Mathf.Pow(1f - nz, 3f) * 0.35f;  // 프레넬 림(테두리 밝음)
                        c = env + Color.white * spec + Color.white * rim;
                    }
                    px[y * size + x] = c;
                }
            }
            tex.SetPixels(px);
            tex.Apply(false, true);
            return tex;
        }

        void OnEnable()
        {
            NativeBridge.MessageReceived += OnMessage;
        }

        void OnDisable()
        {
            NativeBridge.MessageReceived -= OnMessage;
        }

        // 원격 카탈로그(§16 v2) 게이트 대상 — path/designPath로 에셋을 로드하는 메시지 타입.
        // 이 타입들만 원격 uri prefetch 여부를 검사한다(setEyeshadowLayers는 path 없음 — 제외.
        // enterPhotoEdit 등 로컬 미디어는 MediaEditController 소관이라 이 switch에 없음).
        static readonly HashSet<string> PathBearingTypes = new HashSet<string>
        {
            "setBrowStyle", "setEyelinerStyle", "setLipStyle", "setBlushStyle", "setAegyoStyle",
            "setRegionMask", "setTextureMap", "setFaceOverlay", "setOverlayLayers", "setLensLayers",
        };

        void ClearForkRecipeOverlays()
        {
            // AURA's recipe renderer is not part of the ARwithFable flat-filter
            // pipeline. Unity is kept warm across screens, so clear any latched
            // screen-space foundation / vision-boundary state before the
            // canonical filter is applied.
            var forkOverlay = FindFirstObjectByType<global::E3RegionMaskOverlay>();
            if (forkOverlay != null)
            {
                forkOverlay.ClearRecipesAndHideOverlays();
            }
        }

        void OnMessage(RNToUnityMessage msg)
        {
            // 원격 카탈로그 게이트(§16 v2) — 원격/스트리밍 에셋이면 캐시로 먼저 내려받고
            // 다운로드 완료 후 이 OnMessage(msg)를 재호출한다. 로컬/캐시완료/give-up이면 통과.
            if (PathBearingTypes.Contains(msg.type) && !EnsureRemoteAssetsReady(msg)) return;
            switch (msg.type)
            {
                case "applyFilter":
                    if (msg.filter != null && _material != null)
                    {
                        ClearForkRecipeOverlays();
                        ApplyTo(_material, msg.filter);
                        // ApplyTo가 블러셔 shape 절차 마스크를 매번 다시 세팅하므로,
                        // 임포트 마스크가 있으면 그 뒤에 재적용해 덮어쓰기를 되돌린다.
                        ReassertMaskOverrides();
                    }
                    break;
                case "capture":
                    if (PhotoCapture.Instance != null) PhotoCapture.Instance.Capture();
                    break;
                case "startRecording":
                    if (VideoRecorder.Instance != null) VideoRecorder.Instance.StartRecording();
                    break;
                case "stopRecording":
                    if (VideoRecorder.Instance != null) VideoRecorder.Instance.StopRecording();
                    break;
                case "setSaveOptions":
                    CaptureComposite.SaveUnmirror = msg.saveUnmirror;
                    break;
                case "setPaused":
                    SetPaused(msg.paused);
                    break;
                case "setCamera":
                    SetCamera(msg.facing);
                    break;
                case "setCalibration":
                    ApplyCalibration(msg.calibration);
                    break;
                case "setBrowStyle":
                    if (StyleRenderer.Instance != null)
                        StyleRenderer.Instance.SetStyleTextureFromFile(msg.path);
                    break;
                case "setEyelinerStyle":
                    if (EyelinerStyleRenderer.Instance != null)
                        EyelinerStyleRenderer.Instance.SetTextureFromFile(msg.path);
                    break;
                case "setLipStyle":
                    if (LipStyleRenderer.Instance != null)
                        LipStyleRenderer.Instance.SetTextureFromFile(msg.path);
                    break;
                case "setBlushStyle":
                    if (BlushStyleRenderer.Instance != null)
                        BlushStyleRenderer.Instance.SetTextureFromFile(msg.path);
                    break;
                case "setAegyoStyle":
                    if (LowerLidRenderer.Instance != null)
                        LowerLidRenderer.Instance.SetAegyoTextureFromFile(msg.path);
                    break;
                case "setRegionMask":
                    SetRegionMaskFromFile(msg.region, msg.path);
                    break;
                case "setTextureMap":
                    SetTextureMapFromFile(msg.region, msg.path);
                    break;
                case "setFaceOverlay":
                    SetFaceOverlayFromFile(msg.path);
                    break;
                case "setOverlayLayers":
                    SetOverlayLayers(msg.overlayLayers);
                    break;
                case "setLensLayers":
                    // 렌즈 레이어드(#25) — 홍채 디스크 소유자(IrisRenderer)로 라우팅.
                    // 빈 배열은 레이어드 끄고 legacy irisColor/irisIntensity 어댑터로 복귀.
                    if (IrisRenderer.Instance != null)
                        IrisRenderer.Instance.SetLensLayers(msg.lensLayers);
                    break;
                case "setEyeshadowLayers":
                    // 아이섀도 멀티밴드(A14 ①) — 아이섀도 밴드 소유자(IrisRenderer)로 라우팅.
                    // 빈 배열은 멀티밴드 끄고 legacy 단일 밴드 스칼라 경로로 복귀.
                    IrisRenderer.Instance?.SetEyeshadowLayers(msg.eyeshadowLayers);
                    break;
                case "setStencil":
                    // 튜토리얼 가이드(#2) — 부위 라인 스텐실 렌더러로 라우팅.
                    if (StencilGuideRenderer.Instance != null)
                        StencilGuideRenderer.Instance.ApplyStencil(msg.stencil);
                    break;
                case "setFitHandles":
                    // 온페이스 핏 핸들(A17) — 좌표 방출 토글(터치는 RN 소관).
                    StencilGuideRenderer.Instance?.SetFitHandlesEnabled(msg.fitHandles);
                    break;
                case "setSymmetry":
                    // 좌우 대칭 가이드(#6) — 대칭 렌더러로 라우팅.
                    if (SymmetryGuideRenderer.Instance != null)
                        SymmetryGuideRenderer.Instance.ApplySymmetry(msg.symmetry);
                    break;
                case "setLighting":
                    // 조명 시뮬레이션(#4) — 조명 렌더러로 라우팅.
                    if (LightingSimRenderer.Instance != null)
                        LightingSimRenderer.Instance.ApplyLighting(msg.lighting);
                    break;
                case "setSplit":
                    // 반반 모드 — 스플릿 마스크 렌더러로 라우팅.
                    if (SplitMaskRenderer.Instance != null)
                        SplitMaskRenderer.Instance.ApplySplit(msg.split);
                    break;
            }
        }

        /// <summary>
        /// 원격 카탈로그 게이트(§16 v2) — 이 메시지가 참조하는 에셋 uri 중 아직 캐시되지 않은
        /// 원격/스트리밍 uri가 있으면 코루틴으로 prefetch 후 OnMessage(msg)를 재호출하고 false.
        /// 전부 로컬/캐시완료/give-up이면 true(즉시 동기 디스패치). ★무한루프 방지: 2차 패스에서
        /// 성공 uri=캐시 존재로 not-pending, 실패 uri=give-up(_failed)으로 not-pending → pending
        /// 비어 통과 → 재코루틴 안 뜬다.
        /// </summary>
        bool EnsureRemoteAssetsReady(RNToUnityMessage msg)
        {
            var pending = new List<string>();
            foreach (var u in CollectAssetUris(msg))
                if (!string.IsNullOrEmpty(u) && RemoteAssetCache.NeedsFetch(u)
                    && !RemoteAssetCache.TryResolveCached(u, out _)
                    && !RemoteAssetCache.IsGivenUp(u))
                    pending.Add(u);
            if (pending.Count == 0) return true;   // 로컬/이미 캐시/give-up → 즉시 동기 디스패치
            StartCoroutine(PrefetchThenRedispatch(msg, pending));
            return false;                          // 코루틴이 다운로드 후 OnMessage(msg) 재호출
        }

        // 메시지가 참조하는 에셋 uri 전부(단일 path + 오버레이 레이어 path + 렌즈 레이어 designPath).
        static IEnumerable<string> CollectAssetUris(RNToUnityMessage msg)
        {
            if (!string.IsNullOrEmpty(msg.path)) yield return msg.path;
            if (msg.overlayLayers != null)
                foreach (var l in msg.overlayLayers)
                    if (l != null && !string.IsNullOrEmpty(l.path)) yield return l.path;
            if (msg.lensLayers != null)
                foreach (var l in msg.lensLayers)
                    if (l != null && !string.IsNullOrEmpty(l.designPath)) yield return l.designPath;
        }

        // pending uri를 순차 다운로드한 뒤 OnMessage(msg) 재호출(재디스패치). 성공 uri는
        // TryResolveCached=true, 실패 uri는 IsGivenUp=true → 둘 다 pending 아님 → 게이트 통과 →
        // 정상 동기 처리(실패분은 렌더러 자체 "찾을 수 없음" 폴백).
        IEnumerator PrefetchThenRedispatch(RNToUnityMessage msg, List<string> uris)
        {
            foreach (var u in uris)
                yield return RemoteAssetCache.Fetch(u, (ok, res) =>
                {
                    if (!ok)
                        NativeBridge.Send(new UnityToRNMessage
                        { type = "error", message = $"원격 에셋 다운로드 실패: {res}" });
                });
            OnMessage(msg);
        }

        /// <summary>
        /// 사용자가 UV 템플릿 위에 그린 메이크업 룩을 얼굴 UV 데칼로 얹는다.
        /// 알파=그린 영역이라 반드시 투명 배경 PNG여야 한다(불투명이면 거부).
        /// N장 합성에선 "슬롯0 한 장" 어댑터 — 전체 캔버스·강도 1로 리셋해
        /// 기존 단일 임포트 동작(마스터 강도만으로 제어)을 그대로 유지한다.
        /// </summary>
        void SetFaceOverlayFromFile(string path)
        {
            if (_material == null) return;
            if (!ImageFileLoader.TryLoad(path, out var tex, out var error))
            {
                NativeBridge.Send(new UnityToRNMessage
                { type = "error", message = $"얼굴 룩 임포트 실패: {error}" });
                return;
            }
            if (ImageFileLoader.TransparentFraction(tex) < FaceOverlayMinTransparent)
            {
                Destroy(tex);
                NativeBridge.Send(new UnityToRNMessage
                {
                    type = "error",
                    message = "투명 배경 PNG가 필요합니다. UV 템플릿 레이어를 숨기고 " +
                              "메이크업만 남겨 PNG로 내보내 주세요.",
                });
                return;
            }
            SetOverlaySlot(0, tex, path, OverlayIdentity, 1f, 0f, null, 0); // 단일 임포트 어댑터 — 마감 새틴(항등)
        }

        /// <summary>
        /// 디자이너 마스크 임포트(모양 축, §16) — 부위 "존"을 정의하는 흑백/알파 스텐실로
        /// 캐노니컬 UV 마스크 슬롯(_BlushMask 등)을 런타임 스왑한다. 색·마감·농도 축은
        /// 그대로(마스크=색 없는 스텐실). 컬러 아트면 거부하고 텍스처 탭으로 안내한다.
        /// 빈 경로 = 절차 마스크 복원(임포트 취소, 회귀 0).
        /// </summary>
        void SetRegionMaskFromFile(string region, string path)
        {
            // 아이섀도는 FaceMakeup 캐노니컬 UV 슬롯이 아니라 동적 밴드(IrisRenderer 소유)라
            // 별도 라우팅 — 밴드-로컬 uv2로 샘플하는 모양 마스크(§16). _material 무관.
            if (region == "eyeshadow")
            {
                if (IrisRenderer.Instance != null) IrisRenderer.Instance.SetEyeshadowDesignFromFile(path);
                return;
            }
            if (_material == null) return;
            if (!TryMaskRegion(region, out var slot, out var label))
            {
                NativeBridge.Send(new UnityToRNMessage
                { type = "error", message = $"지원하지 않는 마스크 부위: {region}" });
                return;
            }
            if (string.IsNullOrEmpty(path)) { ClearRegionMask(slot); return; }
            if (!ImageFileLoader.TryLoadMask(path, out var mask, out var error))
            {
                NativeBridge.Send(new UnityToRNMessage
                { type = "error", message = $"{label} 마스크 임포트 실패: {error}" });
                return;
            }
            if (_maskOverrides[slot] != null) Destroy(_maskOverrides[slot]);
            _maskOverrides[slot] = mask;
            _material.SetTexture(MaskSlotIds[slot], mask);
            // 튜토리얼 가이드(#2 C) — 커스텀 마스크 경계를 추적하도록 통지.
            if (StencilGuideRenderer.Instance != null)
                StencilGuideRenderer.Instance.SetCustomMask(slot, mask);
        }

        // 임포트 마스크 취소 → 절차 마스크로 복원. 블러셔는 다음 applyFilter가 shape별
        // 마스크로 다시 세팅하므로 여기선 클래식(BlushMask)만 걸어도 된다.
        void ClearRegionMask(int slot)
        {
            if (_maskOverrides[slot] != null) { Destroy(_maskOverrides[slot]); _maskOverrides[slot] = null; }
            _material.SetTexture(MaskSlotIds[slot], DefaultMask(slot));
            // 캐노니컬로 복귀 — 가이드도 캐노니컬 존(B)으로 되돌린다.
            if (StencilGuideRenderer.Instance != null)
                StencilGuideRenderer.Instance.SetCustomMask(slot, null);
        }

        // 임포트 마스크가 있으면 재적용 — ApplyTo가 블러셔 shape 절차 마스크를 매 프레임
        // 다시 세팅하므로(하이라이터·컨투어는 안 건드리지만 일관성 위해 함께 재적용).
        void ReassertMaskOverrides()
        {
            for (var slot = 0; slot < _maskOverrides.Length; slot++)
                if (_maskOverrides[slot] != null)
                    _material.SetTexture(MaskSlotIds[slot], _maskOverrides[slot]);
        }

        /// <summary>
        /// 질감 맵 임포트(#22) — 픽셀별 광 지도(R 광게인·G 시머밀도)로 부위 마감을 변조.
        /// 립·아이섀도·블러셔 3부위(#21 제형 스튜디오와 동일 대상). 부위별로 소유 렌더러가
        /// 다르므로(립=LipRenderer, 아이섀도=IrisRenderer, 블러셔=FaceMakeup 머티리얼) 여기서
        /// 라우팅한다(set*Style 라우팅 선례). 빈 경로 = 맵 해제(스칼라 균일 복원, 하위호환).
        /// straight 텍스처라 판정 없이 로드(#20 모양 마스크와 다름).
        /// </summary>
        void SetTextureMapFromFile(string region, string path)
        {
            switch (region)
            {
                case "lip":
                    if (LipRenderer.Instance != null) LipRenderer.Instance.SetFinishMapFromFile(path);
                    break;
                case "eyeshadow":
                    if (IrisRenderer.Instance != null) IrisRenderer.Instance.SetEyeshadowFinishMapFromFile(path);
                    break;
                case "blush":
                    SetBlushFinishMap(path);
                    break;
                default:
                    NativeBridge.Send(new UnityToRNMessage
                    { type = "error", message = $"지원하지 않는 질감 맵 부위: {region}" });
                    break;
            }
        }

        // 블러셔 광 지도 — FaceMakeup 머티리얼 슬롯(컨트롤러 소유). ApplyTo가 이 슬롯을
        // 매 프레임 건드리지 않으므로(마스크와 달리) 재적용 불필요 — 한 번 걸면 유지된다.
        void SetBlushFinishMap(string path)
        {
            if (_material == null) return;
            if (string.IsNullOrEmpty(path))
            {
                if (_blushFinishMap != null) { Destroy(_blushFinishMap); _blushFinishMap = null; }
                _material.SetTexture(BlushFinishMapId, Texture2D.whiteTexture);
                _material.SetFloat(BlushHasFinishMapId, 0f);
                return;
            }
            if (!ImageFileLoader.TryLoad(path, out var tex, out var error))
            {
                NativeBridge.Send(new UnityToRNMessage
                { type = "error", message = $"블러셔 질감 맵 임포트 실패: {error}" });
                return;
            }
            if (_blushFinishMap != null) Destroy(_blushFinishMap);
            _blushFinishMap = tex;
            _material.SetTexture(BlushFinishMapId, tex);
            _material.SetFloat(BlushHasFinishMapId, 1f);
        }

        static Texture2D DefaultMask(int slot) => (MaskRegion)slot switch
        {
            MaskRegion.Highlight => MaskGenerator.HighlightMask,
            MaskRegion.Contour => MaskGenerator.ContourMask,
            _ => MaskGenerator.BlushMask,
        };

        static bool TryMaskRegion(string region, out int slot, out string label)
        {
            switch (region)
            {
                case "blush": slot = (int)MaskRegion.Blush; label = "블러셔"; return true;
                case "highlighter": slot = (int)MaskRegion.Highlight; label = "하이라이터"; return true;
                case "contour": slot = (int)MaskRegion.Contour; label = "컨투어/섀딩"; return true;
                default: slot = -1; label = null; return false;
            }
        }

        /// <summary>
        /// 캐노니컬 오버레이 N장 합성(설계 섹션 07 블로커 스파이크).
        /// 배열 순서 = 그리기 순서(뒤 원소가 위). 경로가 같은 슬롯은 재로드하지
        /// 않아 강도/배치 슬라이더 드래그가 파일 IO 없이 돈다.
        /// </summary>
        /// <summary>현재 오버레이 레이어(캐노니컬 배치) — 핏 핸들(A17)이 데코 겹 앵커로 읽는다.</summary>
        public static OverlayLayerParams[] CurrentOverlayLayers { get; private set; }

        void SetOverlayLayers(OverlayLayerParams[] layers)
        {
            CurrentOverlayLayers = layers;
            if (_material == null) return;
            var count = layers != null ? layers.Length : 0;
            if (count > MaxOverlayLayers)
            {
                NativeBridge.Send(new UnityToRNMessage
                {
                    type = "error",
                    message = $"얼굴 룩 레이어는 최대 {MaxOverlayLayers}장까지입니다 (초과분 무시).",
                });
                count = MaxOverlayLayers;
            }

            for (var slot = 0; slot < MaxOverlayLayers; slot++)
            {
                var layer = slot < count ? layers[slot] : null;
                if (layer == null || string.IsNullOrEmpty(layer.path))
                {
                    ClearOverlaySlot(slot);
                    continue;
                }

                Texture2D tex;
                if (layer.path == ImageFileLoader.BuiltinDotPath)
                {
                    tex = ImageFileLoader.SoftDotTexture; // 내장 공유 — 로드/소유 없음
                }
                else
                {
                    tex = _overlayTexes[slot];
                    if (layer.path != _overlayPaths[slot] || tex == null)
                    {
                        if (!ImageFileLoader.TryLoadDecal(
                                layer.path, FaceOverlayMinTransparent, out tex, out var error))
                        {
                            NativeBridge.Send(new UnityToRNMessage
                            { type = "error", message = $"레이어 {slot + 1} 임포트 실패: {error}" });
                            ClearOverlaySlot(slot);
                            continue;
                        }
                    }
                }

                // JsonUtility 생략 필드 = 0 — 크기 0은 퇴화이므로 캔버스 전체(1)로 보정.
                var scale = layer.scale <= 0f ? 1f : layer.scale;
                SetOverlaySlot(slot, tex, layer.path,
                    new Vector4(layer.x, layer.y, scale, layer.rotation * Mathf.Deg2Rad),
                    layer.intensity, layer.blendMode, layer.color, layer.finish);
            }
        }

        // 슬롯에 텍스처를 얹는다(이전 소유 텍스처 파기). transform=(중심x, 중심y, 크기, 회전rad).
        void SetOverlaySlot(int slot, Texture2D tex, string path, Vector4 transform,
                            float intensity, float blend, string colorHex, int finish)
        {
            if (_overlayTexes[slot] != null && _overlayTexes[slot] != tex) Destroy(_overlayTexes[slot]);
            // 내장 공유 텍스처(builtin:dot)는 소유하지 않는다 — Clear/Destroy 시 파기 금지.
            _overlayTexes[slot] = tex == ImageFileLoader.SoftDotTexture ? null : tex;
            _overlayPaths[slot] = path;
            _material.SetTexture(OverlayTexIds[slot], tex);
            _material.SetVector(OverlayTransformIds[slot], transform);
            _material.SetFloat(OverlayIntensityIds[slot], Mathf.Clamp01(intensity));
            _material.SetFloat(OverlayBlendIds[slot], Mathf.Clamp(blend, 0f, 2f)); // 2=네온 발광(§5)
            var color = Color.white; // 빈 값 = 흰색 = 텍스처 원본색
            if (!string.IsNullOrEmpty(colorHex)) ColorUtility.TryParseHtmlString(colorHex, out color);
            _material.SetColor(OverlayColorIds[slot], color);
            _material.SetFloat(OverlayFinishIds[slot], Mathf.Clamp(finish, 0, 2)); // 0새틴/1매트/2듀이
        }

        void ClearOverlaySlot(int slot)
        {
            if (_overlayTexes[slot] != null) Destroy(_overlayTexes[slot]);
            _overlayTexes[slot] = null;
            _overlayPaths[slot] = null;
            _material.SetTexture(OverlayTexIds[slot], ImageFileLoader.ClearTexture);
            _material.SetVector(OverlayTransformIds[slot], OverlayIdentity);
            _material.SetFloat(OverlayIntensityIds[slot], 0f);
            _material.SetFloat(OverlayBlendIds[slot], 0f);
            _material.SetColor(OverlayColorIds[slot], Color.white);
            _material.SetFloat(OverlayFinishIds[slot], 0f); // 새틴=항등(빈 슬롯 리셋)
        }

        void OnDestroy()
        {
            for (var slot = 0; slot < MaxOverlayLayers; slot++)
                if (_overlayTexes[slot] != null) Destroy(_overlayTexes[slot]);
            for (var slot = 0; slot < _maskOverrides.Length; slot++)
                if (_maskOverrides[slot] != null) Destroy(_maskOverrides[slot]);
            if (_blushFinishMap != null) Destroy(_blushFinishMap);
        }

        void ApplyCalibration(CalibrationParams p)
        {
            if (p == null) return;

            var mesh = CanonicalFaceMesh.Instance;
            var source = FaceLandmarkSource.Instance;
            if (mesh == null && source == null)
            {
                NativeBridge.Send(new UnityToRNMessage
                {
                    type = "error",
                    message = "캘리브레이션은 MediaPipe 경로에서만 적용됩니다.",
                });
                return;
            }

            if (mesh != null) mesh.ApplyCalibration(p);
            if (source != null) source.rotationOverride = p.rotationDegrees;

            // 시간 동기 경로에서는 표시 매핑도 캘리브레이션 대상:
            // Y플립 버튼 → 셀피 미러, 행렬 버튼(0/1/2) → 표시 회전(0°/90°/180°)
            if (FramePresenter.Instance != null)
                FramePresenter.Instance.SetCalibration(p.flipY, p.matrixMode);

            // 세그 디버그 오버레이(§11) — CameraFeed 위 채널 컬러(debugMesh와 같은 검증 UI 계열).
            if (SegmentationSource.Instance != null)
                SegmentationSource.Instance.SetDebug(p.debugSeg);

            // L2 립/눈 영역 마스크 — 실효 소비자가 없어 기본 비활성. 같은 검증 토글
            // (debugSeg)이 켜진 동안만 프레임당 래스터한다(RegionMaskSource 주석 참조).
            if (RegionMaskSource.Instance != null)
                RegionMaskSource.Instance.SetEnabled(p.debugSeg);

        }

        static void ApplyTo(Material mat, FilterParams p)
        {
            mat.SetFloat(SmoothingId, Mathf.Clamp01(p.skinSmoothing));
            mat.SetFloat(BrighteningId, Mathf.Clamp01(p.skinBrightening));
            // 세그 확장(①이마·목 스무딩 ②헤어 염색) — CameraFeed.shader가 소비하는 전역.
            // _SegOn=0이면 셰이더가 블록째 건너뛰므로 여기선 값만 기록한다.
            Shader.SetGlobalFloat(SkinSmoothExtId, Mathf.Clamp01(p.skinSmoothingExtended));
            // 그레인(매트 파우더 입자감) — 전역 1회. 전 부위 마감이 공유(0=무변조).
            Shader.SetGlobalFloat(MatteGrainId, Mathf.Clamp01(p.matteGrain));
            Shader.SetGlobalFloat(HairTintIntensityId, Mathf.Clamp01(p.hairTintIntensity));
            // 헤어 염색 마감 — 전역(CameraFeed 소비). 0=새틴=기존 출력(하위호환).
            Shader.SetGlobalFloat(HairFinishId, p.hairFinish);
            // 헤어 존(W6) — 전역(CameraFeed 소비). 0=전체=기존 출력(하위호환).
            Shader.SetGlobalFloat(HairShapeId, p.hairShape);
            if (!string.IsNullOrEmpty(p.hairTintColor) &&
                ColorUtility.TryParseHtmlString(p.hairTintColor, out var hairTint))
                Shader.SetGlobalColor(HairTintColorId, hairTint);
            mat.SetFloat(BlushIntensityId, Mathf.Clamp01(p.blushIntensity));
            SetColor(mat, BlushColorId, p.blushColor);
            mat.SetFloat(BlushTextureId, p.blushTexture); // 제형(텍스처) W1 — 0=크림=현행
            mat.SetFloat(BlushFinishId, p.blushFinish);
            mat.SetFloat(BlushShimmerId, Mathf.Clamp01(p.blushShimmer));
            // 블러셔 배치 핸들(R4) — 오프셋은 0=원래라 생략 필드와 정합.
            mat.SetFloat(BlushLiftId, Mathf.Clamp(p.blushLift, -0.15f, 0.15f));
            mat.SetFloat(BlushSpreadId, Mathf.Clamp(p.blushSpread, -0.15f, 0.15f));
            // 제형 스튜디오(#21) — 블러셔 마감 세부(전부 0=미지정=enum 기존 동작).
            mat.SetFloat(BlushGlossLoId, Mathf.Clamp01(p.blushGlossLo));
            mat.SetFloat(BlushGlossGainId, Mathf.Clamp01(p.blushGlossGain));
            mat.SetFloat(BlushShimmerSizeId, Mathf.Clamp01(p.blushShimmerSize));
            mat.SetFloat(BlushShimmerDensityId, Mathf.Clamp01(p.blushShimmerDensity));
            mat.SetFloat(BlushMatteId, Mathf.Clamp01(p.blushMatte));
            // 벨벳 시(④) — sheen도 마감 세부 합 게이트(customAmt)에 포함되나 항이 sheen에
            // 선형이라 0=무효=바이트 동일.
            mat.SetFloat(BlushSheenId, Mathf.Clamp01(p.blushSheen));
            // 재질 아키타입(벨벳/메탈/홀로) — 0=없음(기본)이라 생략 필드와 정합(무변조).
            mat.SetFloat(BlushMaterialId, Mathf.Clamp(p.blushMaterial, 0, 3));
            mat.SetFloat(BlushMaterialStrengthId, Mathf.Clamp01(p.blushMaterialStrength));
            // 입자 레이어(7축) — density=0=끔(생략 필드와 정합, 무변조).
            mat.SetFloat(BlushParticleSizeId, Mathf.Clamp01(p.blushParticleSize));
            mat.SetFloat(BlushParticleDensityId, Mathf.Clamp01(p.blushParticleDensity));
            mat.SetFloat(BlushParticleBrightnessId, Mathf.Clamp01(p.blushParticleBrightness));
            SetColor(mat, BlushParticleColorId, p.blushParticleColor);
            mat.SetFloat(BlushParticleTwinkleId, Mathf.Clamp01(p.blushParticleTwinkle));
            mat.SetFloat(BlushParticleShapeId, Mathf.Clamp01(p.blushParticleShape));
            mat.SetFloat(BlushParticleFeatherId, Mathf.Clamp01(p.blushParticleFeather));
            mat.SetFloat(BlushParticleParallaxId, Mathf.Clamp01(p.blushParticleParallax));
            mat.SetFloat(BlushParticleConfettiId, Mathf.Clamp01(p.blushParticleConfetti));
            // 모양 프리셋(AXIS 02) — 마스크는 (모양, softness 버킷)별 캐시라 매 호출 비용 없음.
            // A14 재베이크(배치 A ③) — softness 0이면 버킷 0 = 기존 마스크(하위호환).
            mat.SetTexture(BlushMaskId, MaskGenerator.BlushShapeMask(p.blushShape, p.blushEdgeSoftness));
            // AURA 존별 입력은 렌더 경로를 늘리지 않고 정본의 단일 강도로 승격한다.
            var legacyHighlight = Mathf.Max(p.highlightIntensity,
                Mathf.Max(Mathf.Max(p.highlightCheekIntensity, p.highlightNoseBridgeIntensity),
                    Mathf.Max(Mathf.Max(p.highlightNoseTipIntensity, p.highlightBrowBoneIntensity),
                        p.highlightCupidIntensity)));
            mat.SetFloat(HighlightIntensityId, Mathf.Clamp01(legacyHighlight));
            SetColor(mat, HighlightColorId, p.highlightColor);
            // 제형(텍스처) GENERIC — 0=크림=현행(하위호환).
            mat.SetFloat(HighlightTextureId, p.highlightTexture);
            // 마감 — 블러셔와 동일 enum. 생략(0)=새틴=기존 출력(하위호환).
            mat.SetFloat(HighlightFinishId, p.highlightFinish);
            mat.SetFloat(HighlightShimmerId, Mathf.Clamp01(p.highlightShimmer));
            // 제형 스튜디오(#21) 세부 — 전부 0 = enum 기존 동작.
            mat.SetFloat(HighlightGlossLoId, Mathf.Clamp01(p.highlightGlossLo));
            mat.SetFloat(HighlightGlossGainId, Mathf.Clamp01(p.highlightGlossGain));
            mat.SetFloat(HighlightShimmerSizeId, Mathf.Clamp01(p.highlightShimmerSize));
            mat.SetFloat(HighlightShimmerDensityId, Mathf.Clamp01(p.highlightShimmerDensity));
            mat.SetFloat(HighlightMatteId, Mathf.Clamp01(p.highlightMatte));
            mat.SetFloat(HighlightSheenId, Mathf.Clamp01(p.highlightSheen));
            mat.SetFloat(ContourIntensityId, Mathf.Clamp01(p.contourIntensity));
            SetColor(mat, ContourColorId, p.contourColor);
            // 제형(텍스처) GENERIC — 0=크림=현행(하위호환).
            mat.SetFloat(ContourTextureId, p.contourTexture);
            mat.SetFloat(ContourFinishId, p.contourFinish);
            mat.SetFloat(ContourShimmerId, Mathf.Clamp01(p.contourShimmer));
            mat.SetFloat(ContourGlossLoId, Mathf.Clamp01(p.contourGlossLo));
            mat.SetFloat(ContourGlossGainId, Mathf.Clamp01(p.contourGlossGain));
            mat.SetFloat(ContourShimmerSizeId, Mathf.Clamp01(p.contourShimmerSize));
            mat.SetFloat(ContourShimmerDensityId, Mathf.Clamp01(p.contourShimmerDensity));
            mat.SetFloat(ContourMatteId, Mathf.Clamp01(p.contourMatte));
            mat.SetFloat(ContourSheenId, Mathf.Clamp01(p.contourSheen));
            // 부위 핏 아핀(배치 A ②) — 하이라이터·컨투어 UV 오프셋(블러셔와 동일 ±0.15 클램프, 0=원래).
            mat.SetFloat(HighlightLiftId, Mathf.Clamp(p.highlightLift, -0.15f, 0.15f));
            mat.SetFloat(HighlightSpreadId, Mathf.Clamp(p.highlightSpread, -0.15f, 0.15f));
            mat.SetFloat(ContourLiftId, Mathf.Clamp(p.contourLift, -0.15f, 0.15f));
            mat.SetFloat(ContourSpreadId, Mathf.Clamp(p.contourSpread, -0.15f, 0.15f));
            // A14 재베이크(배치 A ③) — 하이라이터·컨투어 마스크를 softness 버킷으로 재-세팅
            // (highlight/contour는 CreateMaterial 1회 세팅뿐이라 여기서 확장). 임포트 오버라이드는
            // ApplyTo 뒤 ReassertMaskOverrides가 복원하므로 순서상 자동 정합. softness 0=버킷 0=기존.
            mat.SetTexture(HighlightMaskId, MaskGenerator.HighlightShapeMask(p.highlightEdgeSoftness));
            mat.SetTexture(ContourMaskId, MaskGenerator.ContourShapeMask(p.contourEdgeSoftness));
            // 컨실러 — FaceMakeup 머티리얼은 붉은기 자동(shape=1)만 소비한다. 눈밑
            // 존(shape=0)은 아래 하안검 밴드로 라우팅(§08). Color/Intensity/Shape는
            // shape=1 경로가 그대로 쓰므로 항상 세팅(shape=0이면 셰이더가 셀렉터 0으로 무효).
            mat.SetFloat(ConcealerIntensityId, Mathf.Clamp01(p.concealerIntensity));
            SetColor(mat, ConcealerColorId, p.concealerColor);
            // 컨실러 마감(붉은기 자동 경로) — 0=새틴=기존 출력. 눈밑존은 아래 밴드가 같은 값 공용.
            mat.SetFloat(ConcealerFinishId, p.concealerFinish);
            // 제형(텍스처) GENERIC — 붉은기 경로. 눈밑존 밴드와 같은 concealerTexture 값 공유.
            mat.SetFloat(ConcealerTextureId, p.concealerTexture);
            // 축 개선(#19b) — 부분 커버 모양(0=눈밑 1=붉은기 자동)·파우더 존(0=전체 1=T존 2=볼 제외).
            // 생략(JsonUtility 0) = 기존 동작. FaceMakeup.shader가 float 분기.
            mat.SetFloat(ConcealerShapeId, p.concealerShape);
            // 잡티 지우기(밀어내기) — 피부 경로 outlier 억제(붉은기 커버·컨실 강도와 독립). 0=현행 픽셀 동일.
            mat.SetFloat(BlemishRemovalId, Mathf.Clamp01(p.blemishRemoval));
            mat.SetFloat(PowderShapeId, p.powderShape);
            // 모양 축 W3 피부 존(얼굴 메시 전용) — 0=전체=현행. 존만큼 강도 곱(셰이더).
            mat.SetFloat(ToneShapeId, p.toneShape);
            mat.SetFloat(SkinShapeId, p.skinShape);
            mat.SetFloat(FoundationShapeId, p.foundationShape);
            // 베이스 팩(#18) — 윤광·파우더는 머티리얼 전용.
            // 톤 보정색: ""=무색은 공유 머티리얼에 이전 룩 톤색이 남지 않도록 흰색 명시 복원
            // (SetColor는 빈 문자열에 무동작 → 스테일 유출, 적대 리뷰 confirmed).
            if (string.IsNullOrEmpty(p.toneBaseColor))
                mat.SetColor(ToneBaseColorId, Color.white);
            else
                SetColor(mat, ToneBaseColorId, p.toneBaseColor);
            mat.SetFloat(SkinGlowId, Mathf.Clamp01(p.skinGlow));
            // 제형(텍스처) — 언더톤·피부결(TONE 템플릿 grain만). 0=매끈=현행(하위호환).
            mat.SetFloat(ToneTextureId, p.toneTexture);
            mat.SetFloat(SkinTextureId, p.skinTexture);
            mat.SetFloat(PowderIntensityId, Mathf.Clamp01(p.powderIntensity));
            // 컬러 파우더: ""=무색 — 톤 보정색과 동일하게 흰색 명시 복원(스테일 유출 방지).
            if (string.IsNullOrEmpty(p.powderColor))
                mat.SetColor(PowderColorId, Color.white);
            else
                SetColor(mat, PowderColorId, p.powderColor);
            mat.SetFloat(PowderFinishId, p.powderFinish);
            mat.SetFloat(PowderShimmerId, Mathf.Clamp01(p.powderShimmer));
            // 제형(텍스처) GENERIC — 0=크림=현행(하위호환). 매트화 프리미티브라 cov/edge/grain만.
            mat.SetFloat(PowderTextureId, p.powderTexture);
            // 파운데이션 — 얼굴 메시(머티리얼) + 이마·목 세그 확장(전역, CameraFeed 소비).
            mat.SetFloat(FoundationIntensityId, Mathf.Clamp01(p.foundationIntensity));
            mat.SetFloat(FoundationFinishId, p.foundationFinish);
            // 제형 텍스처(배치 A ①) — 0=리퀴드(기존). 얼굴 메시(mat) + 이마·목 세그(전역) 둘 다 미러.
            mat.SetFloat(FoundationTextureId, p.foundationTexture);
            SetColor(mat, FoundationColorId, p.foundationColor);
            Shader.SetGlobalFloat(FoundationIntensityId, Mathf.Clamp01(p.foundationIntensity));
            Shader.SetGlobalFloat(FoundationFinishId, p.foundationFinish);
            Shader.SetGlobalFloat(FoundationTextureId, p.foundationTexture);
            if (!string.IsNullOrEmpty(p.foundationColor) &&
                ColorUtility.TryParseHtmlString(p.foundationColor, out var foundationTint))
                Shader.SetGlobalColor(FoundationColorId, foundationTint);
            // 임시 디버그(파운데 색 튜닝) — Foundation.cginc 전역 유니폼 push. RN이 항상 유효값을
            // 실어 보내므로(기본=옛 #define 상수) 슬라이더를 안 건드리면 현재 픽셀과 동일.
            Shader.SetGlobalFloat(FndRefLumaDbgId, p.fndRefLumaDbg);
            Shader.SetGlobalFloat(FndLumaGainDbgId, p.fndLumaGainDbg);
            Shader.SetGlobalFloat(FndChromaDbgId, p.fndChromaDbg);
            // 임시 디버그(이음새 세그 게이트) — CameraFeed 전역 유니폼 push. RN이 항상 유효값을
            // 실어 보내며(임계 기본=현 셰이더 리터럴, 토글=0) 안 건드리면 현재 픽셀과 동일.
            Shader.SetGlobalFloat(SegSeamDbgId, p.segSeamDbg);
            Shader.SetGlobalFloat(FndSegLoDbgId, p.fndSegLoDbg);
            Shader.SetGlobalFloat(FndSegHiDbgId, p.fndSegHiDbg);
            Shader.SetGlobalFloat(FndOvalSizeDbgId, p.fndOvalSizeDbg);
            Shader.SetGlobalFloat(FndOvalFeatherDbgId, p.fndOvalFeatherDbg);
            mat.SetFloat(MakeupOverlayIntensityId, Mathf.Clamp01(p.faceOverlayIntensity));

            // 립·눈 오버레이는 별도 메시/머티리얼(윤곽 링·랜드마크 오버레이)이 소유한다.
            // 기동 초기(CreateMaterial)엔 아직 없을 수 있어 널가드.
            if (LipRenderer.Instance != null)
            {
                // R2 그라데 스톱B·강도 + 제형 텍스처(①) + 모양 실루엣(W4) — 시그니처 확장(립은 개별 인자 경유라 최소 침습).
                LipRenderer.Instance.ApplyLipParams(p.lipColor, p.lipIntensity, p.lipFinish, p.lipShimmer, p.lipOverline,
                    p.lipColor2, p.lipGradient, p.lipTexture, p.lipShape);
                LipRenderer.Instance.ApplyLinerParams(p.lipLinerColor, p.lipLinerIntensity, p.lipLinerFinish, p.lipLinerWidth, p.lipLinerTexture, p.lipLinerShape);
                // 베이스립(맨 아래 누드 캔버스)·립글로스(맨 위 광 톱코트) — 색·강도·마감·제형·모양 독립(0=끔/새틴/크림/전체).
                LipRenderer.Instance.ApplyLipBase(p.lipBaseColor, p.lipBaseIntensity, p.lipBaseFinish, p.lipBaseOverline, p.lipBaseTexture, p.lipBaseShape);
                LipRenderer.Instance.ApplyLipGloss(p.lipGlossColor, p.lipGlossIntensity, p.lipGlossFinish, p.lipGlossOverline, p.lipGlossTexture, p.lipGlossShape);
                // 제형 스튜디오(#21) — 립 마감 세부(전부 0=미지정=enum 기존 동작).
                LipRenderer.Instance.ApplyLipFinish(p.lipGlossLo, p.lipGlossGain,
                    p.lipShimmerSize, p.lipShimmerDensity, p.lipMatte, p.lipSheen);
                // 재질 아키타입(벨벳/메탈/홀로) — 0=없음(무변조 하위호환).
                LipRenderer.Instance.ApplyLipMaterial(p.lipMaterial, p.lipMaterialStrength);
                // 입자 레이어(글리터) — density 0=끔.
                LipRenderer.Instance.ApplyLipParticle(p.lipParticleSize, p.lipParticleDensity,
                    p.lipParticleBrightness, p.lipParticleColor, p.lipParticleTwinkle,
                    p.lipParticleShape, p.lipParticleFeather, p.lipParticleParallax, p.lipParticleConfetti);
            }
            if (LipStyleRenderer.Instance != null)
                LipStyleRenderer.Instance.ApplyParams(p.lipStyleIntensity, p.lipStyleSparkle);
            if (BlushStyleRenderer.Instance != null)
                BlushStyleRenderer.Instance.ApplyParams(p.blushStyleIntensity, p.blushStyleSparkle);
            if (BrowRenderer.Instance != null)
                BrowRenderer.Instance.ApplyBrowParams(p);
            // R7 두께/아치 + 모양(#19b)은 세 눈썹 제품(마스카라 밴드·펜슬·스타일)이 공유(제품 동조).
            if (PencilRenderer.Instance != null)
                PencilRenderer.Instance.ApplyPencilParams(
                    p.browPencilColor, p.browPencilIntensity, p.browThickness, p.browArch, p.browShape, p.browPencilFinish, p.browPencilTexture);
            if (StyleRenderer.Instance != null)
                StyleRenderer.Instance.ApplyStyleParams(
                    p.browStyleColor, p.browStyleIntensity, p.browThickness, p.browArch, p.browShape, p.browStyleFinish, p.browStyleTexture);
            if (EyelinerStyleRenderer.Instance != null)
                EyelinerStyleRenderer.Instance.ApplyParams(
                    p.eyelinerColor, p.eyelinerStyleIntensity, p.eyeCornerLift);
            // 하안검 밴드 — 애교살(구 캐노니컬 마스크에서 이관) + 아이라인(하, 색은 라이너 공용).
            if (LowerLidRenderer.Instance != null)
            {
                LowerLidRenderer.Instance.ApplyParams(
                    p.aegyoIntensity, p.eyelinerColor, p.eyelinerLowerIntensity, p.eyeCornerLift,
                    p.aegyoHeight, p.aegyoStyleIntensity, p.aegyoColor,
                    p.aegyoFinish, p.aegyoShimmer, p.eyelinerLowerThickness, p.eyelinerLowerFinish, p.aegyoTexture,
                    p.aegyoShape, p.eyelinerLowerSegment);
                // 삼각존(#19b) — 같은 하안검 밴드의 꼬리 쪽 삼각 음영(색·강도·마감·제형·모양 독립, 0=끔/새틴/크림/기본).
                LowerLidRenderer.Instance.ApplyTriangleZone(
                    p.triangleZoneColor, p.triangleZoneIntensity, p.triangleZoneFinish, p.triangleZoneHeight, p.triangleZoneTexture, p.triangleZoneShape);
                // 눈밑 컨실러(§08) — shape=0만 밴드로 브라이튼(언더아이 홀로우). shape=1
                // (붉은기 자동)은 FaceMakeup 전담이라 밴드 강도 0으로 눌러 이중 적용 방지.
                var ccBand = p.concealerShape < 0.5f ? p.concealerIntensity : 0f;
                LowerLidRenderer.Instance.ApplyConcealer(p.concealerColor, ccBand, p.concealerFinish, p.concealerTexture);
                // A3 아이섀도 하 — 하안검 lash 아래로 페이드하는 섀도 밴드(애교살보다 아래 깔림). 0=끔.
                LowerLidRenderer.Instance.ApplyLowerShadow(
                    p.eyeshadowLowerColor, p.eyeshadowLowerIntensity,
                    p.eyeshadowLowerFinish, p.eyeshadowLowerShimmer, p.eyeshadowLowerHeight, p.eyeshadowLowerTexture,
                    p.eyeshadowLowerShape);
            }
            // 쌍꺼풀 크리스(#19b) — 상안검 위 얇은 음영(색은 자연 음영 고정, 강도 0=끔).
            if (DoubleLidRenderer.Instance != null)
                DoubleLidRenderer.Instance.ApplyDoubleLid(p.doubleLidIntensity, p.doubleLidHeight, p.doubleLidFinish, p.doubleLidShape);
            // 튜토리얼 가이드(#2) — 존 모양이 현재 룩의 핏(애교살 두께·섀도 높이·윙 길이)을 추종.
            if (StencilGuideRenderer.Instance != null)
                StencilGuideRenderer.Instance.ApplyLookShapes(p);
            // 마스카라 — 속눈썹 스트로크. 눈꼬리 리프트를 라이너·섀도와 공유.
            // 아래 속눈썹은 같은 렌더러의 분기 — 색 공용(mascaraColor), 강도·길이 독립.
            if (LashRenderer.Instance != null)
            {
                LashRenderer.Instance.ApplyParams(
                    p.mascaraColor, p.mascaraIntensity, p.eyeCornerLift, p.mascaraLength,
                    p.mascaraStyle, p.mascaraFinish);
                LashRenderer.Instance.ApplyLowerParams(
                    p.mascaraColor, p.lowerLashIntensity, p.lowerLashLength,
                    p.lowerLashStyle, p.lowerMascaraFinish);
            }
            // 치아 미백 — 내측 립 링 폴리곤(입 열림 추종, 다물면 자동 무효과).
            if (TeethRenderer.Instance != null)
                TeethRenderer.Instance.ApplyParams(p.teethWhitenIntensity, p.teethFinish, p.teethShape);
            // 눈 파라미터 일괄 라우팅(FilterParams 통째) — 홍채, 아이라이너
            // 질감(eyelinerTexture)/부분(eyelinerSegment)/마감(eyelinerFinish), 아이섀도.
            if (IrisRenderer.Instance != null) IrisRenderer.Instance.ApplyEyeParams(p);
            // 얼굴형 보정 워프 — 눈확대 + 턱 5종(끝/너비/길이/하관/사각턱) 공유 필드.
            if (FaceWarpField.Instance != null)
                FaceWarpField.Instance.ApplyParams(p);
        }

        static void SetColor(Material mat, int propertyId, string hex)
        {
            if (!string.IsNullOrEmpty(hex) && ColorUtility.TryParseHtmlString(hex, out var color))
                mat.SetColor(propertyId, color);
        }

        void SetPaused(bool paused)
        {
            if (_session == null) _session = FindAnyObjectByType<ARSession>();
            if (_session != null) _session.enabled = !paused;
        }

        void SetCamera(string facing)
        {
            if (_cameraManager == null || string.IsNullOrEmpty(facing)) return;

#if !MEDIAPIPE && UNITY_IOS
            // ARKit 얼굴 트래킹 폴백은 전면(TrueDepth) 전용 — 후면 전환은 MediaPipe 설치 후 가능
            if (facing == "rear")
            {
                NativeBridge.Send(new UnityToRNMessage
                {
                    type = "error",
                    message = "후면 카메라는 MediaPipe 설치 후 지원됩니다 (scripts/setup-mediapipe.sh).",
                });
                return;
            }
#endif
            var userFacing = facing != "rear";
            _cameraManager.requestedFacingDirection =
                userFacing ? CameraFacingDirection.User : CameraFacingDirection.World;

            if (FramePresenter.Instance != null)
                FramePresenter.Instance.SetUserFacing(userFacing); // 후면은 미러 없음
        }

        void Update()
        {
            if (_isTracked == null) return;

            var tracked = _isTracked();
            if (tracked != _lastTracked)
            {
                _lastTracked = tracked;
                NativeBridge.Send(new UnityToRNMessage { type = "faceTracked", tracked = tracked });
            }
        }
    }
}
