namespace ARMakeup.Face
{
    /// <summary>
    /// 부위별 고유 렌더 큐 예약표 (설계 섹션 12 정정 4 — 구 Transparent+8에 Lip·
    /// Pencil·RegionDecal×2가 4중 충돌해 스택 순서가 미정의였다). 각 렌더러가
    /// material.renderQueue로 명시 지정 — 셰이더 태그의 큐는 폴백 기본값일 뿐이며,
    /// 같은 셰이더(RegionDecal)를 쓰는 립/볼 데칼도 여기서 서로 다른 큐를 받는다.
    ///
    /// 물리 레이어링 원칙: 베이스 캔버스 → 볼 데칼 → 눈 영역(스텐실→섀도→하안검→
    /// 아래속눈썹→홍채→라이너→라이너 텍스처) → 눈썹 스택(섀도 위에 털이 얹히도록
    /// 눈 뒤; 컨실→라이트너→파우더→마스카라→펜슬→텍스처) → 립(치아→링→그림→라이너).
    /// 스텐실은 색을 안 그리지만 눈 그리기 전에 와야 한다 — 하안검(NotEqual)이
    /// 눈알 위로 삐져나오지 않게 참조하기 때문(홍채는 Equal로 안쪽만).
    ///
    /// 주의: 모든 메이크업 셰이더의 GrabPass는 "_CameraFeed" 공유 — 그랩은 프레임당
    /// 1회, 최초 사용자(Face=3000) 직전에 일어나므로 큐 재배치가 그랩 시점을 바꾸지
    /// 않는다(전 셰이더가 같은 원본 피드를 샘플).
    ///
    /// 부위 확장 3종(컨실/아래속눈썹/치아) 편입 시 눈썹·립 블록을 +1씩 재번호했다 —
    /// 모든 렌더러가 이 상수를 이름으로 참조하므로 값 이동은 여기 한 파일로 끝난다.
    ///
    /// 쌍꺼풀(DoubleLid) 편입 시 아이섀도(3005) 바로 위에 삽입하고 그 아래 전 블록
    /// (하안검~립라이너)을 +1씩 재번호했다 — 위와 같은 이름 참조 규약이라 안전.
    /// </summary>
    public static class MakeupQueues
    {
        public const int Face = 3000;          // FaceMakeup 베이스 캔버스 (항상 최하)
        public const int BlushDecal = 3001;    // 볼 그림 데칼 (베이스 바로 위)

        // 눈 영역
        public const int EyeStencil = 3004;    // 스텐실만 기록 (색 미기록) — 하안검·홍채가 참조
        public const int Eyeshadow = 3005;
        public const int DoubleLid = 3006;     // 쌍꺼풀 크리스(상안검 위 얇은 음영 라인) — 아이섀도
                                               // 위·아이라인 아래. 상안검 리드 위 피부라 스텐실 불필요
        public const int LowerLid = 3007;      // 하안검 밴드 (섀도 코너 스머지 위, 눈알 밖만)
        public const int LowerLash = 3008;     // 아래 속눈썹 스트로크 (애교살·아이라인(하) 위에 털.
                                               // 아래로 뻗어 눈알 밖 — 스텐실 불필요. 상안검 라이너
                                               // (3010)와의 겹침은 바깥 코너 근처뿐이라 그 아래여도 무방)
        public const int Iris = 3009;
        public const int Eyeliner = 3010;
        public const int EyelinerStyle = 3011;
        public const int Mascara = 3012;       // 속눈썹 스트로크 (라이너 위에 털)

        // 눈썹 스택 (섀도 밴드 상단과 겹치는 곳은 털이 위로)
        public const int BrowConceal = 3013;   // 눈썹 지우기(스킨톤 컨실, §15) — 스택 최하 밑작업.
                                               // 큐 순서로 "지우고 그 위에 그리기"가 자동 성립
        public const int BrowLightener = 3014;
        public const int BrowPowder = 3015;
        public const int BrowMascara = 3016;
        public const int BrowPencil = 3017;
        public const int BrowStyle = 3018;

        // 립 (독립 영역 — 치아 → 링 → 그림 → 라이너 순서로 위에)
        public const int Teeth = 3019;         // 치아 미백 (내측 립 링 안쪽 폴리곤 — 립 링 아래라
                                               // 립·라이너 엣지가 치아 존 경계 위에서 또렷)
        public const int Lip = 3020;
        public const int LipDecal = 3021;
        public const int LipLiner = 3022;      // 외곽 라이너 (엣지가 위에서 또렷하게)

        // 조명 시뮬레이션(#4) — 전 메이크업 위·가이드 아래. 피드+메이크업 합성 화면을
        // GrabPass로 그레이드(화이트밸런스·노출·대비·채도). 코치 라인은 이 위에 순색으로.
        public const int Lighting = 3400;

        // 반반 모드 — 메이크업·조명 등 모든 필터 레이어 위, 가이드 아래. 맨얼굴 쪽
        // 절반을 FramePresenter의 무필터 원본으로 최종 복원한다(SplitMaskRenderer).
        public const int SplitMask = 3900;

        // 튜토리얼 스텐실 — 전 메이크업 위. 완성 미리보기 위에 "어디에 바르는지"
        // 가이드 라인을 얹는 코치 오버레이라 항상 최상단(StencilGuideRenderer).
        public const int StencilGuide = 4000;
    }
}
