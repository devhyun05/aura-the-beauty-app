// 텍스처 속눈썹 — 곡선 스트로크 PNG(lash_natural/volume)를 상안검 리본에 매핑.
// 절차 쿼드(각짐·찌그러진 컬)의 대안. 알파=속눈썹 결, rgb=마스카라 색(_BrowColor).
// 프로퍼티명은 LashRenderer가 절차 머티리얼과 공유하는 ColorId(_BrowColor)/
// IntensityId(_BrowIntensity)에 맞춘다.
Shader "ARMakeup/LashTexture"
{
    Properties
    {
        _MainTex ("Lash", 2D) = "black" {}
        _BrowColor ("Color", Color) = (0.1, 0.08, 0.07, 1)
        _BrowIntensity ("Intensity", Range(0,1)) = 1
        _LashDebug ("Lash Mode (0 composite 1 rawfeed 2 enhance)", Float) = 0
        _EnhAmount ("Enhance Amount", Float) = 1.2
        _EnhTap ("Enhance Tap px", Float) = 1.5
        _EnhSoft ("Enhance Soft", Float) = 0.22
        _RootHi ("Enhance Band Hi (uv.y)", Float) = 0.75
        _RootFade ("Enhance Band Fade", Float) = 0.2
        _TightFloor ("Tightline Floor", Float) = 0.85
        _TightBand ("Tightline Band (uv.y)", Float) = 0.20
        // 불투명화는 텍스처(재추출 레시피)에 베이크됨 — 셰이더 리맵 기본값은 반드시 중립(0/1).
        // 여기 값을 올리면 이중 적용되어 가장자리가 이진화(각진 덩어리)됨. 2026-07-22 실증.
        _AlphaLo ("Opacify Lo (gap)", Float) = 0
        _AlphaHi ("Opacify Hi (hair)", Float) = 1
        // 결(농도) 반영량 — 텍스처 R=불투명화 전 잉크 농도(추출기 베이크, 0723).
        // 0=진한 실루엣(하위호환) 1=원본 농담 전부(연한 획은 연하게 → 한올 결 복원).
        _GrainAmt ("Grain (ink density mix)", Range(0,1)) = 0
    }
    SubShader
    {
        Tags { "Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True" }
        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off
        ZTest Always
        Cull Off
        Lighting Off

        // 프레임당 1회 공유 그랩 (Lip/Eyeliner와 동일 이름). 래시가 실제 카메라 픽셀을
        // 샘플할 수 있게 한다 — "실제 속눈썹 증폭" 통합 전략의 토대(2026-07-22).
        GrabPass { "_CameraFeed" }

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            struct appdata { float4 vertex : POSITION; float2 uv : TEXCOORD0; };
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; float4 grabPos : TEXCOORD1; };

            sampler2D _MainTex;
            float4 _MainTex_ST;
            sampler2D _CameraFeed;
            fixed4 _BrowColor;
            float _BrowIntensity;
            float _LashDebug;   // 0=합성 텍스처, 1=원시피드(초록, GATE0), 2=실제 속눈썹 증폭(GATE1)
            float _EnhAmount, _EnhTap, _EnhSoft, _RootHi, _RootFade, _TightFloor, _TightBand, _AlphaLo, _AlphaHi, _GrainAmt;

            float FeedLuma(float2 uv)
            {
                return dot(tex2D(_CameraFeed, uv).rgb, fixed3(0.299, 0.587, 0.114));
            }

            v2f vert (appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.grabPos = ComputeGrabScreenPos(o.pos);
                return o;
            }

            fixed4 frag (v2f i) : SV_Target
            {
                float2 sUV = i.grabPos.xy / i.grabPos.w;

                // 실제 속눈썹 증폭 알파(darken-only 등방 대비 검출). 상대 대비라 피부톤 무관,
                // 없는 신호를 더하지 않고 있는 털만 진하게 = 가시성 바닥 없음.
                float aBase = 0;
                if (_LashDebug > 1.5)
                {
                    float luma = FeedLuma(sUV);
                    float2 st = fwidth(sUV) * _EnhTap;           // 해상도 적응(항상 nonzero)
                    float refB = max(max(FeedLuma(sUV + float2(0, st.y)), FeedLuma(sUV - float2(0, st.y))),
                                     max(FeedLuma(sUV + float2(st.x, 0)), FeedLuma(sUV - float2(st.x, 0))));
                    float lashSig = saturate((refB - luma) / max(refB * _EnhSoft, 1e-3));
                    float wBand = 1.0 - smoothstep(_RootHi, _RootHi + _RootFade, i.uv.y);
                    aBase = saturate(lashSig * wBand * _EnhAmount);
                }

                // GATE1 — 증폭 단독
                if (_LashDebug > 1.5 && _LashDebug < 2.5)
                    return fixed4(_BrowColor.rgb, aBase);

                // GATE3 — 하이브리드: 증폭 베이스(실제 털 뿌리 밀도) ∪ 텍스처(글램 길이·윙·볼륨)
                if (_LashDebug > 2.5 && _LashDebug < 3.5)
                {
                    fixed4 tx = tex2D(_MainTex, i.uv);
                    float aTex = saturate(tx.a * _BrowIntensity);
                    float A = 1.0 - (1.0 - aBase) * (1.0 - aTex);   // 유니온, 같은 마스카라 색
                    return fixed4(_BrowColor.rgb, A);
                }

                // mode 4 — 텍스처(위로 솟은 글램 모양) ∪ 방향 무관 뿌리 선(tightline).
                // 실제 속눈썹을 증폭하지 않으므로 실제 털 방향(아래 처짐)과 싸우지 않는다.
                // 뿌리 선은 uv.y=0(속눈썹 라인)에 방향 없는 어두운 선 → 축소돼도 안 사라짐(가시성 바닥 제거).
                if (_LashDebug > 3.5)
                {
                    fixed4 tx = tex2D(_MainTex, i.uv);
                    float aTex = saturate(tx.a * _BrowIntensity);
                    float tight = _TightFloor * saturate(1.0 - i.uv.y / _TightBand);
                    float A = 1.0 - (1.0 - tight) * (1.0 - aTex);
                    return fixed4(_BrowColor.rgb, A);
                }

                // GATE0 — 원시 피드(초록 틴트)
                if (_LashDebug > 0.5)
                    return fixed4(tex2D(_CameraFeed, sUV).rgb * fixed3(0.35, 1.0, 0.35), 1);

                // 기본 — 합성 텍스처 + 불투명화(반투명 씻김 제거). 밉으로 옅어진 알파를
                // 레벨 리맵으로 되살린다: 틈(낮은 알파)=0, 털(높은 알파)=불투명 1.
                fixed4 t = tex2D(_MainTex, i.uv);
                float a = saturate((t.a - _AlphaLo) / max(_AlphaHi - _AlphaLo, 0.01));
                // 결 복원 — 알파(윤곽)는 유지한 채 원본 잉크 농도(t.r)를 섞는다.
                a *= lerp(1.0, t.r, _GrainAmt);
                a *= _BrowIntensity;
                return fixed4(_BrowColor.rgb, a);
            }
            ENDCG
        }
    }
}
