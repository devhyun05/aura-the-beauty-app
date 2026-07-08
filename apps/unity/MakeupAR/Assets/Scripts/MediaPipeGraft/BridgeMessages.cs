using System;

namespace ARMakeup.Bridge
{
    /// <summary>
    /// Filter parameters shared between RN and Unity.
    /// Colors are "#RRGGBB" hex strings, intensities are 0..1.
    /// Keep this JsonUtility-compatible: public fields, no dictionaries.
    /// </summary>
    [Serializable]
    public class FilterParams
    {
        public float skinSmoothing = 0.5f;
        public float skinBrightening = 0.2f;
        public string lipColor = "#C94F6D";
        public float lipIntensity = 0.5f;
        public float lipStyleIntensity = 0f;    // 임포트 립 그림(데칼) 강도
        public string blushColor = "#F08FA0";
        public float blushIntensity = 0.35f;
        public float blushStyleIntensity = 0f;  // 임포트 볼 그림(데칼) 강도
        // 넓은 면 보정 (얼굴 셰이더, 가·감산 블렌드)
        public string highlightColor = "#FFF2DB";   // 하이라이터(가산/광채)
        public float highlightIntensity = 0f;
        public string contourColor = "#9E806B";     // 컨투어/섀딩(감산/그림자)
        public float contourIntensity = 0f;
        public string concealerColor = "#FADCC2";   // 컨실러(눈밑 밝힘)
        public float concealerIntensity = 0f;
        public string eyeshadowColor = "#B06A4E";
        public float eyeshadowIntensity = 0.3f;
        public string irisColor = "#5B7B8C";      // 컬러렌즈 색 (intensity 0 = 끔)
        public float irisIntensity = 0f;
        public string eyelinerColor = "#181418";  // 아이라이너 색
        public float eyelinerIntensity = 0f;
        public int eyelinerStyle = 0;              // 0=윙업 1=다운턴 2=가로롱
        public float eyelinerStyleIntensity = 0f;  // 임포트 아이라인 텍스처 강도(색은 eyelinerColor 공용)
        // 눈썹 제품 스택 (겹쳐 쓰기). browColor/Intensity = 마스카라/젤(결 보존).
        public string browColor = "#3A2A20";       // 마스카라/젤 색
        public float browIntensity = 0f;           // 0 = 끔
        public string browPowderColor = "#4A3628"; // 파우더 색(빈 곳 채움)
        public float browPowderIntensity = 0f;
        public float browLightenerIntensity = 0f;  // 옅은 눈썹(피부톤 커버, 색 없음)
        public string browPencilColor = "#2A1E16"; // 펜슬 색(개별 털 스트로크)
        public float browPencilIntensity = 0f;
        public string browStyleColor = "#3A2A20";  // 스타일(텍스처 워프) 틴트 색
        public float browStyleIntensity = 0f;      // 임포트/기본 눈썹 텍스처 강도
        public float browThickness = 1f;           // 눈썹 두께 배수 (1 = 원래)
        public float browArch = 0f;                // 아치 올림 (0 = 원래)
        // 사용자가 UV 템플릿 위에 그린 메이크업 룩(얼굴 UV 데칼) 강도. 텍스처는
        // setFaceOverlay 메시지로 임포트, 이 값으로 세기 조절 (0 = 끔).
        public float faceOverlayIntensity = 0f;
    }

    /// <summary>
    /// 랜드마크 → 화면 매핑 캘리브레이션 (실기기 튜닝용).
    /// RN 디버그 UI에서 실시간으로 조정한 뒤, 확정값을
    /// CanonicalFaceMesh/FaceLandmarkSource의 기본값에 반영한다.
    /// </summary>
    [Serializable]
    public class CalibrationParams
    {
        public bool flipY = true;
        public int rotationDegrees = -1; // -1 = 플랫폼별 자동 추정
        public int matrixMode = -1;      // -1 = 기본. 시간 동기 경로에선 표시 회전(0~3 = 0/90/180/270°)
        public bool debugMesh;           // 메시를 반투명 컬러로 표시 (정렬 확인용)
        public int cullMode = -1;        // -1 = 기본, 0 = Off, 1 = Front, 2 = Back (fold-over 제거용)
    }

    /// <summary>Envelope for RN → Unity messages.</summary>
    [Serializable]
    public class RNToUnityMessage
    {
        public string type; // "applyFilter" | "capture" | "setPaused" | "setCamera" | "setCalibration" | "exportUVTemplate" | "setBrowStyle" | "setFaceOverlay" | "setEyelinerStyle" | "setLipStyle" | "setBlushStyle"
        public FilterParams filter;
        public bool paused;
        public string facing; // setCamera: "front" | "rear"
        public CalibrationParams calibration;
        public string path;   // setBrowStyle/setFaceOverlay: 임포트할 이미지 파일 경로 (file:// 허용)
    }

    /// <summary>Envelope for Unity → RN messages.</summary>
    [Serializable]
    public class UnityToRNMessage
    {
        public string type; // "ready" | "faceTracked" | "photoCaptured" | "uvTemplateExported" | "error"
        public bool tracked;
        public string path;
        public string message;
    }
}
