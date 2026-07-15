using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using ARMakeup.Bridge;
using Unity.Collections;
using UnityEngine;
#if UNITY_IOS && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif
#if MEDIAPIPE
using Mediapipe;
using Mediapipe.Tasks.Vision.FaceLandmarker;
using Mediapipe.Unity;
#endif
using Color = UnityEngine.Color;

namespace ARMakeup.Face
{
    /// <summary>
    /// 사진→룩 추출(#1) — 갤러리 레퍼런스 사진 1장에서 부위별 색을 온디바이스로 측정해
    /// RN에 "숫자"(LookMeasurement)만 넘긴다. RN이 measurementToLook로 컴포저 초안(룩)으로
    /// 번역한다(측정=Unity, 해석=RN 원칙. 네트워크·AI 없음).
    ///
    /// <see cref="MediaEditController"/>의 정지이미지 1회 검출 파이프라인(LoadPhotoUpright→
    /// EXIF 정립 정규화→ImageFileLoader.TryLoad→CapTexture→IMAGE 모드 Detect→ParseResult)을
    /// 선례로 삼는다. 단 라이브 파이프라인을 절대 건드리지 않는다 — 편집 모드처럼 화면을
    /// 뺏지 않고(FaceLandmarkSource.BeginExternalMode 미사용), 디코드한 프레임을 자체 top-first
    /// 버퍼로 만들어 CPU 바이리니어로 직접 샘플링만 하고 사라진다. 라이브 GPU 랜드마커와의
    /// 동시 점유를 피하려 추출용 랜드마커는 CPU delegate를 우선한다(IMAGE 모드, 검출 직후 반납).
    ///
    /// MEDIAPIPE 전용(임의 이미지 랜드마크 필요). 에디터/Android/비MEDIAPIPE에선 error로
    /// 응답한다(라이브 씬은 그대로 돈다). 색은 공막(흰자) 화이트포인트로 그레이월드
    /// 화이트밸런스해 조명 캐스트를 줄이되, raw whitePoint·lightingConf도 함께 실어 RN이
    /// 신뢰도 하향을 판단한다(얼굴분석-설계 §F).
    /// </summary>
    public class LookExtractController : MonoBehaviour
    {
        public static LookExtractController Instance { get; private set; }

        // 색 측정이라 고해상이 불필요 — 긴 변 상한을 낮춰 GetPixels32·Detect 비용을 줄인다.
        const int MaxLongSide = 1400;

        // ── 룩 추출 색 튜닝 상수(처방 A/B/C — 전부 실기기 튜닝 대상) ─────────────────
        // Gamma 색공간 프로젝트라 감마 항등: 여기 값은 순수 선형 스케일·트림 비율이다.
        //
        // 처방 A — 노출(밝기) 정규화. 어두운 사진의 어두운 색을 그대로 보고 전 부위가
        // 어둡게 뽑히는 것이 주범이라, 세 채널 동일 배율로 리프트(hue 불변, 밝기만 상승).
        // 노출 기준은 우선순위: ① 흰자(공막) 검출 신뢰 시 whiteLuma, ② 아니면 피부 luma.
        // 흰자 검출이 실기기서 자주 실패(lightingConf 0.3 폴백)하므로 피부 폴백이 필수.
        const float ExposureWhiteConfMin = 0.5f;     // 이 이상 lightingConf면 흰자 기준(공막 신뢰). 미만이면 피부 폴백.
        const float ExposureTargetWhiteLuma = 0.85f; // 잘 노출된 공막의 목표 luma(순백 근처, 약간 여유 둠).
        const float ExposureTargetSkinLuma = 0.62f;  // 잘 노출된 중간 피부톤 목표 luma(보수적 — 피부톤 편차 감안 과보정 방지).
        const float ExposureRefLumaFloor = 0.15f;    // 기준 luma 하한(근-암부에서 0 나눗셈·과증폭 폭주 방지).
        const float ExposureMax = 2.0f;              // 노출 스케일 상한(하이라이트 클리핑·노이즈 증폭 방어).
        //
        // 처방 C — 립·아이섀도 샘플을 그림자에서 선명한 쪽으로(어두운 표본이 색을 탁·암하게 만듦).
        const float LipTrimLo = 0.40f;   // 립 명도 트림 하한(기존 0.2 → 0.4: 입 틈·치아경계 그림자 상향 배제).
        const float LipTrimHi = 0.95f;   // 립 명도 트림 상한(기존 0.8 → 0.95: 조명 받은 선명한 버밀리언 포함).
        const float EyeshadowMidT = 0.2f; // 상안검↔눈썹아래 보간 t(기존 0.35 → 0.2: 소켓 그림자에서 리드 쪽으로).
        //
        // 처방 D(눈썹) — 색온 보정 감쇠. 눈썹은 채도가 낮은 어두운 털이라, 따뜻한 조명
        // 셀피에서 그레이월드 WB를 온전히 걸면 파랑이 빨강에 근접·역전해 갈색이 '푸른
        // 회색'으로 뜬다(저채도 색의 색상 반전 — 실기기 확인 증상). 밝기(노출)는 유지하되
        // 색온 보정만 이 비율만큼 반영해 눈썹 본래의 따뜻한 갈색 색상을 보존한다.
        const float BrowWbStrength = 0.35f; // 0=WB 무시(노출만) … 1=전량 WB. // 실기기 튜닝 대상

        bool _busy;
        // 개발용: 그레이월드 화이트밸런스 끄기(setExtractDebug로 토글). true면 Measure가 gain을
        // 단위행렬로 두고 raw 색을 반환한다(색 왜곡이 WB 탓인지 원색과 비교). MEDIAPIPE 유무와
        // 무관하게 유지되도록 #if 밖에 둔다(OnMessage도 공통).
        bool _disableWhiteBalance;

#if UNITY_IOS && !UNITY_EDITOR
        // MediaEditor.mm의 같은 네이티브 심볼을 재선언(여러 C#에서 extern 선언 허용).
        [DllImport("__Internal")]
        static extern int armakeupNormalizeImage(string srcPath, string dstPath);
#endif

        void Awake()
        {
            Instance = this;
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
#if MEDIAPIPE
            CloseLandmarker();
            if (_frame.IsCreated) _frame.Dispose();
#endif
        }

        void OnEnable() => NativeBridge.MessageReceived += OnMessage;
        void OnDisable() => NativeBridge.MessageReceived -= OnMessage;

        void OnMessage(RNToUnityMessage msg)
        {
            switch (msg.type)
            {
                case "extractLook": ExtractLook(msg.path); break;
                case "setExtractDebug": _disableWhiteBalance = msg.disableWhiteBalance; break;
            }
        }

#if !MEDIAPIPE
        // MediaPipe 미설치 폴백 — 임의 이미지 랜드마크가 없어 추출 불가.
        void ExtractLook(string path) => NativeBridge.Send(new UnityToRNMessage
        {
            type = "error",
            message = "룩 추출은 MediaPipe 설치 후 지원됩니다 (scripts/setup-mediapipe.sh).",
        });
#else
        FaceLandmarker _landmarker;
        NativeArray<byte> _frame; // 레퍼런스 프레임(top-first RGBA) — Image·CPU 샘플러 공용
        int _frameW, _frameH;
        int _parsedLandmarkCount; // 이번 IMAGE 검출이 실제로 채운 점 수(이전 프레임 잔존값 참조 방지).
        readonly Vector3[] _landmarks = new Vector3[FaceLandmarkSource.LandmarkCount];
        bool _assetReady;

        // ── 부위별 샘플 랜드마크(렌더러 상수 인용) ─────────────────────────────
        // 입술 외곽/내곽 (index 정렬 20쌍) — LipRenderer.LipsOuter/LipsInner.
        static readonly int[] LipsOuter =
            { 61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146 };
        static readonly int[] LipsInner =
            { 78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95 };
        // 광대 사과 좌/우 — BlushStyleRenderer.CheekCenters.
        static readonly int[] CheekCenters = { 50, 280 };
        // 상안검 체인(속눈썹 라인) 좌/우 — IrisRenderer.UpperLids.
        static readonly int[][] UpperLids =
        {
            new[] { 33, 246, 161, 160, 159, 158, 157, 173, 133 },
            new[] { 263, 466, 388, 387, 386, 385, 384, 398, 362 },
        };
        // 눈썹 아치(위/아래) 좌/우 — BrowRenderer.BrowUpper/BrowLower.
        static readonly int[][] BrowUpper =
        {
            new[] { 70, 63, 105, 66, 107 },
            new[] { 300, 293, 334, 296, 336 },
        };
        static readonly int[][] BrowLower =
        {
            new[] { 46, 53, 52, 65, 55 },
            new[] { 276, 283, 282, 295, 285 },
        };
        // 홍채 중심·링 좌/우 — IrisRenderer.IrisCenters/IrisRings.
        static readonly int[] IrisCenters = { 468, 473 };
        static readonly int[][] IrisRings =
        {
            new[] { 469, 470, 471, 472 },
            new[] { 474, 475, 476, 477 },
        };
        // 눈 안/바깥 꼬리 — IrisRenderer.EyeContours의 C_OUTER(0)/C_INNER(8).
        static readonly int[] EyeOuter = { 33, 263 };
        static readonly int[] EyeInner = { 133, 362 };
        // 맨피부 기준 — BrowRenderer.ForeheadSkin(이마) + 턱 점.
        static readonly int[] ForeheadSkin = { 9, 108, 337, 109, 338, 151 };
        static readonly int[] ChinSkin = { 152, 175, 199, 148, 377 };

        // ── 형태 측정 공통 가드(전부 실기기 튜닝 대상) ─────────────────────────
        const float ShapeGeometryEpsilon = 1e-6f; // 정규화·나눗셈이 안전한 최소 길이/가중치.
        const int ShapeSideCount = 2;             // 좌/우 양쪽을 모두 확인해야 하는 부위 수.
        const int FaceUpForeheadLandmark = 10;    // BrowWarp와 같은 안정 얼굴축 상단.
        const int FaceUpChinLandmark = 152;       // BrowWarp와 같은 안정 얼굴축 하단.
        const float ShapeLightingQualityFloor = 0.65f; // 흰자 실패(conf=.3)도 강한 픽셀 증거는 살리고 약한 증거만 감점.

        // 립 마감: 외곽→내곽 밴드 안쪽 3열만 써 치아·입 틈 경계를 피한다.
        static readonly float[] LipFinishInteriorT = { 0.25f, 0.50f, 0.75f };
        const int LipFinishMinSamples = 36;        // 60개 후보 중 이 수 미만이면 가림/프레임 밖으로 간주.
        const float LipFinishMinCoverage = 0.60f;  // 후보 대비 유효 픽셀 비율 하한.
        const float LipPeakLumaLow = 0.55f;        // 이 이하의 절대 peak는 유리광 증거가 약함.
        const float LipPeakLumaHigh = 0.90f;       // 이 정도 peak면 밝은 정반사로 간주.
        const float LipPeakLiftLow = 0.025f;       // median 대비 peak 상승이 이하면 평탄한 매트 후보.
        const float LipPeakLiftHigh = 0.120f;      // median 대비 이 정도 상승이면 국소 광택 후보.
        const float LipLumaStdLow = 0.018f;        // 명도 표준편차가 이하면 균일한 매트 후보.
        const float LipLumaStdHigh = 0.080f;       // 명도 표준편차가 이 정도면 광택 패턴 후보.
        const float LipPeakLiftWeight = 0.65f;     // 조명보다 강건한 상대 peak를 절대 peak보다 우선.
        const float LipAbsolutePeakWeight = 0.35f;
        const float LipSignalAgreementSpan = 0.65f; // peak와 분산 신호 불일치가 이 폭이면 conf=0.
        const float LipDecisionSpan = 0.28f;       // 0.5 주변 이 폭은 glossy/matte 어느 쪽도 불확실.
        const float LipUniformitySupportFloor = 0.85f; // TrimmedSample 보조신호가 약해도 주신호의 85% 보존.
        const float LipGlossNonuniformityLow = 0.05f;  // RGB 비균일도가 이하면 glossy 보조증거 없음.
        const float LipGlossNonuniformityHigh = 0.30f; // 이 정도 비균일도면 glossy 보조증거 충분.
        const float LipMatteUniformityLow = 0.65f;     // RGB uniformity가 이하면 matte 보조증거 없음.
        const float LipMatteUniformityHigh = 0.95f;    // 이 정도 uniformity면 matte 보조증거 충분.
        const float LipGlossNeutral = 0.50f;       // 측정 실패/애매 시 RN이 새틴으로 폴백할 중립값.

        // 블러셔: StencilGuideRenderer.BlushClassic(구운 blush.png 실측 중심)와 동기화.
        // StencilGuideRenderer의 private 배열을 직접 참조하지 않고 캐노니컬 중심만 복제한다.
        static readonly Vector2[] BlushClassicCenters =
        {
            new Vector2(0.277f, 0.468f), new Vector2(0.722f, 0.468f),
        };
        const int BlushGridColumns = 9;            // 중심 주변 수평 소격자 해상도.
        const int BlushGridRows = 7;               // 중심 주변 수직 소격자 해상도.
        const float BlushGridHalfWidth = 0.120f;   // 캐노니컬 UV에서 좌우 탐색 반폭.
        const float BlushGridHalfHeight = 0.090f;  // 캐노니컬 UV에서 상하 탐색 반폭.
        const float BlushLumaDifferenceWeight = 0.20f; // 그림자 오탐을 줄이기 위한 낮은 명도차 가중.
        const float BlushDifferenceFloor = 0.035f; // 피부 노이즈/WB 잔차를 버리는 색차 바닥.
        const float BlushActiveDifference = 0.050f; // 이보다 큰 격자점만 실제 색소 면적으로 집계.
        const int BlushMinActiveSamples = 4;       // 점 하나의 잡티/그림자를 centroid로 오인하지 않는 하한.
        const float BlushMinResolvedFraction = 0.65f; // UV 삼각형/사진 범위가 충분히 해석돼야 함.
        const float BlushMinActiveFraction = 0.08f;   // 탐색 영역의 최소 활성 면적.
        const float BlushStrongActiveFraction = 0.30f; // 이 정도 면적이면 활성도 conf=1.
        const float BlushMinMeanWeight = 0.008f;      // 영역 평균 색차가 이하면 무보정.
        const float BlushStrongMeanWeight = 0.045f;   // 이 정도 평균 색차면 대비 conf=1.
        const float BlushCoverageConfidenceFloor = 0.80f; // 유효 UV가 하한을 넘으면 coverage 감점은 최대 20%.
        const float BlushCheekAnchorMaxDistance = 0.160f; // 투영 중심↔CheekCenters 허용 metric 거리.
        const float BlushSideConsistencyTolerance = 0.055f; // 좌우 hint 차이가 이 폭이면 conf=0.
        const float BlushHintLimit = 0.150f;          // RN 공간 파라미터의 보수적 최대 절대 오프셋.
        const float CanonicalBaryMinimum = -0.001f;   // 경계 삼각형의 작은 수치오차만 허용.

        // 눈썹: BrowWarp.ShapeBand 규약에 맞춘 기하 분류/연속값 튜닝.
        const int BrowPointCount = 5;              // BrowUpper/BrowLower 한쪽의 고정 점 수.
        const int BrowCentralBandFirst = 1;        // 두께는 끝단 테이퍼를 빼고 중앙 3단면만 평균.
        const int BrowCentralBandLast = 3;
        const float BrowNeutralBandAspect = 0.143f; // (중앙 밴드/중심선 아크)의 중립 실측비; 결과 1=실측 밴드.
        const float BrowThicknessMin = 0.50f;      // 비정상 얇은 랜드마크의 영향 상한/하한.
        const float BrowThicknessMax = 1.80f;
        const float BrowMinChordLength = 0.018f;   // 퇴화/가림 눈썹을 거르는 metric 최소 길이.
        const float BrowMinArcToChordRatio = 0.65f; // 심하게 접힌/순서가 무너진 체인 거부.
        const float BrowStraightCurvatureMax = 0.020f; // 거의 평탄한 중앙 높이차만 일자로 확정.
        const float BrowStraightTailRiseMax = 0.035f;  // 꼬리 상승도 작아야 일자(내추럴 오탐 방지).
        const float BrowRisingTailRiseMin = 0.075f;    // 머리 대비 꼬리 높이가 이 이상이면 상승형.
        const float BrowRisingTailAngleMinDeg = 8f;    // 바깥 꼬리 세그먼트가 위로 향하는 최소 각.
        const float BrowArchCurvatureMin = 0.050f;     // 중앙 peak가 이 이상이면 아치 후보.
        const float BrowMoonCurvatureMin = 0.042f;     // 반달도 최소 돔 높이를 요구.
        const float BrowMoonBroadnessMin = 0.58f;      // 양 어깨 높이/중앙 높이 비가 크면 넓은 돔.
        const float BrowMoonTurnMaxDeg = 24f;          // 한 점에 날카로운 꺾임이 없어야 반달.
        const float BrowAngularTurnMinDeg = 30f;       // 국소 최대 회전각이 이 이상이면 각진 후보.
        const float BrowAngularDominanceMinDeg = 8f;  // 두 번째 꺾임보다 한 코너가 뚜렷해야 각진형.
        const float BrowResidualArchStart = 0.060f;    // 프리셋이 만든 peak를 뺀 뒤 남는 아치 시작점.
        const float BrowResidualArchGain = 0.50f;      // 잔차를 band 배수 arch로 옮길 보수적 이득.
        const float BrowArchMax = 0.70f;               // regions.ts browArch 축 상한.
        const float BrowFeatureAgreementSpan = 0.12f; // 좌우 곡률/꼬리 특성 차이 conf 폭.
        const float BrowShapeMismatchPenalty = 0.55f; // 좌우 분류 불일치면 RN 0.6 gate 아래로 감점.
        const float BrowAgreementConfidenceFloor = 0.75f; // 유효 양안의 작은 비대칭은 고신뢰 유지.
        const float BrowSideConfidenceFloor = 0.85f;      // 유효 기하 한쪽의 기본 신뢰도.
        const float BrowStrongChordRatio = 0.95f;         // chord/arc가 이 정도면 체인 품질 conf=1.
        const float BrowThicknessNeutral = 1f;        // 실패 시 BrowWarp 실측 밴드 그대로.
        const int BrowNatural = 0;
        const int BrowStraight = 1;
        const int BrowArch = 2;
        const int BrowAngular = 3;
        const int BrowRising = 4;
        const int BrowMoon = 5;

        // 아이라인: IrisRenderer private EyeContours/스타일 상수를 복제한다. 두 파일 값 변경 시 동기화.
        static readonly int[][] EyelinerEyeContours =
        {
            new[] { 33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7 },
            new[] { 263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249 },
        };
        static readonly float[] EyelinerRendererAngles = { 28f, -22f, 0f };
        static readonly float[] EyelinerRendererBaseTailLengths = { 0.45f, 0.40f, 0.70f };
        const int EyelinerWingUp = 0;
        const int EyelinerPuppy = 1;
        const int EyelinerLong = 2;
        const float EyelinerWingUpAngleMin = 12f;  // 이보다 위 방향이면 윙업.
        const float EyelinerPuppyAngleMax = -10f; // 이보다 아래 방향이면 퍼피.
        const float EyelinerRayMinAngle = -30f;   // 실제 trace 방향을 찾는 보수적 각도 부채꼴.
        const float EyelinerRayMaxAngle = 35f;
        const float EyelinerRayAngleStep = 5f;
        const int EyelinerRaySamples = 29;        // 코너 밖 0.10R~1.50R의 종방향 샘플 수.
        const float EyelinerRayStartRadius = 0.10f;
        const float EyelinerRayEndRadius = 1.50f;
        const int EyelinerCrossTaps = 5;          // 얇은 자취를 놓치지 않는 횡방향 탭 수.
        const float EyelinerCrossHalfWidth = 0.09f; // eyeRadius 대비 횡방향 탐색 반폭.
        const int EyelinerMinDarkCrossTaps = 1;   // 얇은 윙이므로 한 탭을 허용하되 연결성으로 오탐 차단.
        const int EyelinerAllowedGapSamples = 1;  // 리샘플링 한 칸의 단절만 연결 trace로 허용.
        const int EyelinerMinConnectedSamples = 5; // 코너부터 최소 연속 길이(약 0.3R).
        const float EyelinerMinTraceRadius = 0.28f;
        const float EyelinerSkinLumaFloor = 0.18f; // 극저조도에선 상대 darkness 폭주를 막고 미적용.
        const float EyelinerDarkAbsMin = 0.11f;   // 피부 대비 절대 명도차의 높은 오탐 방지 문턱.
        const float EyelinerDarkAbsStrong = 0.24f;
        const float EyelinerDarkRelativeMin = 0.20f; // 피부 명도 대비 상대 darkness 문턱.
        const float EyelinerDarkRelativeStrong = 0.45f;
        const float EyelinerMinMeanStrength = 0.25f; // 문턱을 간신히 넘긴 연결선은 윙으로 확정하지 않음.
        const float EyelinerMeanStrengthFull = 0.80f; // 연결 trace 평균 증거가 이 정도면 strength conf=1.
        const float EyelinerStyleSeparationMin = 1.12f; // 다른 스타일 ray보다 최소 12% 길어야 방향 확정.
        const float EyelinerStyleSeparationStrong = 1.50f;
        const float EyelinerRendererAngleTolerance = 18f; // 분류 방향이 렌더 프리셋 각에서 벗어날 허용폭.
        const float EyelinerAngleAgreementTolerance = 12f; // 양안 trace 각도 허용차.
        const float EyelinerLengthRatioMin = 0.65f;       // 짧은 쪽/긴 쪽 최소 비율.
        const float EyelinerAgreementConfidenceFloor = 0.90f; // 게이트 안 양안 차이는 최대 10%만 감점.
        const float EyelinerLengthMin = 0.20f;            // regions.ts eyelinerWingLength 축 하한.
        const float EyelinerLengthMax = 2.00f;            // 추출은 렌더러 2.5보다 보수적으로 제한.
        const float EyelinerLengthNeutral = 1f;           // 실패 시 기존 기본 길이.

        struct BlushSideMeasurement
        {
            public float lift;
            public float spread;
            public float conf;
        }

        struct BrowSideMeasurement
        {
            public float curvature;
            public float shoulder;
            public float tailRise;
            public float tailAngleDeg;
            public float maxTurnDeg;
            public float turnDominanceDeg;
            public float bandAspect;
            public int shape;
            public float conf;
        }

        struct EyelinerTrace
        {
            public bool valid;
            public float angleDeg;
            public float endDistance;
            public float meanStrength;
        }

        struct EyelinerSideMeasurement
        {
            public int style;
            public float angleDeg;
            public float length;
            public float conf;
        }

        // 모델 파일 준비(FaceLandmarkSource.Start와 동일 자원). 라이브가 이미 준비했겠지만
        // 추출 요청이 그보다 이를 수 있어 자체 보장(MediaEditController.PrepareAsset 선례).
        IEnumerator PrepareAsset()
        {
            if (_assetReady) yield break;
            Mediapipe.Unity.IResourceManager resources = new StreamingAssetsResourceManager();
            yield return resources.PrepareAssetAsync("face_landmarker.task");
            _assetReady = true;
        }

        // IMAGE 모드 랜드마커 보장 — CPU delegate 우선(라이브 LIVE_STREAM이 GPU 점유 중이라
        // 동시 GPU 생성 리스크 회피). 실패 시 GPU 폴백.
        bool EnsureLandmarker()
        {
            if (_landmarker != null) return true;
            if (TryCreate(Mediapipe.Tasks.Core.BaseOptions.Delegate.CPU) ||
                TryCreate(Mediapipe.Tasks.Core.BaseOptions.Delegate.GPU))
                return true;
            Debug.LogError("[LookExtractController] FaceLandmarker 생성 실패");
            return false;
        }

        bool TryCreate(Mediapipe.Tasks.Core.BaseOptions.Delegate del)
        {
            try
            {
                var options = new FaceLandmarkerOptions(
                    new Mediapipe.Tasks.Core.BaseOptions(del, modelAssetPath: "face_landmarker.task"),
                    runningMode: Mediapipe.Tasks.Vision.Core.RunningMode.IMAGE,
                    numFaces: 1);
                _landmarker = FaceLandmarker.CreateFromOptions(options);
                return true;
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[LookExtractController] {del} 생성 실패: {e.Message}");
                return false;
            }
        }

        void CloseLandmarker()
        {
            try { _landmarker?.Close(); }
            catch (Exception e) { Debug.LogWarning($"[LookExtractController] Close 실패: {e.Message}"); }
            _landmarker = null;
        }

        // MediaPipe 결과 → _landmarks. hasFace 반환(MediaEditController.ParseResult 이식).
        static bool ParseResult(FaceLandmarkerResult result, Vector3[] outLandmarks)
        {
            var faces = result.faceLandmarks;
            if (faces == null || faces.Count == 0) return false;
            var landmarks = faces[0].landmarks;
            var count = Mathf.Min(landmarks.Count, FaceLandmarkSource.LandmarkCount);
            for (var i = 0; i < count; i++)
            {
                var lm = landmarks[i];
                outLandmarks[i] = new Vector3(lm.x, lm.y, lm.z);
            }
            return true;
        }

        // ParseResult가 실제로 채운 범위를 별도로 보관한다. _landmarks 배열 길이(478)는
        // 용량일 뿐이며, 468점 결과에서 홍채/잔존값을 새 형태 헬퍼가 읽으면 안 된다.
        static int ParsedLandmarkCount(FaceLandmarkerResult result)
        {
            var faces = result.faceLandmarks;
            if (faces == null || faces.Count == 0 || faces[0].landmarks == null) return 0;
            return Mathf.Min(faces[0].landmarks.Count, FaceLandmarkSource.LandmarkCount);
        }

        void ExtractLook(string path)
        {
            if (_busy) return;
            StartCoroutine(ExtractRoutine(path));
        }

        IEnumerator ExtractRoutine(string path)
        {
            _busy = true;
            var w = 0; var h = 0;
            NativeArray<byte> top = default;
            try
            {
                if (!LoadPhotoUpright(path, out top, out w, out h))
                {
                    NativeBridge.Send(new UnityToRNMessage
                    { type = "error", message = "레퍼런스 사진을 불러오지 못했습니다." });
                    yield break;
                }
            }
            finally
            {
                if (w == 0)
                {
                    if (top.IsCreated) top.Dispose();
                    _busy = false;
                }
            }
            if (w == 0) yield break;

            // 이전 프레임 버퍼를 이 프레임으로 교체(추출은 순차 — _busy로 직렬화됨).
            if (_frame.IsCreated) _frame.Dispose();
            _frame = top;
            _frameW = w;
            _frameH = h;

            yield return PrepareAsset();

            // 검출 — 라이브 LIVE_STREAM 랜드마커가 GPU를 점유 중이라, 자체 랜드마커를 만들기 전에
            // BeginExternalMode로 라이브를 닫아 GPU를 양보한다(MediaEditController.EnterStillRoutine
            // 선례). Detect/Image 생성 예외를 잡아 error로 응답하고, 성공·실패·예외 모든 경로에서
            // CloseLandmarker + (우리가 연 경우) EndExternalMode를 보장한다.
            //   ▸ 코루틴 try-catch 제약: 이 블록엔 yield가 없다 — 결과 Send·yield break는 블록을
            //     빠져나온 뒤에 한다. 측정은 _frame이 살아 있는 블록 안에서 끝내 로컬(measurement)에
            //     담아, finally의 _frame.Dispose 이후 참조 문제를 피한다.
            //   ▸ 재진입 방어: 이미 외부모드면(사진/영상 편집 진행 중) 우리가 연 게 아니므로 닫지도
            //     않는다 — MediaEditController의 편집 세션을 무너뜨리지 않게(EndExternalMode는 라이브
            //     재개+랜드마커 재생성이라 편집 중 호출은 파괴적).
            var hasFace = false;
            string extractError = null;
            LookMeasurement measurement = null;
            var source = FaceLandmarkSource.Instance;
            var enteredExternal = false;
            try
            {
                if (source != null && !source.ExternalMode)
                {
                    source.BeginExternalMode();
                    enteredExternal = true;
                }
                _parsedLandmarkCount = 0;
                if (EnsureLandmarker())
                {
                    using var image = new Image(ImageFormat.Types.Format.Srgba, w, h, w * 4, _frame);
                    var result = _landmarker.Detect(image, null); // 정립 이미지 → 회전 0
                    hasFace = ParseResult(result, _landmarks);
                    _parsedLandmarkCount = ParsedLandmarkCount(result);
                }
                if (hasFace) measurement = Measure(); // _frame이 살아 있는 동안 측정
            }
            catch (Exception e)
            {
                extractError = "룩 추출 실패: " + e.Message;
            }
            finally
            {
                CloseLandmarker();                             // 검출용 랜드마커 반납(GPU/CPU)
                if (enteredExternal) source.EndExternalMode(); // 라이브 파이프라인 재개
                if (_frame.IsCreated) _frame.Dispose();
                _frameW = _frameH = 0;
                _busy = false;
            }

            if (extractError != null)
            {
                NativeBridge.Send(new UnityToRNMessage { type = "error", message = extractError });
                yield break;
            }
            if (!hasFace)
            {
                NativeBridge.Send(new UnityToRNMessage
                { type = "lookExtracted", lookMeasurement = new LookMeasurement { hasFace = false } });
                yield break;
            }
            NativeBridge.Send(new UnityToRNMessage
            { type = "lookExtracted", lookMeasurement = measurement });
        }

        // 네이티브 EXIF 정립 정규화 → 로드 → top-first RGBA(MediaEditController.LoadPhotoUpright).
        bool LoadPhotoUpright(string path, out NativeArray<byte> top, out int w, out int h)
        {
            top = default; w = 0; h = 0;
            var src = ResolvePath(path);
            var upright = Path.Combine(Application.temporaryCachePath,
                $"look_src_{Guid.NewGuid():N}.jpg");
            var loadPath = src;
#if UNITY_IOS && !UNITY_EDITOR
            try
            {
                if (armakeupNormalizeImage(src, upright) != 0 && File.Exists(upright))
                    loadPath = upright;
            }
            catch (Exception e) { Debug.LogWarning($"[LookExtractController] 정규화 실패: {e.Message}"); }
#endif
            if (!ImageFileLoader.TryLoad(loadPath, out var tex, out var error))
            {
                Debug.LogWarning($"[LookExtractController] 사진 로드 실패: {error}");
                TryDelete(upright);
                return false;
            }
            tex = CapTexture(tex, MaxLongSide);
            top = ToTopFirstRGBA(tex, out w, out h);
            UnityEngine.Object.Destroy(tex);
            TryDelete(upright);
            return true;
        }

        // ── 측정 ────────────────────────────────────────────────────────────────

        // 부위별 색 샘플링 → 화이트밸런스 → LookMeasurement. 각 색은 공막 화이트포인트로
        // 그레이월드 보정(캐스트 제거)하되 raw whitePoint·lightingConf도 함께 반환한다.
        LookMeasurement Measure()
        {
            var m = new LookMeasurement { hasFace = true };

            // 공막 화이트포인트 — 후보 중 최고 명도(가장 흰 흰자). 눈 감김·저조도면 명도↓.
            var whiteFound = WhitePoint(out var white, out var whiteLuma, out var whiteSat);
            // 화이트포인트 명도·무채색도가 조명 신뢰도. 흰자가 흐리거나(감김) 색이 강하면(오염) 하향.
            var lightingConf = whiteFound
                ? Mathf.Clamp01((whiteLuma - 0.25f) / 0.5f) * Mathf.Clamp01(1f - whiteSat * 2f)
                : 0.3f;
            m.lightingConf = lightingConf;
            m.whitePoint = Hex(white.r, white.g, white.b);

            // 그레이월드 게인 — 화이트포인트를 무채색으로 끌되, 신뢰도만큼만 보정(과보정 방어).
            ComputeGain(white, whiteFound, lightingConf, out var gain);
            // 개발용 WB 끄기 — 단위행렬로 두면 HexGain이 raw 색을 그대로 반환(whitePoint hex는
            // 항상 raw라 무영향). 색 왜곡이 그레이월드 보정 탓인지 원색과 비교하는 통로.
            if (_disableWhiteBalance) gain = Vector3.one;

            // 맨피부 기준(이마+턱) — 강도 추정의 대조군 + 노출 폴백 기준(피부는 항상 검출·면적 큼).
            var skinPts = new List<Vector2>();
            AddPts(skinPts, ForeheadSkin);
            AddPts(skinPts, ChinSkin);
            var skinOk = TrimmedSample(skinPts, 0f, 1f, out var skin, out _);

            // 처방 A — 노출(밝기) 정규화. 세 채널 동일 배율 → hue 불변, 밝기만 상승.
            // 노출은 WB(gain 색온)와 독립 축이라 WB 끄기(gain=Vector3.one) 분기 이후에 곱한다
            // (WB off여도 노출 정규화는 적용됨). gain은 처방 B로 luma=1 정규화돼 있어, 곱 후
            // gain의 luma가 곧 노출 배율이 된다(밝기는 전적으로 노출 축이 담당).
            var exposure = ComputeExposure(whiteFound, lightingConf, whiteLuma, skinOk, skin);
            gain *= exposure;

            m.skinBase = HexGain(skin, gain);

            // 립 본체 — 외곽/내곽 중점(버밀리언 엣지·입 구멍 회피). 처방 C: 밝은(선명한) 상위
            // 밴드만 취해 입 틈·치아경계 그림자를 배제(어두운 표본이 립을 탁·암하게 만드는 것 방지).
            var lipPts = new List<Vector2>();
            for (var i = 0; i < LipsOuter.Length; i++) lipPts.Add(Mid(LipsOuter[i], LipsInner[i], 0.5f));
            var lipOk = TrimmedSample(lipPts, LipTrimLo, LipTrimHi, out var lip, out var lipConf);
            m.lip = lipOk ? HexGain(lip, gain) : "";
            m.lipConf = lipOk ? lipConf * lightingConf : 0f;

            // 립 안쪽(입 라인) 진한 색 — 내곽 쪽으로 치우친 점(t=0.8)의 하위 명도 평균.
            // 없으면 빈 값(RN이 lip에서 20% 어둡게 파생).
            var linePts = new List<Vector2>();
            for (var i = 0; i < LipsOuter.Length; i++) linePts.Add(Mid(LipsOuter[i], LipsInner[i], 0.8f));
            var lineOk = TrimmedSample(linePts, 0f, 0.4f, out var lipLine, out _) && lipOk;
            m.lipLine = lineOk ? HexGain(lipLine, gain) : "";

            // 볼/블러셔 — 광대 사과 중심 + 반경 근방 평균(좌/우 합).
            var blushPts = new List<Vector2>();
            foreach (var c in CheekCenters) AddDisc(blushPts, c, 0.012f);
            var blushOk = TrimmedSample(blushPts, 0.1f, 0.9f, out var blush, out var blushConf);
            m.blush = blushOk ? HexGain(blush, gain) : "";
            m.blushConf = blushOk ? blushConf * lightingConf : 0f;

            // 눈두덩/아이섀도 — 상안검 lash 라인과 눈썹 아래 사이 lid 피부 밴드(리드~크리스).
            var esPts = new List<Vector2>();
            for (var e = 0; e < 2; e++)
            {
                var up = UpperLids[e];
                var lo = BrowLower[e];
                // 상안검 중앙부(눈동자 위) 몇 점 ↔ 눈썹 아래 대응점 사이. 처방 C: 소켓 그림자에서
                // 리드(속눈썹 라인) 쪽으로 t를 당겨(0.35→0.2) 눈두덩 그림자에 색이 어두워지는 것 방지.
                esPts.Add(Mid(up[3], lo[1], EyeshadowMidT));
                esPts.Add(Mid(up[4], lo[2], EyeshadowMidT));
                esPts.Add(Mid(up[5], lo[3], EyeshadowMidT));
            }
            var esOk = TrimmedSample(esPts, 0.1f, 0.9f, out var es, out var esConf);
            m.eyeshadow = esOk ? HexGain(es, gain) : "";
            m.eyeshadowConf = esOk ? esConf * lightingConf : 0f;

            // 눈썹 — 위/아래 아치 중점(눈썹 심=털). 하위 명도(가장 어두운=털) 우선 평균(피부 틈 배제).
            var browPts = new List<Vector2>();
            for (var e = 0; e < 2; e++)
            {
                var bu = BrowUpper[e];
                var bl = BrowLower[e];
                var n = Mathf.Min(bu.Length, bl.Length);
                for (var i = 0; i < n; i++) browPts.Add(Mid(bu[i], bl[i], 0.5f));
            }
            // 처방 D — 눈썹은 색온 보정을 BrowWbStrength만큼만 반영(밝기=노출은 유지).
            // gain = wbGain × exposure(스칼라)라, exposure 항과 gain 사이를 lerp하면 색온
            // 성분만 감쇠되고 노출(밝기)은 두 항 공통이라 보존된다.
            var browGain = Vector3.Lerp(
                new Vector3(exposure, exposure, exposure), gain, BrowWbStrength);
            var browOk = TrimmedSample(browPts, 0f, 0.6f, out var brow, out var browConf);
            m.brow = browOk ? HexGain(brow, browGain) : "";
            m.browConf = browOk ? browConf * lightingConf : 0f;

            // 홍채 — 중심→링 0.5 지점 median(동공 최암·스펙큘러 회피).
            var irisPts = new List<Vector2>();
            for (var e = 0; e < 2; e++)
            {
                var ctr = IrisCenters[e];
                foreach (var r in IrisRings[e]) irisPts.Add(Mid(ctr, r, 0.5f));
            }
            var irisOk = TrimmedSample(irisPts, 0.35f, 0.65f, out var iris, out var irisConf);
            m.iris = irisOk ? HexGain(iris, gain) : "";
            m.irisConf = irisOk ? irisConf * lightingConf : 0f;

            // 형태 측정은 같은 정지 프레임/랜드마크에서 동기로 끝낸다. 색 측정값은 건드리지
            // 않고 append-only DTO 필드만 채우며, 각 헬퍼 실패 시 neutral+conf 0을 반환한다.
            MeasureLipGloss(lightingConf, out m.lipGloss, out m.lipGlossConf);
            MeasureBlushPosition(skinOk, skin, lightingConf,
                out m.blushLiftHint, out m.blushSpreadHint, out m.blushPositionConf);
            MeasureBrowGeometry(
                out m.browShape, out m.browArch, out m.browThickness, out m.browShapeConf);
            MeasureEyelinerWing(skinOk, skin,
                out m.eyelinerStyle, out m.eyelinerWingLength, out m.eyelinerWingConf);

            return m;
        }

        // 공막 화이트포인트 — 우/좌안 iris중심→눈꼬리 방향 중점 후보 중 최고 명도.
        bool WhitePoint(out Color white, out float luma, out float sat)
        {
            white = Color.white; luma = 0f; sat = 0f;
            var found = false;
            for (var e = 0; e < 2; e++)
            {
                TryCandidate(Mid(IrisCenters[e], EyeOuter[e], 0.55f), ref white, ref luma, ref sat, ref found);
                TryCandidate(Mid(IrisCenters[e], EyeInner[e], 0.55f), ref white, ref luma, ref sat, ref found);
            }
            return found;
        }

        void TryCandidate(Vector2 p, ref Color best, ref float bestLuma, ref float bestSat, ref bool found)
        {
            if (!Sample(p.x, p.y, out var r, out var g, out var b)) return;
            var c = new Color(r, g, b, 1f);
            var l = Luma(c);
            if (!found || l > bestLuma)
            {
                found = true; best = c; bestLuma = l; bestSat = Sat(c);
            }
        }

        // 그레이월드 게인 — gray/채널. 신뢰도만큼만 identity에서 보간(저신뢰=거의 무보정),
        // 극단 게인은 [0.5,2.0]로 클램프(어두운 오탐 흰자 방어). 처방 B: 최종 게인을 luma로
        // 정규화해 색온만 돌리고 전체 밝기·채도를 안 깎게 한다(붉은 립·블러셔 탁화 완화).
        static void ComputeGain(Color white, bool found, float conf, out Vector3 gain)
        {
            gain = Vector3.one;
            if (!found) return;
            var gray = (white.r + white.g + white.b) / 3f;
            if (gray <= 1e-4f) return;
            var gr = Mathf.Clamp(white.r > 1e-4f ? gray / white.r : 1f, 0.5f, 2f);
            var gg = Mathf.Clamp(white.g > 1e-4f ? gray / white.g : 1f, 0.5f, 2f);
            var gb = Mathf.Clamp(white.b > 1e-4f ? gray / white.b : 1f, 0.5f, 2f);
            gain = new Vector3(
                Mathf.Lerp(1f, gr, conf),
                Mathf.Lerp(1f, gg, conf),
                Mathf.Lerp(1f, gb, conf));
            // 처방 B — luma 보존: WB가 색온만 돌리고 밝기는 처방 A(노출)가 전담하게 정규화.
            var gl = 0.299f * gain.x + 0.587f * gain.y + 0.114f * gain.z;
            if (gl > 1e-4f) gain /= gl;
        }

        // 처방 A — 노출 배율. 흰자 검출 신뢰(lightingConf ≥ ExposureWhiteConfMin) 시 whiteLuma를,
        // 아니면 피부 luma를 기준으로 targetLuma/refLuma를 [1, ExposureMax]로 클램프해 반환한다.
        // 기준이 없으면 1(무보정). 세 채널 동일 곱으로 쓰이므로 hue 불변.
        static float ComputeExposure(bool whiteFound, float lightingConf, float whiteLuma,
                                     bool skinOk, Color skin)
        {
            float refLuma, target;
            if (whiteFound && lightingConf >= ExposureWhiteConfMin)
            {
                refLuma = whiteLuma;
                target = ExposureTargetWhiteLuma;
            }
            else if (skinOk)
            {
                refLuma = Luma(skin);
                target = ExposureTargetSkinLuma;
            }
            else
            {
                return 1f; // 노출 기준 없음 → 무보정
            }
            var e = target / Mathf.Max(refLuma, ExposureRefLumaFloor);
            return Mathf.Clamp(e, 1f, ExposureMax);
        }

        // ── 형태 측정: 립 마감 ────────────────────────────────────────────────

        void MeasureLipGloss(float lightingConf, out float gloss, out float conf)
        {
            gloss = LipGlossNeutral;
            conf = 0f;

            var points = new List<Vector2>(LipsOuter.Length * LipFinishInteriorT.Length);
            for (var i = 0; i < LipsOuter.Length && i < LipsInner.Length; i++)
            {
                if (!TryLandmarkUv(LipsOuter[i], out var outer) ||
                    !TryLandmarkUv(LipsInner[i], out var inner))
                    continue;
                foreach (var t in LipFinishInteriorT)
                {
                    var p = Vector2.Lerp(outer, inner, t);
                    if (IsUv(p)) points.Add(p);
                }
            }

            var expected = LipsOuter.Length * LipFinishInteriorT.Length;
            if (expected <= 0 || points.Count < LipFinishMinSamples) return;

            // 기존 TrimmedSample의 full-range RGB RMS conf를 matte/gloss 보조증거로 재사용한다.
            if (!TrimmedSample(points, 0f, 1f, out _, out var uniformityConf)) return;

            var lumas = new List<float>(points.Count);
            foreach (var p in points)
            {
                if (!TrySampleUv(p, out var sample)) continue;
                lumas.Add(Luma(sample));
            }
            if (lumas.Count < LipFinishMinSamples) return;
            lumas.Sort();

            var median = MedianSorted(lumas);
            var peak = lumas[lumas.Count - 1];
            float sum = 0f;
            foreach (var luma in lumas) sum += luma;
            var mean = sum / lumas.Count;
            float variance = 0f;
            foreach (var luma in lumas)
            {
                var delta = luma - mean;
                variance += delta * delta;
            }
            var std = Mathf.Sqrt(variance / lumas.Count);
            if (!IsFinite(median) || !IsFinite(peak) || !IsFinite(std)) return;

            var relativePeak = Mathf.InverseLerp(LipPeakLiftLow, LipPeakLiftHigh, peak - median);
            var absolutePeak = Mathf.InverseLerp(LipPeakLumaLow, LipPeakLumaHigh, peak);
            var peakSignal = LipPeakLiftWeight * relativePeak + LipAbsolutePeakWeight * absolutePeak;
            var spreadSignal = Mathf.InverseLerp(LipLumaStdLow, LipLumaStdHigh, std);
            gloss = Mathf.Clamp01(0.5f * (peakSignal + spreadSignal));

            // peak와 분산이 함께 높거나 함께 낮을 때만 glossy/matte로 확신한다.
            var agreement = Mathf.Clamp01(
                1f - Mathf.Abs(peakSignal - spreadSignal) /
                Mathf.Max(LipSignalAgreementSpan, ShapeGeometryEpsilon));
            var decisiveness = Mathf.Clamp01(
                Mathf.Abs(gloss - LipGlossNeutral) /
                Mathf.Max(LipDecisionSpan, ShapeGeometryEpsilon));
            var nonuniformity = 1f - uniformityConf;
            var uniformitySupport = gloss >= LipGlossNeutral
                ? Mathf.InverseLerp(
                    LipGlossNonuniformityLow, LipGlossNonuniformityHigh, nonuniformity)
                : Mathf.InverseLerp(
                    LipMatteUniformityLow, LipMatteUniformityHigh, uniformityConf);
            var support = Mathf.Lerp(LipUniformitySupportFloor, 1f, uniformitySupport);
            var coverage = Mathf.Clamp01(lumas.Count / (float)expected);
            if (coverage < LipFinishMinCoverage) return;

            var lightingQuality = Mathf.Lerp(
                ShapeLightingQualityFloor, 1f, Mathf.Clamp01(lightingConf));
            conf = Mathf.Clamp01(
                coverage * lightingQuality * agreement * decisiveness * support);
            if (!IsFinite(gloss) || !IsFinite(conf))
            {
                gloss = LipGlossNeutral;
                conf = 0f;
            }
        }

        // ── 형태 측정: 블러셔 위치 ────────────────────────────────────────────

        void MeasureBlushPosition(bool skinOk, Color skin, float lightingConf,
                                  out float lift, out float spread, out float conf)
        {
            lift = 0f;
            spread = 0f;
            conf = 0f;
            if (!skinOk || !IsFinite(skin) || !TryFrameAspect(out var aspect)) return;

            var side = new BlushSideMeasurement[ShapeSideCount];
            for (var e = 0; e < ShapeSideCount; e++)
                if (!TryMeasureBlushSide(e, skin, aspect, out side[e])) return;

            var liftDifference = Mathf.Abs(side[0].lift - side[1].lift);
            var spreadDifference = Mathf.Abs(side[0].spread - side[1].spread);
            var consistency = Mathf.Clamp01(
                1f - Mathf.Max(liftDifference, spreadDifference) /
                Mathf.Max(BlushSideConsistencyTolerance, ShapeGeometryEpsilon));

            lift = Mathf.Clamp(0.5f * (side[0].lift + side[1].lift),
                -BlushHintLimit, BlushHintLimit);
            spread = Mathf.Clamp(0.5f * (side[0].spread + side[1].spread),
                -BlushHintLimit, BlushHintLimit);
            var lightingQuality = Mathf.Lerp(
                ShapeLightingQualityFloor, 1f, Mathf.Clamp01(lightingConf));
            conf = Mathf.Clamp01(
                Mathf.Min(side[0].conf, side[1].conf) * consistency *
                lightingQuality);
            if (!IsFinite(lift) || !IsFinite(spread) || !IsFinite(conf))
            {
                lift = spread = conf = 0f;
            }
        }

        bool TryMeasureBlushSide(int sideIndex, Color skin, float aspect,
                                 out BlushSideMeasurement result)
        {
            result = default;
            if (sideIndex < 0 || sideIndex >= ShapeSideCount ||
                sideIndex >= BlushClassicCenters.Length || sideIndex >= CheekCenters.Length)
                return false;

            var baseUv = BlushClassicCenters[sideIndex];
            if (!TryProjectCanonicalUv(baseUv, out var baseImageUv) ||
                !TryLandmarkUv(CheekCenters[sideIndex], out var cheekUv))
                return false;
            if (MetricDistance(baseImageUv, cheekUv, aspect) > BlushCheekAnchorMaxDistance)
                return false;

            var resolved = 0;
            var active = 0;
            var totalWeight = 0f;
            var weightedCanonical = Vector2.zero;
            for (var row = 0; row < BlushGridRows; row++)
            {
                var rowT = row / (float)(BlushGridRows - 1);
                var offsetY = (rowT * 2f - 1f) * BlushGridHalfHeight;
                for (var column = 0; column < BlushGridColumns; column++)
                {
                    var columnT = column / (float)(BlushGridColumns - 1);
                    var offsetX = (columnT * 2f - 1f) * BlushGridHalfWidth;
                    var canonicalUv = baseUv + new Vector2(offsetX, offsetY);
                    if (!IsUv(canonicalUv) ||
                        !TryProjectCanonicalUv(canonicalUv, out var imageUv) ||
                        !TrySampleUv(imageUv, out var sample))
                        continue;

                    resolved++;
                    var difference = BlushColorDifference(sample, skin);
                    if (!IsFinite(difference) || difference < BlushActiveDifference) continue;

                    var weight = Mathf.Max(0f, difference - BlushDifferenceFloor);
                    if (weight <= ShapeGeometryEpsilon) continue;
                    active++;
                    totalWeight += weight;
                    weightedCanonical += canonicalUv * weight;
                }
            }

            var candidateCount = BlushGridColumns * BlushGridRows;
            if (candidateCount <= 0 || resolved <= 0 || active < BlushMinActiveSamples ||
                totalWeight <= ShapeGeometryEpsilon)
                return false;

            var coverage = resolved / (float)candidateCount;
            var activeFraction = active / (float)resolved;
            var meanWeight = totalWeight / resolved;
            if (coverage < BlushMinResolvedFraction ||
                activeFraction < BlushMinActiveFraction || meanWeight < BlushMinMeanWeight)
                return false;

            var centroid = weightedCanonical / totalWeight;
            if (!IsUv(centroid)) return false;

            result.lift = centroid.y - baseUv.y;
            result.spread = sideIndex == 0
                ? baseUv.x - centroid.x
                : centroid.x - baseUv.x;
            var contrastConf = Mathf.InverseLerp(
                BlushMinMeanWeight, BlushStrongMeanWeight, meanWeight);
            var activeConf = Mathf.InverseLerp(
                BlushMinActiveFraction, BlushStrongActiveFraction, activeFraction);
            var coverageConf = Mathf.InverseLerp(BlushMinResolvedFraction, 1f, coverage);
            result.conf = Mathf.Clamp01(
                Mathf.Min(contrastConf, activeConf) *
                Mathf.Lerp(BlushCoverageConfidenceFloor, 1f, coverageConf));
            return IsFinite(result.lift) && IsFinite(result.spread) && IsFinite(result.conf);
        }

        static float BlushColorDifference(Color sample, Color skin)
        {
            var dr = sample.r - skin.r;
            var dg = sample.g - skin.g;
            var db = sample.b - skin.b;
            var lumaDelta = Luma(new Color(dr, dg, db, 1f));
            var cr = dr - lumaDelta;
            var cg = dg - lumaDelta;
            var cb = db - lumaDelta;
            var chromaRms = Mathf.Sqrt((cr * cr + cg * cg + cb * cb) / 3f);
            return chromaRms + BlushLumaDifferenceWeight * Mathf.Abs(lumaDelta);
        }

        bool TryProjectCanonicalUv(Vector2 canonicalUv, out Vector2 imageUv)
        {
            imageUv = Vector2.zero;
            if (!IsUv(canonicalUv)) return false;
            var mesh = CanonicalFaceMesh.Instance;
            if (mesh == null || !mesh.TopologyReady ||
                !mesh.TryResolveUv(canonicalUv, out var a, out var b, out var c, out var bary))
                return false;

            // TryResolveUv는 이마/립 확장 정점도 반환한다. 사진 랜드마크 투영에는 MediaPipe
            // 기본 메시 0..467만 허용하며 468..477 홍채를 얼굴 삼각형으로 오인하지 않는다.
            if (!IsMeshLandmarkIndex(a) || !IsMeshLandmarkIndex(b) || !IsMeshLandmarkIndex(c) ||
                !IsFinite(bary) || bary.x < CanonicalBaryMinimum ||
                bary.y < CanonicalBaryMinimum || bary.z < CanonicalBaryMinimum)
                return false;
            var barySum = bary.x + bary.y + bary.z;
            if (!IsFinite(barySum) || Mathf.Abs(barySum) <= ShapeGeometryEpsilon) return false;
            bary /= barySum;

            imageUv = bary.x * new Vector2(_landmarks[a].x, _landmarks[a].y) +
                      bary.y * new Vector2(_landmarks[b].x, _landmarks[b].y) +
                      bary.z * new Vector2(_landmarks[c].x, _landmarks[c].y);
            return IsUv(imageUv);
        }

        bool IsMeshLandmarkIndex(int index) =>
            index >= 0 && index < FaceLandmarkSource.MeshVertexCount &&
            index < _parsedLandmarkCount && index < _landmarks.Length;

        // ── 형태 측정: 눈썹 모양/아치/두께 ───────────────────────────────────

        void MeasureBrowGeometry(out int shape, out float arch,
                                 out float thickness, out float conf)
        {
            shape = BrowNatural;
            arch = 0f;
            thickness = BrowThicknessNeutral;
            conf = 0f;
            if (!TryFrameAspect(out var aspect) ||
                !TryMetricLandmark(FaceUpForeheadLandmark, aspect, out var forehead) ||
                !TryMetricLandmark(FaceUpChinLandmark, aspect, out var chin))
                return;

            var faceUp = forehead - chin;
            var faceUpLength = faceUp.magnitude;
            if (!IsFinite(faceUpLength) || faceUpLength <= ShapeGeometryEpsilon) return;
            faceUp /= faceUpLength;

            var side = new BrowSideMeasurement[ShapeSideCount];
            for (var e = 0; e < ShapeSideCount; e++)
                if (!TryMeasureBrowSide(e, aspect, faceUp, out side[e])) return;

            var curvature = 0.5f * (side[0].curvature + side[1].curvature);
            var shoulder = 0.5f * (side[0].shoulder + side[1].shoulder);
            var broadness = curvature > ShapeGeometryEpsilon
                ? shoulder / curvature
                : 0f;
            var tailRise = 0.5f * (side[0].tailRise + side[1].tailRise);
            var tailAngle = 0.5f * (side[0].tailAngleDeg + side[1].tailAngleDeg);
            var maxTurn = 0.5f * (side[0].maxTurnDeg + side[1].maxTurnDeg);
            var turnDominance = 0.5f *
                (side[0].turnDominanceDeg + side[1].turnDominanceDeg);
            shape = ClassifyBrow(
                curvature, broadness, tailRise, tailAngle, maxTurn, turnDominance);

            var bandAspect = 0.5f * (side[0].bandAspect + side[1].bandAspect);
            thickness = Mathf.Clamp(
                bandAspect / Mathf.Max(BrowNeutralBandAspect, ShapeGeometryEpsilon),
                BrowThicknessMin, BrowThicknessMax);

            // ShapeBand 프리셋이 실루엣 peak를 이미 만든다. 아치/각진형에만 프리셋을
            // 넘는 잔차를 band 배수로 환산하고, 일자/상승/반달은 이중 아치를 막아 0이다.
            if (shape == BrowArch || shape == BrowAngular)
            {
                var residual = Mathf.Max(0f, curvature - BrowResidualArchStart);
                arch = Mathf.Clamp(
                    residual / Mathf.Max(bandAspect, ShapeGeometryEpsilon) * BrowResidualArchGain,
                    0f, BrowArchMax);
            }

            var curvatureAgreement = Mathf.Clamp01(
                1f - Mathf.Abs(side[0].curvature - side[1].curvature) /
                Mathf.Max(BrowFeatureAgreementSpan, ShapeGeometryEpsilon));
            var tailAgreement = Mathf.Clamp01(
                1f - Mathf.Abs(side[0].tailRise - side[1].tailRise) /
                Mathf.Max(BrowFeatureAgreementSpan, ShapeGeometryEpsilon));
            var thickMax = Mathf.Max(side[0].bandAspect, side[1].bandAspect);
            if (thickMax <= ShapeGeometryEpsilon) return;
            var thicknessAgreement = Mathf.Clamp01(
                Mathf.Min(side[0].bandAspect, side[1].bandAspect) / thickMax);
            var featureAgreement = Mathf.Min(
                curvatureAgreement, Mathf.Min(tailAgreement, thicknessAgreement));
            var agreementFactor = Mathf.Lerp(
                BrowAgreementConfidenceFloor, 1f, featureAgreement);
            var shapeFactor = side[0].shape == side[1].shape
                ? 1f
                : BrowShapeMismatchPenalty;
            conf = Mathf.Clamp01(
                Mathf.Min(side[0].conf, side[1].conf) * agreementFactor * shapeFactor);

            if (!IsFinite(arch) || !IsFinite(thickness) || !IsFinite(conf))
            {
                shape = BrowNatural;
                arch = 0f;
                thickness = BrowThicknessNeutral;
                conf = 0f;
            }
        }

        bool TryMeasureBrowSide(int sideIndex, float aspect, Vector2 faceUp,
                                out BrowSideMeasurement result)
        {
            result = default;
            if (sideIndex < 0 || sideIndex >= ShapeSideCount ||
                sideIndex >= BrowUpper.Length || sideIndex >= BrowLower.Length)
                return false;
            var upperIndices = BrowUpper[sideIndex];
            var lowerIndices = BrowLower[sideIndex];
            if (upperIndices == null || lowerIndices == null ||
                upperIndices.Length < BrowPointCount || lowerIndices.Length < BrowPointCount)
                return false;

            var centers = new Vector2[BrowPointCount];
            var bands = new float[BrowPointCount];
            for (var i = 0; i < BrowPointCount; i++)
            {
                if (!TryMetricLandmark(upperIndices[i], aspect, out var upper) ||
                    !TryMetricLandmark(lowerIndices[i], aspect, out var lower))
                    return false;
                centers[i] = 0.5f * (upper + lower);
                bands[i] = Vector2.Distance(upper, lower);
                if (!IsFinite(centers[i]) || !IsFinite(bands[i]) ||
                    bands[i] <= ShapeGeometryEpsilon)
                    return false;
            }

            var chord = centers[BrowPointCount - 1] - centers[0];
            var chordLength = chord.magnitude;
            if (!IsFinite(chordLength) || chordLength < BrowMinChordLength) return false;
            var chordAxis = chord / chordLength;

            var arcLength = 0f;
            for (var i = 1; i < BrowPointCount; i++)
            {
                var segmentLength = Vector2.Distance(centers[i - 1], centers[i]);
                if (!IsFinite(segmentLength) || segmentLength <= ShapeGeometryEpsilon) return false;
                arcLength += segmentLength;
            }
            if (!IsFinite(arcLength) || arcLength <= ShapeGeometryEpsilon) return false;
            var chordRatio = chordLength / arcLength;
            if (chordRatio < BrowMinArcToChordRatio) return false;

            var deviations = new float[BrowPointCount];
            for (var i = 1; i + 1 < BrowPointCount; i++)
            {
                var along = i / (float)(BrowPointCount - 1);
                var baseline = Vector2.Lerp(centers[0], centers[BrowPointCount - 1], along);
                deviations[i] = Vector2.Dot(centers[i] - baseline, faceUp) / chordLength;
            }
            var curvature = deviations[BrowPointCount / 2];
            var shoulder = 0.5f * (deviations[1] + deviations[BrowPointCount - 2]);
            var broadness = curvature > ShapeGeometryEpsilon
                ? shoulder / curvature
                : 0f;

            var tailRise = Vector2.Dot(
                centers[0] - centers[BrowPointCount - 1], faceUp) / chordLength;
            var tailDirection = centers[0] - centers[1];
            var tailDirectionLength = tailDirection.magnitude;
            if (!IsFinite(tailDirectionLength) || tailDirectionLength <= ShapeGeometryEpsilon)
                return false;
            tailDirection /= tailDirectionLength;
            var tailAngle = Mathf.Atan2(
                Vector2.Dot(tailDirection, faceUp),
                Mathf.Abs(Vector2.Dot(tailDirection, chordAxis))) * Mathf.Rad2Deg;

            var maxTurn = 0f;
            var secondTurn = 0f;
            for (var i = 1; i + 1 < BrowPointCount; i++)
            {
                var incoming = centers[i] - centers[i - 1];
                var outgoing = centers[i + 1] - centers[i];
                var incomingLength = incoming.magnitude;
                var outgoingLength = outgoing.magnitude;
                if (!IsFinite(incomingLength) || !IsFinite(outgoingLength) ||
                    incomingLength <= ShapeGeometryEpsilon || outgoingLength <= ShapeGeometryEpsilon)
                    return false;
                incoming /= incomingLength;
                outgoing /= outgoingLength;
                var turn = Mathf.Acos(Mathf.Clamp(Vector2.Dot(incoming, outgoing), -1f, 1f)) *
                           Mathf.Rad2Deg;
                if (!IsFinite(turn)) return false;
                if (turn > maxTurn)
                {
                    secondTurn = maxTurn;
                    maxTurn = turn;
                }
                else if (turn > secondTurn)
                {
                    secondTurn = turn;
                }
            }

            var bandSum = 0f;
            var bandCount = 0;
            for (var i = BrowCentralBandFirst; i <= BrowCentralBandLast; i++)
            {
                bandSum += bands[i];
                bandCount++;
            }
            if (bandCount <= 0) return false;
            var meanBand = bandSum / bandCount;
            var bandAspect = meanBand / arcLength;
            if (!IsFinite(bandAspect) || bandAspect <= ShapeGeometryEpsilon) return false;

            result.curvature = curvature;
            result.shoulder = shoulder;
            result.tailRise = tailRise;
            result.tailAngleDeg = tailAngle;
            result.maxTurnDeg = maxTurn;
            result.turnDominanceDeg = maxTurn - secondTurn;
            result.bandAspect = bandAspect;
            result.shape = ClassifyBrow(
                curvature, broadness, tailRise, tailAngle,
                maxTurn, result.turnDominanceDeg);
            var chainQuality = Mathf.InverseLerp(
                BrowMinArcToChordRatio, BrowStrongChordRatio, chordRatio);
            result.conf = Mathf.Lerp(BrowSideConfidenceFloor, 1f, chainQuality);
            return IsFinite(result.curvature) && IsFinite(result.shoulder) &&
                   IsFinite(result.tailRise) &&
                   IsFinite(result.tailAngleDeg) && IsFinite(result.maxTurnDeg) &&
                   IsFinite(result.turnDominanceDeg) && IsFinite(result.conf);
        }

        static int ClassifyBrow(float curvature, float broadness, float tailRise,
                                float tailAngleDeg, float maxTurnDeg,
                                float turnDominanceDeg)
        {
            if (maxTurnDeg >= BrowAngularTurnMinDeg &&
                turnDominanceDeg >= BrowAngularDominanceMinDeg &&
                curvature >= BrowStraightCurvatureMax)
                return BrowAngular;
            if (tailRise >= BrowRisingTailRiseMin &&
                tailAngleDeg >= BrowRisingTailAngleMinDeg)
                return BrowRising;
            if (Mathf.Abs(curvature) <= BrowStraightCurvatureMax &&
                Mathf.Abs(tailRise) <= BrowStraightTailRiseMax)
                return BrowStraight;
            if (curvature >= BrowMoonCurvatureMin &&
                broadness >= BrowMoonBroadnessMin && maxTurnDeg <= BrowMoonTurnMaxDeg)
                return BrowMoon;
            if (curvature >= BrowArchCurvatureMin)
                return BrowArch;
            return BrowNatural;
        }

        // ── 형태 측정: 아이라인 윙 ────────────────────────────────────────────

        void MeasureEyelinerWing(bool skinOk, Color skin, out int style,
                                 out float wingLength, out float conf)
        {
            style = EyelinerWingUp;
            wingLength = EyelinerLengthNeutral;
            conf = 0f;
            if (!skinOk || !IsFinite(skin) || !TryFrameAspect(out var aspect)) return;

            var side = new EyelinerSideMeasurement[ShapeSideCount];
            for (var e = 0; e < ShapeSideCount; e++)
                if (!TryMeasureEyelinerSide(e, skin, aspect, out side[e])) return;

            // 한쪽만 보이거나 스타일이 다르면 오탐 비용이 크므로 전체 미적용.
            if (side[0].style != side[1].style) return;
            var angleDifference = Mathf.Abs(side[0].angleDeg - side[1].angleDeg);
            var maxLength = Mathf.Max(side[0].length, side[1].length);
            if (maxLength <= ShapeGeometryEpsilon) return;
            var lengthRatio = Mathf.Min(side[0].length, side[1].length) / maxLength;
            if (angleDifference > EyelinerAngleAgreementTolerance ||
                lengthRatio < EyelinerLengthRatioMin)
                return;

            style = side[0].style;
            wingLength = Mathf.Clamp(
                0.5f * (side[0].length + side[1].length),
                EyelinerLengthMin, EyelinerLengthMax);
            var angleAgreement = Mathf.Lerp(
                EyelinerAgreementConfidenceFloor, 1f,
                1f - angleDifference /
                Mathf.Max(EyelinerAngleAgreementTolerance, ShapeGeometryEpsilon));
            var lengthAgreement = Mathf.Lerp(
                EyelinerAgreementConfidenceFloor, 1f,
                Mathf.InverseLerp(EyelinerLengthRatioMin, 1f, lengthRatio));
            conf = Mathf.Clamp01(
                Mathf.Min(side[0].conf, side[1].conf) *
                angleAgreement * lengthAgreement);
            if (!IsFinite(wingLength) || !IsFinite(conf))
            {
                style = EyelinerWingUp;
                wingLength = EyelinerLengthNeutral;
                conf = 0f;
            }
        }

        bool TryMeasureEyelinerSide(int sideIndex, Color skin, float aspect,
                                    out EyelinerSideMeasurement result)
        {
            result = default;
            if (sideIndex < 0 || sideIndex >= ShapeSideCount ||
                sideIndex >= EyelinerEyeContours.Length || sideIndex >= BrowLower.Length ||
                sideIndex >= EyeOuter.Length || sideIndex >= EyeInner.Length)
                return false;
            if (EyelinerRendererAngles.Length <= EyelinerLong ||
                EyelinerRendererBaseTailLengths.Length <= EyelinerLong)
                return false;
            var contour = EyelinerEyeContours[sideIndex];
            if (contour == null || contour.Length == 0) return false;

            var centroid = Vector2.zero;
            foreach (var index in contour)
            {
                if (!TryMetricLandmark(index, aspect, out var p)) return false;
                centroid += p;
            }
            centroid /= contour.Length;
            if (!IsFinite(centroid)) return false;

            var eyeRadius = 0f;
            foreach (var index in contour)
            {
                if (!TryMetricLandmark(index, aspect, out var p)) return false;
                eyeRadius += Vector2.Distance(p, centroid);
            }
            eyeRadius /= contour.Length;
            if (!IsFinite(eyeRadius) || eyeRadius <= ShapeGeometryEpsilon) return false;

            if (!TryMetricLandmark(EyeOuter[sideIndex], aspect, out var outer) ||
                !TryMetricLandmark(EyeInner[sideIndex], aspect, out var inner))
                return false;
            var outward = outer - inner;
            var outwardLength = outward.magnitude;
            if (!IsFinite(outwardLength) || outwardLength <= ShapeGeometryEpsilon) return false;
            outward /= outwardLength;

            var browMean = Vector2.zero;
            var browIndices = BrowLower[sideIndex];
            if (browIndices == null || browIndices.Length == 0) return false;
            foreach (var index in browIndices)
            {
                if (!TryMetricLandmark(index, aspect, out var p)) return false;
                browMean += p;
            }
            browMean /= browIndices.Length;
            var up = browMean - centroid;
            up -= Vector2.Dot(up, outward) * outward;
            var upLength = up.magnitude;
            if (!IsFinite(upLength) || upLength <= ShapeGeometryEpsilon) return false;
            up /= upLength;

            var skinLuma = Luma(skin);
            if (!IsFinite(skinLuma) || skinLuma < EyelinerSkinLumaFloor) return false;

            var bestByStyle = new EyelinerTrace[EyelinerRendererAngles.Length];
            for (var angle = EyelinerRayMinAngle;
                 angle <= EyelinerRayMaxAngle + ShapeGeometryEpsilon;
                 angle += EyelinerRayAngleStep)
            {
                if (!TryTraceEyelinerRay(
                        outer, outward, up, eyeRadius, skinLuma, aspect, angle, out var trace))
                    continue;
                var candidateStyle = ClassifyEyeliner(trace.angleDeg);
                if (candidateStyle < 0 || candidateStyle >= bestByStyle.Length) continue;
                if (!bestByStyle[candidateStyle].valid ||
                    trace.endDistance > bestByStyle[candidateStyle].endDistance)
                    bestByStyle[candidateStyle] = trace;
            }

            var bestStyle = -1;
            var bestTrace = default(EyelinerTrace);
            var secondDistance = 0f;
            for (var candidateStyle = 0; candidateStyle < bestByStyle.Length; candidateStyle++)
            {
                var trace = bestByStyle[candidateStyle];
                if (!trace.valid) continue;
                if (bestStyle < 0 || trace.endDistance > bestTrace.endDistance)
                {
                    if (bestStyle >= 0) secondDistance = bestTrace.endDistance;
                    bestStyle = candidateStyle;
                    bestTrace = trace;
                }
                else if (trace.endDistance > secondDistance)
                {
                    secondDistance = trace.endDistance;
                }
            }
            if (bestStyle < 0 || !bestTrace.valid ||
                bestStyle >= EyelinerRendererBaseTailLengths.Length)
                return false;

            var separation = secondDistance > ShapeGeometryEpsilon
                ? bestTrace.endDistance / secondDistance
                : EyelinerStyleSeparationStrong;
            if (!IsFinite(separation) || separation < EyelinerStyleSeparationMin) return false;
            var baseTail = EyelinerRendererBaseTailLengths[bestStyle] * eyeRadius;
            if (!IsFinite(baseTail) || baseTail <= ShapeGeometryEpsilon) return false;

            result.style = bestStyle;
            result.angleDeg = bestTrace.angleDeg;
            result.length = Mathf.Clamp(
                bestTrace.endDistance / baseTail, EyelinerLengthMin, EyelinerLengthMax);
            var separationConf = Mathf.InverseLerp(
                EyelinerStyleSeparationMin, EyelinerStyleSeparationStrong, separation);
            var strengthConf = Mathf.InverseLerp(
                EyelinerMinMeanStrength, EyelinerMeanStrengthFull, bestTrace.meanStrength);
            var rendererAngleError = Mathf.Abs(
                bestTrace.angleDeg - EyelinerRendererAngles[bestStyle]);
            var rendererFit = Mathf.Clamp01(
                1f - rendererAngleError /
                Mathf.Max(EyelinerRendererAngleTolerance, ShapeGeometryEpsilon));
            // 세 독립 증거가 모두 강해야 RN 0.8 gate를 넘는다. 어느 하나가 최소
            // 경계면 0이 되어 약한 darkness/방향 모호성/프리셋 불일치를 숨기지 않는다.
            result.conf = Mathf.Min(
                strengthConf, Mathf.Min(separationConf, rendererFit));
            return IsFinite(result.angleDeg) && IsFinite(result.length) && IsFinite(result.conf);
        }

        bool TryTraceEyelinerRay(Vector2 outer, Vector2 outward, Vector2 up,
                                 float eyeRadius, float skinLuma, float aspect,
                                 float angleDeg, out EyelinerTrace trace)
        {
            trace = default;
            if (EyelinerRaySamples < 2 || EyelinerCrossTaps < 2 ||
                eyeRadius <= ShapeGeometryEpsilon || aspect <= ShapeGeometryEpsilon)
                return false;

            var theta = angleDeg * Mathf.Deg2Rad;
            var direction = Mathf.Cos(theta) * outward + Mathf.Sin(theta) * up;
            var directionLength = direction.magnitude;
            if (!IsFinite(directionLength) || directionLength <= ShapeGeometryEpsilon) return false;
            direction /= directionLength;
            var cross = new Vector2(-direction.y, direction.x);

            var connected = 0;
            var gaps = 0;
            var strengthSum = 0f;
            var lastStrongDistance = 0f;
            for (var sampleIndex = 0; sampleIndex < EyelinerRaySamples; sampleIndex++)
            {
                var sampleT = sampleIndex / (float)(EyelinerRaySamples - 1);
                var radiusMultiplier = Mathf.Lerp(
                    EyelinerRayStartRadius, EyelinerRayEndRadius, sampleT);
                var distance = radiusMultiplier * eyeRadius;
                var darkTaps = 0;
                var strongest = 0f;

                for (var tapIndex = 0; tapIndex < EyelinerCrossTaps; tapIndex++)
                {
                    var tapT = tapIndex / (float)(EyelinerCrossTaps - 1);
                    var crossMultiplier = (tapT * 2f - 1f) * EyelinerCrossHalfWidth;
                    var metricPoint = outer + direction * distance +
                                      cross * (crossMultiplier * eyeRadius);
                    var uv = new Vector2(metricPoint.x / aspect, metricPoint.y);
                    if (!TrySampleUv(uv, out var sample)) continue;

                    var darkness = skinLuma - Luma(sample);
                    var relativeDarkness = darkness /
                        Mathf.Max(skinLuma, EyelinerSkinLumaFloor);
                    if (darkness < EyelinerDarkAbsMin ||
                        relativeDarkness < EyelinerDarkRelativeMin)
                        continue;
                    darkTaps++;
                    var absoluteStrength = Mathf.InverseLerp(
                        EyelinerDarkAbsMin, EyelinerDarkAbsStrong, darkness);
                    var relativeStrength = Mathf.InverseLerp(
                        EyelinerDarkRelativeMin, EyelinerDarkRelativeStrong, relativeDarkness);
                    strongest = Mathf.Max(strongest,
                        Mathf.Min(absoluteStrength, relativeStrength));
                }

                if (darkTaps >= EyelinerMinDarkCrossTaps)
                {
                    connected++;
                    gaps = 0;
                    strengthSum += strongest;
                    lastStrongDistance = distance;
                }
                else
                {
                    gaps++;
                    // trace는 반드시 코너부터 이어져야 한다. 시작점이 어두운 자취가 아니면
                    // 더 바깥의 머리카락/그림자를 새 윙으로 시작하지 않는다.
                    if (connected == 0 || gaps > EyelinerAllowedGapSamples) break;
                }
            }

            if (connected < EyelinerMinConnectedSamples ||
                lastStrongDistance / eyeRadius < EyelinerMinTraceRadius)
                return false;
            var meanStrength = strengthSum / connected;
            if (!IsFinite(meanStrength) || meanStrength < EyelinerMinMeanStrength ||
                !IsFinite(lastStrongDistance))
                return false;

            trace.valid = true;
            trace.angleDeg = angleDeg;
            trace.endDistance = lastStrongDistance;
            trace.meanStrength = Mathf.Clamp01(meanStrength);
            return true;
        }

        static int ClassifyEyeliner(float angleDeg)
        {
            if (angleDeg > EyelinerWingUpAngleMin) return EyelinerWingUp;
            if (angleDeg < EyelinerPuppyAngleMax) return EyelinerPuppy;
            return EyelinerLong;
        }

        // ── 형태 측정 공통 좌표/수치 가드 ─────────────────────────────────────

        bool TryLandmarkUv(int index, out Vector2 uv)
        {
            uv = Vector2.zero;
            if (index < 0 || index >= _parsedLandmarkCount || index >= _landmarks.Length)
                return false;
            var landmark = _landmarks[index];
            if (!IsFinite(landmark)) return false;
            uv = new Vector2(landmark.x, landmark.y);
            return IsUv(uv);
        }

        bool TryMetricLandmark(int index, float aspect, out Vector2 metric)
        {
            metric = Vector2.zero;
            if (!IsFinite(aspect) || aspect <= ShapeGeometryEpsilon ||
                !TryLandmarkUv(index, out var uv))
                return false;
            metric = new Vector2(uv.x * aspect, uv.y);
            return IsFinite(metric);
        }

        bool TryFrameAspect(out float aspect)
        {
            aspect = 0f;
            if (_frameW <= 0 || _frameH <= 0) return false;
            aspect = _frameW / (float)_frameH;
            return IsFinite(aspect) && aspect > ShapeGeometryEpsilon;
        }

        bool TrySampleUv(Vector2 uv, out Color sample)
        {
            sample = Color.clear;
            if (!IsUv(uv) || !Sample(uv.x, uv.y, out var r, out var g, out var b))
                return false;
            sample = new Color(r, g, b, 1f);
            return IsFinite(sample);
        }

        static float MetricDistance(Vector2 a, Vector2 b, float aspect)
        {
            if (!IsFinite(a) || !IsFinite(b) || !IsFinite(aspect) ||
                aspect <= ShapeGeometryEpsilon)
                return float.PositiveInfinity;
            return new Vector2((a.x - b.x) * aspect, a.y - b.y).magnitude;
        }

        static float MedianSorted(List<float> sorted)
        {
            if (sorted == null || sorted.Count == 0) return 0f;
            var mid = sorted.Count / 2;
            return (sorted.Count & 1) == 0
                ? 0.5f * (sorted[mid - 1] + sorted[mid])
                : sorted[mid];
        }

        static bool IsUv(Vector2 uv) =>
            IsFinite(uv) && uv.x >= 0f && uv.x <= 1f && uv.y >= 0f && uv.y <= 1f;

        static bool IsFinite(float value) =>
            !float.IsNaN(value) && !float.IsInfinity(value);

        static bool IsFinite(Vector2 value) => IsFinite(value.x) && IsFinite(value.y);
        static bool IsFinite(Vector3 value) =>
            IsFinite(value.x) && IsFinite(value.y) && IsFinite(value.z);
        static bool IsFinite(Color value) =>
            IsFinite(value.r) && IsFinite(value.g) && IsFinite(value.b) && IsFinite(value.a);

        // ── CPU 샘플러(top-first 버퍼 바이리니어, FaceLandmarkSource.TrySampleColor/Px 이식) ──

        Vector2 N(int i) => new Vector2(_landmarks[i].x, _landmarks[i].y);
        Vector2 Mid(int a, int b, float t) => Vector2.Lerp(N(a), N(b), t);

        void AddPts(List<Vector2> dst, int[] idx)
        {
            foreach (var i in idx) dst.Add(N(i));
        }

        // 중심점 + 상하좌우 4점(정규화 반경 rad)으로 국소 평균 안정화.
        void AddDisc(List<Vector2> dst, int center, float rad)
        {
            var c = N(center);
            dst.Add(c);
            dst.Add(c + new Vector2(rad, 0));
            dst.Add(c + new Vector2(-rad, 0));
            dst.Add(c + new Vector2(0, rad));
            dst.Add(c + new Vector2(0, -rad));
        }

        // 정규화 이미지 좌표(원점 좌상단, 랜드마크 x/y와 동일계) 4-tap 바이리니어.
        bool Sample(float nx, float ny, out float r, out float g, out float b)
        {
            r = g = b = 0f;
            if (!_frame.IsCreated || _frameW <= 0 || _frameH <= 0) return false;
            int w = _frameW, h = _frameH;
            var fx = Mathf.Clamp01(nx) * (w - 1);
            var fy = Mathf.Clamp01(ny) * (h - 1);
            int x0 = (int)fx, y0 = (int)fy;
            int x1 = Mathf.Min(x0 + 1, w - 1), y1 = Mathf.Min(y0 + 1, h - 1);
            float tx = fx - x0, ty = fy - y0;
            Px(x0, y0, out var r00, out var g00, out var b00);
            Px(x1, y0, out var r10, out var g10, out var b10);
            Px(x0, y1, out var r01, out var g01, out var b01);
            Px(x1, y1, out var r11, out var g11, out var b11);
            r = Mathf.Lerp(Mathf.Lerp(r00, r10, tx), Mathf.Lerp(r01, r11, tx), ty);
            g = Mathf.Lerp(Mathf.Lerp(g00, g10, tx), Mathf.Lerp(g01, g11, tx), ty);
            b = Mathf.Lerp(Mathf.Lerp(b00, b10, tx), Mathf.Lerp(b01, b11, tx), ty);
            return true;
        }

        void Px(int x, int y, out float r, out float g, out float b)
        {
            var idx = (y * _frameW + x) * 4; // top-first RGBA(행0 = 이미지 상단) — y 뒤집기 불필요
            r = _frame[idx] / 255f;
            g = _frame[idx + 1] / 255f;
            b = _frame[idx + 2] / 255f;
        }

        static float Luma(Color c) => 0.299f * c.r + 0.587f * c.g + 0.114f * c.b;

        static float Sat(Color c)
        {
            var max = Mathf.Max(c.r, Mathf.Max(c.g, c.b));
            var min = Mathf.Min(c.r, Mathf.Min(c.g, c.b));
            return max <= 1e-4f ? 0f : (max - min) / max;
        }

        // 점들을 샘플 → 명도로 정렬 → [loFrac, hiFrac] 슬라이스만 평균(오염 배제).
        // conf = 1 - 슬라이스 색분산(RMS)로 산출 → 표본이 흩어질수록 신뢰도↓.
        bool TrimmedSample(List<Vector2> pts, float loFrac, float hiFrac, out Color avg, out float conf)
        {
            avg = Color.clear; conf = 0f;
            var samples = new List<Color>(pts.Count);
            foreach (var p in pts)
                if (Sample(p.x, p.y, out var r, out var g, out var b))
                    samples.Add(new Color(r, g, b, 1f));
            if (samples.Count == 0) return false;

            samples.Sort((a, b) => Luma(a).CompareTo(Luma(b)));
            var lo = Mathf.Clamp(Mathf.FloorToInt(samples.Count * loFrac), 0, samples.Count - 1);
            var hi = Mathf.Clamp(Mathf.CeilToInt(samples.Count * hiFrac), lo + 1, samples.Count);

            float sr = 0, sg = 0, sb = 0;
            var n = hi - lo;
            for (var i = lo; i < hi; i++) { sr += samples[i].r; sg += samples[i].g; sb += samples[i].b; }
            avg = new Color(sr / n, sg / n, sb / n, 1f);

            float vr = 0, vg = 0, vb = 0;
            for (var i = lo; i < hi; i++)
            {
                vr += (samples[i].r - avg.r) * (samples[i].r - avg.r);
                vg += (samples[i].g - avg.g) * (samples[i].g - avg.g);
                vb += (samples[i].b - avg.b) * (samples[i].b - avg.b);
            }
            var rms = Mathf.Sqrt((vr + vg + vb) / (3f * n));
            conf = Mathf.Clamp01(1f - rms * 3f); // 분산이 작을수록(균일) 신뢰↑
            return true;
        }

        static string Hex(float r, float g, float b)
        {
            var R = Mathf.Clamp(Mathf.RoundToInt(r * 255f), 0, 255);
            var G = Mathf.Clamp(Mathf.RoundToInt(g * 255f), 0, 255);
            var B = Mathf.Clamp(Mathf.RoundToInt(b * 255f), 0, 255);
            return $"#{R:X2}{G:X2}{B:X2}";
        }

        static string HexGain(Color c, Vector3 gain) =>
            Hex(c.r * gain.x, c.g * gain.y, c.b * gain.z);

        // ── 헬퍼(MediaEditController 이식) ──────────────────────────────────────

        // Unity Texture2D(GetPixels32 = bottom-first) → top-first RGBA NativeArray.
        static NativeArray<byte> ToTopFirstRGBA(Texture2D tex, out int w, out int h)
        {
            w = tex.width; h = tex.height;
            var px = tex.GetPixels32();
            var buf = new NativeArray<byte>(w * h * 4, Allocator.Persistent);
            for (var y = 0; y < h; y++)
            {
                var srcRow = (h - 1 - y) * w; // 세로 뒤집기(bottom→top)
                var dstRow = y * w;
                for (var x = 0; x < w; x++)
                {
                    var c = px[srcRow + x];
                    var di = (dstRow + x) * 4;
                    buf[di] = c.r;
                    buf[di + 1] = c.g;
                    buf[di + 2] = c.b;
                    buf[di + 3] = c.a;
                }
            }
            return buf;
        }

        // 긴 변이 maxLong을 넘으면 바이리니어 다운스케일(원본 파기). 이하이면 원본 그대로.
        static Texture2D CapTexture(Texture2D src, int maxLong)
        {
            int w = src.width, h = src.height;
            var longSide = Mathf.Max(w, h);
            if (longSide <= maxLong) return src;
            var scale = (float)maxLong / longSide;
            var nw = Mathf.Max(2, Mathf.RoundToInt(w * scale));
            var nh = Mathf.Max(2, Mathf.RoundToInt(h * scale));
            var rt = RenderTexture.GetTemporary(nw, nh, 0, RenderTextureFormat.ARGB32);
            var prev = RenderTexture.active;
            Graphics.Blit(src, rt);
            RenderTexture.active = rt;
            var dst = new Texture2D(nw, nh, TextureFormat.RGBA32, false);
            dst.ReadPixels(new UnityEngine.Rect(0, 0, nw, nh), 0, 0);
            dst.Apply(false, false);
            RenderTexture.active = prev;
            RenderTexture.ReleaseTemporary(rt);
            UnityEngine.Object.Destroy(src);
            return dst;
        }
#endif

        static string ResolvePath(string path)
        {
            if (string.IsNullOrEmpty(path)) return path;
            return path.StartsWith("file://") ? path.Substring(7) : path;
        }

        static void TryDelete(string path)
        {
            try { if (!string.IsNullOrEmpty(path) && File.Exists(path)) File.Delete(path); }
            catch { /* best-effort */ }
        }
    }
}
