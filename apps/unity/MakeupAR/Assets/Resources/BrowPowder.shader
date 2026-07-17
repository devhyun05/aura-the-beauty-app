// 눈썹 파우더. 눈썹 밴드에 부드럽게 색을 채운다 — 마스카라(BrowMascara/Brow.shader)가
// 어두운 털에만 얹는 것과 달리, 파우더는 털 사이 빈 곳까지 뿌옇게 메운다(숱 채움).
// 단 완전 평평하진 않게: 털(어두움)엔 진하게, 피부 갭엔 옅게 가중해 파우더 질감.
//
// 정점 uv.x = 세로(0 하 → 1 상), uv.y = 가로(0 바깥 → 1 안). 가장자리 소프트 페더.
Shader "ARMakeup/BrowPowder"
{
    Properties
    {
        _BrowColor ("Brow Color", Color) = (0.30, 0.22, 0.16, 1)
        _BrowIntensity ("Brow Intensity", Range(0, 1)) = 0.0
        _HairLo ("Hair Luma Lo", Range(0, 1)) = 0.30
        _HairHi ("Hair Luma Hi", Range(0, 1)) = 0.70
        _FillFloor ("Fill Floor (gap)", Range(0, 1)) = 0.45 // 피부 갭 최소 채움
        // 제형: 0=파우더(기존, 소프트) 1=포마드(꽉 채움·또렷한 엣지) 2=젤(중간·매끈)
        _BrowPowderTexture ("Fill Texture (0 powder 1 pomade 2 gel)", Float) = 0
        // 마감 — 블러셔와 동일 enum. 0=새틴=기존 출력(ApplyFinish 레거시 경로).
        _BrowPowderFinish ("Fill Finish (0 satin 1 matte 2 gloss 3 shimmer)", Float) = 0
        _BrowPowderShimmer ("Fill Shimmer Gain", Range(0, 1)) = 0.5
        // ── 제형 스튜디오(#21·W2) — 마감 스튜디오(_LipGloss* 선례)와 같은 진입점. 위 제형
        // enum(_BrowPowderTexture)의 레거시 분기는 그대로 두고, 이 4축 세부 델타가 오면
        // TexBundle 함수로 얹어 재해석한다. 전부 0 = 미지정 = 레거시 enum 동작(하위호환).
        _BrowPowderTexEdge ("Fill Tex Edge (studio)", Range(-1, 1)) = 0
        _BrowPowderTexGrain ("Fill Tex Grain (studio)", Range(0, 1)) = 0
        _BrowPowderTexCoverage ("Fill Tex Coverage (studio)", Range(-1, 1)) = 0
        _BrowPowderTexBody ("Fill Tex Body (studio)", Range(-1, 1)) = 0
    }

    SubShader
    {
        // 라이트너(+5) 위, 마스카라(+7) 아래.
        Tags { "Queue" = "Transparent+6" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

        GrabPass { "_CameraFeed" }

        Pass
        {
            ZWrite Off
            ZTest Always
            Cull Off
            Blend SrcAlpha OneMinusSrcAlpha

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            #include "Occlusion.cginc" // §11 세그 오클루전 게이트 (전역 유니폼)
            #include "Ambient.cginc"   // 저조도 색소 바닥(BROW_KNEE) — 어둠 눈썹 발광 방지
            #include "Finish.cginc"    // 마감(ApplyFinish) 공용 — _CameraFeed도 여기서 선언

            fixed4 _BrowColor;
            float _BrowIntensity;
            float _HairLo;
            float _HairHi;
            float _FillFloor;
            float _BrowPowderTexture; // 0 파우더 1 포마드 2 젤
            float _BrowPowderFinish;
            float _BrowPowderShimmer;
            // 제형 스튜디오(#21·W2) 세부 델타 — 0 = 미지정 = 레거시 enum 동작(하위호환).
            float _BrowPowderTexEdge;
            float _BrowPowderTexGrain;
            float _BrowPowderTexCoverage;
            float _BrowPowderTexBody;

            struct appdata { float4 vertex : POSITION; float2 uv : TEXCOORD0; };
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; float4 grabPos : TEXCOORD1; };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                o.grabPos = ComputeGrabScreenPos(o.pos);
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 screenUV = i.grabPos.xy / i.grabPos.w;
                fixed3 feed = tex2D(_CameraFeed, screenUV).rgb;

                float luma = dot(feed, fixed3(0.299, 0.587, 0.114));
                // 제형 분기 — 채움 바닥·페더 폭·게인이 물성. 0=파우더(기존 값 그대로).
                // 포마드: 갭까지 꽉 채우고 엣지 또렷(왁스 고정), 살짝 진함.
                // 젤: 중간 채움 + 매끈한 중간 페더. (수치 실기기 튜닝 대상)
                float fillFloor = _FillFloor;
                float vFe = 0.22, hFe = 0.14, gain = 1.0;
                if (_BrowPowderTexture > 1.5)      { fillFloor = 0.65; vFe = 0.16; hFe = 0.10; }
                else if (_BrowPowderTexture > 0.5) { fillFloor = 0.85; vFe = 0.10; hFe = 0.07; gain = 1.1; }
                // 털엔 100%, 피부 갭엔 fillFloor만큼 → 뿌옇게 채우되 털이 살짝 진함.
                float hair = 1.0 - smoothstep(_HairLo, _HairHi, luma);
                float fill = lerp(fillFloor, 1.0, hair);

                // 밴드 가장자리 소프트 페더 (제형이 폭을 정함)
                float vEdge = smoothstep(0.0, vFe, i.uv.x) * (1.0 - smoothstep(1.0 - vFe, 1.0, i.uv.x));
                float hEdge = smoothstep(0.0, hFe, i.uv.y) * (1.0 - smoothstep(1.0 - hFe, 1.0, i.uv.y));

                float amt = saturate(fill * vEdge * hEdge * _BrowIntensity * gain);

                fixed3 pigment = _BrowColor.rgb * PigmentBaseKnee(luma, 0.9, 0.4, BROW_KNEE);
                // 마감 — 시머(펄 브로우)·매트 등. 0=새틴=무변형(하위호환).
                // 스파클 UV는 밴드 로컬 uv라 눈썹에 접착.
                pigment = ApplyFinish(pigment, luma, i.uv, _BrowPowderFinish, _BrowPowderShimmer,
                                      0, 0, 0, 0, 0, 0, screenUV, _PearlLightGain);

                // ── 제형 스튜디오(#21·W2) — 위 제형 enum(파우더/포마드/젤) 레거시 분기는 그대로
                // 유지됐다. 커스텀 세부가 오면 TexBundle 4축을 색소·채움량에 얹어 재해석한다.
                // 픽셀 동일 논증: 네 오버라이드가 모두 0이면 texCustom=0 → 이 블록이 통째로
                // 스킵돼 pigment·amt는 레거시 값 그대로다(파우더·포마드·젤 전 enum 바이트 동일).
                // (활성 시에도 각 Tex* 함수가 delta=0에서 항등이라 델타 0 극한 연속.)
                float texCustom = abs(_BrowPowderTexEdge) + abs(_BrowPowderTexGrain)
                                + abs(_BrowPowderTexCoverage) + abs(_BrowPowderTexBody);
                if (texCustom > 1e-5)
                {
                    pigment = TexBody(pigment, luma, _BrowPowderTexBody);   // 발색 두께
                    pigment = TexGrain(pigment, i.uv, _BrowPowderTexGrain); // 입자감
                    amt = TexEdge(TexCoverage(amt, _BrowPowderTexCoverage), _BrowPowderTexEdge);
                }
                // §11 오클루전 — face-skin 양성 게이트(§14 화이트리스트 불필요, Occlusion.cginc 주석).
                return fixed4(pigment, amt * OccludeGate(i.grabPos));
            }
            ENDCG
        }
    }

    FallBack Off
}
