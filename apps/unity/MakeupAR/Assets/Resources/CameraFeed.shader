// FramePresenter의 카메라 프레임 표시용 (시간 동기 배경).
Shader "ARMakeup/CameraFeed"
{
    Properties
    {
        _MainTex ("Texture", 2D) = "black" {}
    }

    SubShader
    {
        Tags { "Queue" = "Background" "RenderType" = "Opaque" }

        Pass
        {
            ZWrite Off
            ZTest Always
            Cull Off

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            #include "Finish.cginc"     // FaceMakeup과 동일 파운데이션 마감
            #include "Foundation.cginc" // 얼굴·목 파운데이션 색 파이프라인 공용

            sampler2D _MainTex;

            // 얼굴형 보정 워프 (FaceWarpField가 프레임당 기록).
            // ① 범용 오퍼레이터(방사+푸시 통합): _WarpA[i]=(cx,cy,r,gain),
            //    _WarpB[i]=(푸시 raw UV xy, 타원 로브 장축 아스펙트 zw).
            //    disp = ((p−c)·gain + push)·(1−smooth01(t)) — B.zw=0이면 원형,
            //    아니면 장축 r·단축 r×PUSH_ACROSS_RATIO 타원(콧대·이마·눈썹 리본).
            // ② 얼굴 실루엣 체인(광대→턱→광대 15점 리본): 픽셀마다 폴리라인
            //    최근접점까지의 거리 + 그 지점의 보간 푸시 — 너비·길이·사각턱·
            //    하관·광대 통합(점 필드 울퉁불퉁 없음).
            // MAX_WARP_OPS·PUSH_ACROSS_RATIO는 FaceWarpField의 MaxOps·
            // PushAcrossRatio와 반드시 일치(공식 동기).
            #define MAX_WARP_OPS 24
            #define JAW_CHAIN_N 15
            #define PUSH_ACROSS_RATIO 0.5
            float _WarpActive;
            float _WarpAspect;
            float _WarpCount;
            float4 _WarpA[MAX_WARP_OPS];
            float4 _WarpB[MAX_WARP_OPS];
            float _JawChainOn;
            float _JawChainR;
            float4 _JawPtA[JAW_CHAIN_N];  // 아스펙트 공간 점 (xy)
            float4 _JawPush[JAW_CHAIN_N]; // raw UV 푸시 (xy)

            // 세그 디버그 오버레이 (설계 §11 검증용) — SegmentationSource가 기록하는 전역.
            // 마스크 채널: R=face-skin G=hair B=body-skin(목·귀·손) A=기타.
            // _SegImgToMask* = 이미지 UV→마스크 UV 아핀(세그 입력 회전 보정 — 마스크가
            // 회전 공간으로 나오는 플러그인 특성, SegmentationSource.TryComputeImgToMask).
            sampler2D _SegMask;
            float _SegOn;
            float _SegDebug;
            float4 _SegImgToMaskX;
            float4 _SegImgToMaskY;

            // ── 세그 확장 ①이마·목 스무딩 ②헤어 염색 (§11 P3·§14) — MakeupController 전역 ──
            // 얼굴 메시(FaceMakeup) 밖 영역까지 배경에서 직접 처리한다. _SegOn=0이면 완전 무효과.
            float4 _MainTex_TexelSize;
            float _SkinSmoothExt;      // 이마·목 스무딩 확장 강도(skinSmoothingExtended, 0=끔)
            fixed4 _HairTintColor;     // 헤어 염색 색(hairTintColor)
            float _HairTintIntensity;  // 헤어 염색 강도(hairTintIntensity, 0=끔)
            float _HairFinish;         // 헤어 염색 마감(0=새틴=기존 출력, 1 매트 2 글로시 3 시머)
            float _HairShape;          // 헤어 존(W6): 0=전체(현행) 1=옴브레(뿌리→끝) 2=끝만
            // ── 베이스 팩(#18) 파운데이션 이마·목 확장 — FaceMakeup 머티리얼과 같은 값을
            //    전역으로도 세팅(MakeupController.ApplyTo). face-skin(R)+body-skin(B: 목)
            //    게이트로 얼굴 메시 밖까지 같은 틴트. _SegOn=0(폴백)이면 완전 무효과.
            fixed4 _FoundationColor;
            float _FoundationIntensity; // 커버리지(0=끔)
            float _FoundationFinish;    // 0=새틴 1=매트 2=듀이
            float _FoundationTexture;   // 제형 텍스처(①) 0=리퀴드 1=쿠션 2=스킨틴트 — 이마·목 일치

            // ── 임시 디버그(이음새 세그 게이트 튜닝 — 값 확정 후 제거) — 파운데 seg 게이트
            //    임계 4종을 전역 유니폼으로 승격해 실기기 슬라이더로 맞춘다. sentinel -1 =
            //    미설정(아래 #define 리터럴 폴백): LO는 0이 유효값이라 Foundation.cginc의
            //    `> 1e-4` 선례가 아닌 `>= 0` 가드를 쓴다. _SegSeamDbg=0(기본)=시각화 끔.
            //    MakeupController가 Init에서 -1(임계)/0(토글) 시딩. 확정 후 이 5개·viz 블록 제거.
            float _SegSeamDbg;   // 세그 시각화 토글 (0=off)
            float _FndSegLoDbg;  // 이음새 전이대 하한 (미설정 -1 → FND_SEG_LO)
            float _FndSegHiDbg;  // 이음새 전이대 상한 (미설정 -1 → FND_SEG_HI)
            float _FndCoreLoDbg; // 오벌 코어 감쇠 시작 (미설정 -1 → FND_FACE_CORE_LO)
            float _FndCoreHiDbg; // 오벌 코어 완전 제외 (미설정 -1 → FND_FACE_CORE_HI)

            // 세그 확장 GPU 예산 상수 — 배경 전체 화면 패스라 프래그먼트당 예산이 빠듯하다.
            // 스무딩이 켜지면 전화면 8탭(유니폼 분기 — frag의 divergent gradient 주석 참조)
            // 이므로 탭 수·반경이 1차 조정 대상.
            #define SEG_SMOOTH_TAPS 8          // 스무딩 탭 수(십자4+대각4, 4~8 허용 범위) // 실기기 튜닝 대상
            #define SEG_SMOOTH_RADIUS_PX 2.0   // 탭 반경(표시 텍스처 px) // 실기기 튜닝 대상
            #define SEG_SMOOTH_EDGE_GAIN 24.0  // 엣지 보존 가중 지수(FaceMakeup.SmoothSkin과 동일 계수) // 실기기 튜닝 대상
            #define SEG_SMOOTH_LUMA_KEEP 0.35  // luma 보존 비율(0=순수 블러, 1=크로마만 스무딩) // 실기기 튜닝 대상
            #define SEG_SMOOTH_SKIN_LO 0.35    // 피부(face+body) 확률 페더 하한 // 실기기 튜닝 대상
            #define SEG_SMOOTH_SKIN_HI 0.75    // 페더 상한 // 실기기 튜닝 대상
            // 파운데이션 이음새(귀·턱선·목) 게이트 — 스무딩과 별도 임계. body-skin(B)만 0.35
            // 게이트로는 얼굴 메시 밖 + body-skin 확신이 아직 낮은 전이대(귀·턱-목 이음새,
            // 혹은 face-skin으로 분류된 구간)가 통째로 빠져 파운데가 안 닿는다(사용자 보고).
            // skin=max(R,B)로 전이대를 채우되(하한 하향), 얼굴 오벌 코어(높은 R=FaceMakeup
            // 메시가 소유·재적용)는 램프로 제외해 이중 적용을 막는다 — 코어 제외 램프가
            // 메시 fade와 서로 페더로 만나 경계 단차가 생기지 않는다.
            #define FND_SEG_LO 0.12        // 이음새 전이대 하한(낮은 확신 목/귀 포함) // 실기기 튜닝 대상
            #define FND_SEG_HI 0.45        // 이음새 전이대 상한(넘으면 완전 커버) // 실기기 튜닝 대상
            #define FND_FACE_CORE_LO 0.40  // 이 이상 face-skin 확신부터 seg 파운데 감쇠 시작 // 실기기 튜닝 대상
            #define FND_FACE_CORE_HI 0.75  // 이 이상 = 메시 소유 오벌 코어 → seg 파운데 완전 제외 // 실기기 튜닝 대상
            #define HAIR_TINT_LUMA_GAIN 1.5    // 루마 보존 틴트 게인(FaceMakeup.TintFinish와 동일 공식) // 실기기 튜닝 대상
            #define HAIR_TINT_LUMA_LIFT 0.15   // 루마 하한 리프트(암부에서 색 완전 소실 방지) // 실기기 튜닝 대상
            // 헤어 존(W6) — 세그 마스크가 단일 hair 확률(G) 평면이라 가닥의 뿌리/끝 정보가
            // 없다. v1은 이미지 세로축(src.y)으로 근사한다(끝=하단 가정) — 실제 뿌리↔끝 매핑은
            // 포즈·flipY에 의존하므로 근사이며 실기기 튜닝(방향 뒤집힘 확인) 대상. // 실기기 튜닝 대상
            #define HAIR_TIP_LO 0.25   // 끝 존 하한(이미지 세로, 근사): 이하 src.y = 끝(틴트↑)
            #define HAIR_TIP_HI 0.75   // 상한: 이상 src.y = 뿌리(틴트↓)
            #define HAIR_OMBRE_ROOT 0.25 // 옴브레 뿌리 쪽 최소 틴트 비율(끝만은 0까지 감쇠)

            static const float2 kSegSmoothTaps[SEG_SMOOTH_TAPS] =
            {
                float2( 1.0,  0.0), float2(-1.0,  0.0),
                float2( 0.0,  1.0), float2( 0.0, -1.0),
                float2( 0.7,  0.7), float2(-0.7,  0.7),
                float2( 0.7, -0.7), float2(-0.7, -0.7),
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
            };

            v2f vert(float4 vertex : POSITION, float2 uv : TEXCOORD0)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(vertex);
                o.uv = uv;
                return o;
            }

            float aspectLen(float2 d)
            {
                return sqrt(d.x * d.x * _WarpAspect * _WarpAspect + d.y * d.y);
            }

            // 순방향 변위 합 — FaceWarpField.Forward와 동일 데이터·공식.
            float2 warpDisp(float2 p)
            {
                float2 d = float2(0, 0);
                int n = (int)_WarpCount;
                for (int i = 0; i < MAX_WARP_OPS; i++)
                {
                    if (i >= n) break;
                    float4 a = _WarpA[i];
                    float4 b = _WarpB[i];
                    float2 dc = p - a.xy;
                    float r = max(a.z, 1e-6);
                    float t;
                    if (b.z != 0.0 || b.w != 0.0)
                    {
                        // 타원 로브 — FaceWarpField.Forward와 동일 공식.
                        float2 dcA = float2(dc.x * _WarpAspect, dc.y);
                        float u = dcA.x * b.z + dcA.y * b.w;
                        float2 crossV = dcA - b.zw * u;
                        float tu = u / r;
                        float tc = length(crossV) / (r * PUSH_ACROSS_RATIO);
                        t = sqrt(tu * tu + tc * tc);
                    }
                    else
                    {
                        t = aspectLen(dc) / r;
                    }
                    if (t < 1.0)
                        d += (dc * a.w + b.xy) * (1.0 - (t * t * (3.0 - 2.0 * t)));
                }

                if (_JawChainOn > 0.5)
                {
                    // 폴리라인 최근접 세그먼트 탐색 (아스펙트 공간) → 리본 가중 푸시.
                    float2 pA = float2(p.x * _WarpAspect, p.y);
                    float bestD2 = 1e9;
                    float bestS = 0.0;
                    int bestI = 0;
                    [unroll] for (int j = 0; j < JAW_CHAIN_N - 1; j++)
                    {
                        float2 a0 = _JawPtA[j].xy;
                        float2 ab = _JawPtA[j + 1].xy - a0;
                        float s = saturate(dot(pA - a0, ab) / max(dot(ab, ab), 1e-12));
                        float2 q = a0 + ab * s;
                        float d2 = dot(pA - q, pA - q);
                        if (d2 < bestD2) { bestD2 = d2; bestS = s; bestI = j; }
                    }
                    float t = sqrt(bestD2) / max(_JawChainR, 1e-6);
                    if (t < 1.0)
                    {
                        float2 push = lerp(_JawPush[bestI].xy, _JawPush[bestI + 1].xy, bestS);
                        d += push * (1.0 - (t * t * (3.0 - 2.0 * t)));
                    }
                }
                return d;
            }

            // 엣지 보존 스무딩 — FaceMakeup.SmoothSkin 축소판(12탭→8탭, 배경 전화면 예산).
            // 중심과 밝기 차가 큰 탭은 가중이 죽어 헤어라인·옷깃 경계는 뭉개지지 않는다.
            // luma 보존 블렌드: 스무딩 색에 원본 명암(luma) 차를 SEG_SMOOTH_LUMA_KEEP만큼
            // 되살린다 — 잡티(고주파 luma)는 줄이되, 조명 음영(저주파)까지 평평해져
            // 밀랍처럼 보이는 것을 막는 절충값.
            fixed3 SegSmoothSkin(float2 uv, fixed3 center)
            {
                float2 texel = _MainTex_TexelSize.xy * SEG_SMOOTH_RADIUS_PX;
                float3 sum = center;
                float weightSum = 1.0;
                [unroll]
                for (int t = 0; t < SEG_SMOOTH_TAPS; t++)
                {
                    fixed3 s = tex2D(_MainTex, uv + kSegSmoothTaps[t] * texel).rgb;
                    float diff = dot(abs(s - center), float3(1.0, 1.0, 1.0));
                    float w = exp(-diff * diff * SEG_SMOOTH_EDGE_GAIN);
                    sum += s * w;
                    weightSum += w;
                }
                fixed3 blurred = sum / weightSum;
                float lumaDiff = dot(center - blurred, fixed3(0.299, 0.587, 0.114));
                return saturate(blurred + lumaDiff * SEG_SMOOTH_LUMA_KEEP);
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 src = i.uv;
                if (_WarpActive > 0.5)
                {
                    // 역방향 = 순방향 Forward의 고정점 반복 역. p = q − disp(p).
                    // 4회 — 최악 슬라이더 조합에서도 수렴 여유 확보(적대적 리뷰 정량).
                    [unroll] for (int k = 0; k < 4; k++)
                        src = i.uv - warpDisp(src);
                }
                fixed3 col = tex2D(_MainTex, src).rgb;

                // ── 세그 확장 ①이마·목 스무딩 ②헤어 염색 (§11 P3·§14) ──
                // 마스크는 워프 역샘플 src에서 샘플 — 배경은 src 위치의 원본 픽셀을
                // 그리므로 마스크도 같은 src여야 워프된 화면과 정합한다(아래 debugSeg와
                // 동일 규약, §10×§11 교차점). 스무딩 탭도 src 주변 = 원본 이미지 이웃.
                // _SegOn=0(패키지 미설치·모델 부재·추론 실패·스테일)이면 완전 무효과.
                // 분기는 전부 유니폼 조건만 — 마스크값 조건으로 탭을 감싸면 divergent
                // flow 안의 gradient 연산(tex2D)이 되어 플랫폼별 컴파일 실패 위험
                // (fxc X4014). 대신 스무딩 온이면 전화면 8탭이 도는 것이 정직한 예산.
                if (_SegOn > 0.5 && _SkinSmoothExt + _HairTintIntensity + _FoundationIntensity > 0.001)
                {
                    float2 m = float2(dot(_SegImgToMaskX.xy, src) + _SegImgToMaskX.z,
                                      dot(_SegImgToMaskY.xy, src) + _SegImgToMaskY.z);
                    half4 seg = tex2D(_SegMask, m);

                    // ① 스무딩 확장 — face-skin(R)+body-skin(B: 목·귀)만. 기존
                    //    skinSmoothing(FaceMakeup, 얼굴 메시 한정)과 독립 강도.
                    //    얼굴 메시 안쪽도 face-skin이라 이 패스가 스무딩하지만, 그 영역은
                    //    FaceMakeup(GrabPass 소비자)이 위에 다시 그린다 — 둘 다 엣지 보존
                    //    블러라 중첩은 반경이 조금 넓어진 블러와 등가(아티팩트 없음)이고,
                    //    메시 경계 안팎이 모두 스무딩되어 있어 경계 단차는 오히려 준다.
                    if (_SkinSmoothExt > 0.001)
                    {
                        float skinAmt = _SkinSmoothExt * smoothstep(
                            SEG_SMOOTH_SKIN_LO, SEG_SMOOTH_SKIN_HI, max(seg.r, seg.b));
                        col = lerp(col, SegSmoothSkin(src, col), skinAmt);
                    }

                    // ② 헤어 염색 — hair 확률(G) × 강도. 루마 보존 틴트(TintFinish 공식):
                    //    염색색을 원본 luma로 변조해 머릿결(가닥 명암)이 그대로 남는다.
                    if (_HairTintIntensity > 0.001)
                    {
                        float hairLuma = dot(col, fixed3(0.299, 0.587, 0.114));
                        fixed3 dyed = _HairTintColor.rgb *
                            (hairLuma * HAIR_TINT_LUMA_GAIN + HAIR_TINT_LUMA_LIFT);
                        // 헤어 염색 마감 — 0=새틴=무변형(하위호환). 파운데 확장과 동일하게
                        // sparkleUV·screenUV로 src(워프 역샘플)를 넘긴다.
                        dyed = ApplyFinish(dyed, hairLuma, src, _HairFinish, 0.0,
                                           0.0, 0.0, 0.0, 0.0, 0.0, 0.0, src, _PearlLightGain);
                        // 헤어 존(W6) — 화면공간 세로 근사(근사, 위 상수 주석). 0=전체면
                        // hairZone=1 → 바이트 동일(하위호환). 곱 게이트(가산 금지).
                        float hairZone = 1.0;
                        if (_HairShape > 0.5)
                        {
                            float tip = 1.0 - smoothstep(HAIR_TIP_LO, HAIR_TIP_HI, src.y); // 끝(하단)↑
                            hairZone = (_HairShape > 1.5) ? tip : lerp(HAIR_OMBRE_ROOT, 1.0, tip);
                        }
                        col = lerp(col, saturate(dyed), seg.g * _HairTintIntensity * hairZone);
                    }

                    // ③ 파운데이션 확장 — 얼굴 메시(FaceMakeup) 밖 피부. 얼굴·이마 오벌은
                    //    메시(+이마 연장 밴드)가 소유해 거기서 파운데를 바르므로, 배경에서
                    //    그 오벌 코어까지 바르면 파운데가 2회 적용돼 메시 경계에 단차가 생긴다
                    //    (적대 리뷰 confirmed; 파운데는 루마를 능동 리프트해 비멱등이라 스무딩과
                    //    달리 중첩 불가). 그러나 body-skin(B)만 0.35로 게이트하면 귀·턱-목
                    //    이음새(메시 밖 + 아직 낮은 body-skin 확신, 혹은 face-skin으로 분류된
                    //    전이대)가 통째로 빠져 파운데가 안 닿는다(사용자 보고). → skin=max(R,B)로
                    //    전이대까지 채우되, 확신 있는 오벌 코어(높은 R)만 램프로 제외해 이중
                    //    적용을 막는다(코어 제외 램프 ↔ 메시 fade가 페더로 만나 단차 없음).
                    //    폴백(_SegOn=0)이면 이 블록을 건너뛰어 목은 원본.
                    if (_FoundationIntensity > 0.001)
                    {
                        float fLuma = dot(col, fixed3(0.299, 0.587, 0.114));
                        float fGain;
                        float fChroma;
                        float fCov;
                        FoundationTextureParams(_FoundationTexture, _FoundationIntensity,
                                                fGain, fChroma, fCov);
                        // 전이대(귀·턱-목 이음새)까지 채우고 메시 소유 오벌 코어(높은 R)는 제외.
                        // 임계는 디버그 유니폼 우선(미설정 -1이면 #define 리터럴) — 슬라이더가
                        // 실제 커버 게이트를 바꿔 값을 실기기에서 확정한다. 확정 후 리터럴 복귀.
                        float segLo  = _FndSegLoDbg  >= 0.0 ? _FndSegLoDbg  : FND_SEG_LO;
                        float segHi  = _FndSegHiDbg  >= 0.0 ? _FndSegHiDbg  : FND_SEG_HI;
                        float coreLo = _FndCoreLoDbg >= 0.0 ? _FndCoreLoDbg : FND_FACE_CORE_LO;
                        float coreHi = _FndCoreHiDbg >= 0.0 ? _FndCoreHiDbg : FND_FACE_CORE_HI;
                        float fndSkin = max(seg.r, seg.b);
                        float fndFaceCore = smoothstep(coreLo, coreHi, seg.r);
                        fCov *= smoothstep(segLo, segHi, fndSkin) * (1.0 - fndFaceCore);
                        fixed3 found = FoundationTarget(_FoundationColor.rgb, fLuma, fGain);
                        found = FoundationSoftClip(found);
                        found = ApplyFinish(found, fLuma, src, _FoundationFinish, 0.0,
                                            0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                                            src, _PearlLightGain);
                        // 듀이의 가산광만 재클립한다. 새틴·매트까지 재클립하면 비멱등
                        // softclip이 얼굴/목 파운데이션을 불필요하게 한 번 더 압축한다.
                        if (_FoundationFinish > 1.5 && _FoundationFinish < 2.5)
                            found = FoundationSoftClip(found);
                        col = FoundationBlend(col, found, fLuma, fChroma, fCov);
                    }
                }

                // ── 세그 디버그 오버레이 (§11, setCalibration.debugSeg) — 워프 로직 뒤 최종 합성만 ──
                // 이 쿼드의 i.uv가 곧 카메라 이미지 UV이고 배경은 워프 역샘플 src에서
                // 그려지므로, 마스크도 같은 src로 샘플해야 워프된 화면 픽셀과 정합한다
                // (§10×§11 교차점 — 마스크는 원본 이미지에 정렬돼 있고, 화면의 이 픽셀이
                // 보여주는 원본 위치가 src다).
                if (_SegDebug > 0.5 && _SegOn > 0.5)
                {
                    float2 m = float2(dot(_SegImgToMaskX.xy, src) + _SegImgToMaskX.z,
                                      dot(_SegImgToMaskY.xy, src) + _SegImgToMaskY.z);
                    half4 seg = tex2D(_SegMask, m);
                    // 채널 컬러: face-skin=초록, hair=파랑, body-skin=노랑, 기타=마젠타.
                    fixed3 tint = seg.r * fixed3(0.0, 1.0, 0.2) + seg.g * fixed3(0.1, 0.4, 1.0)
                                + seg.b * fixed3(1.0, 0.9, 0.0) + seg.a * fixed3(1.0, 0.0, 1.0);
                    float amt = saturate(seg.r + seg.g + seg.b + seg.a);
                    col = lerp(col, saturate(tint), 0.45 * amt); // 0.45 = 오버레이 불투명도(검증용 고정)
                }

                // ── 임시 디버그(이음새 세그 게이트 시각화 — 값 확정 후 제거) — 파운데 seg
                //    게이트 진단 오버레이. face-skin(seg.r)=빨강, body-skin(seg.b)=파랑,
                //    파운데 게이트 통과량(위 ③ 블록과 동일 공식)=초록. 임계 슬라이더를 실시간
                //    반영하므로 얼굴 오벌 코어 제외·이음새 전이대가 어디서 끊기는지 눈으로
                //    보인다(빨강/파랑인데 초록이 안 뜨는 곳 = 파운데 미도달 = 공백 원인).
                //    _SegSeamDbg=0(기본)이면 완전 스킵 → 현행 픽셀 동일. 위 _SegDebug와 별도
                //    시각화(그건 4채널 총람, 이건 게이트 진단). 확정 후 이 블록·유니폼 제거.
                if (_SegSeamDbg > 0.5 && _SegOn > 0.5)
                {
                    float2 m = float2(dot(_SegImgToMaskX.xy, src) + _SegImgToMaskX.z,
                                      dot(_SegImgToMaskY.xy, src) + _SegImgToMaskY.z);
                    half4 seg = tex2D(_SegMask, m);
                    float segLo  = _FndSegLoDbg  >= 0.0 ? _FndSegLoDbg  : FND_SEG_LO;
                    float segHi  = _FndSegHiDbg  >= 0.0 ? _FndSegHiDbg  : FND_SEG_HI;
                    float coreLo = _FndCoreLoDbg >= 0.0 ? _FndCoreLoDbg : FND_FACE_CORE_LO;
                    float coreHi = _FndCoreHiDbg >= 0.0 ? _FndCoreHiDbg : FND_FACE_CORE_HI;
                    float fndSkin = max(seg.r, seg.b);
                    float fndFaceCore = smoothstep(coreLo, coreHi, seg.r);
                    float gate = smoothstep(segLo, segHi, fndSkin) * (1.0 - fndFaceCore);
                    // 빨강=face-skin, 초록=게이트 통과, 파랑=body-skin.
                    fixed3 tint = fixed3(seg.r, gate, seg.b);
                    float amt = saturate(max(max(seg.r, seg.b), gate));
                    col = lerp(col, saturate(tint), 0.5 * amt); // 0.5 = 오버레이 불투명도(진단용 고정)
                }

                return fixed4(col, 1.0);
            }
            ENDCG
        }
    }
}
