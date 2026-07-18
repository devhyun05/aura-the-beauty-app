// 눈썹 틴트. 눈썹 상·하단 랜드마크 아크로 만든 밴드 메시에 그려지며, GrabPass로
// 잡은 실제 눈썹 픽셀을 루마 보존 방식으로 틴트한다.
//
// "결 살리기": 밴드 안에서도 **어두운 픽셀(눈썹 털)에만** 색을 얹고 사이 피부는
// 거의 안 건드린다(luma 기반 hair 마스크). 평평하게 칠하는 게 아니라 실제 털에
// 색소가 얹혀 결이 그대로 보인다. 더 진하게(그루밍)·색 변경 모두 이 방식.
//
// 정점 uv.x = 세로(0 하단 → 1 상단), uv.y = 가로(0 바깥꼬리 → 1 안쪽머리).
// 가장자리(위/아래/양끝)는 소프트 페더로 경계 자연스럽게.
Shader "ARMakeup/Brow"
{
    Properties
    {
        _BrowColor ("Brow Color", Color) = (0.28, 0.20, 0.15, 1)
        _BrowIntensity ("Brow Intensity", Range(0, 1)) = 0.0
        // 털 판정 명도 임계 — 이보다 어두우면 털(1), 밝으면 피부(0).
        // 눈썹 털은 채우되(약간 넉넉히) 밝은 피부는 제외해 결을 살린다.
        _HairLo ("Hair Luma Lo", Range(0, 1)) = 0.30
        _HairHi ("Hair Luma Hi", Range(0, 1)) = 0.62
        // 마감(Tier B) — 0=새틴(기본, 기존 출력) 1=매트 2=듀이. ApplyFinish 레거시 경로.
        _BrowFinish ("Brow Finish (0 satin 1 matte 2 dewy)", Float) = 0
        // 제형(텍스처) — GENERIC 템플릿 enum(0=크림=현행). Finish.cginc TexBundleFromEnum 미러.
        _BrowTexture ("Brow Texture (generic enum)", Float) = 0
    }

    SubShader
    {
        // 얼굴 메이크업(3000) 뒤. 눈썹은 눈 위라 다른 오버레이와 안 겹침.
        Tags { "Queue" = "Transparent+7" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

        GrabPass { "_CameraFeed" } // 공유 그랩

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
            float _BrowFinish; // 마감(Tier B) — 0=새틴=기존 출력(하위호환)
            float _BrowTexture; // 제형(텍스처) GENERIC 템플릿(0=크림=현행)

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0; // x=세로(0하→1상), y=가로(0바깥→1안)
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float4 grabPos : TEXCOORD1;
            };

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
                // 결 보존: 어두운 털에만 색, 밝은 피부는 제외.
                float hair = 1.0 - smoothstep(_HairLo, _HairHi, luma);

                // 밴드 가장자리 소프트 페더(위/아래/양끝) — 하드 경계 방지.
                float vEdge = smoothstep(0.0, 0.18, i.uv.x) * (1.0 - smoothstep(0.82, 1.0, i.uv.x));
                float hEdge = smoothstep(0.0, 0.12, i.uv.y) * (1.0 - smoothstep(0.88, 1.0, i.uv.y));

                // 제형(텍스처) — GENERIC 시드 번들. body/grain=색소, coverage/edge=커버 amt.
                // enum 0(크림)=ZERO → 네 헬퍼 조기 반환 = 바이트 동일(하위호환).
                float browTexE, browTexG, browTexC, browTexB;
                TexBundleFromEnum(0.0, _BrowTexture, browTexE, browTexG, browTexC, browTexB);
                float amt = hair * vEdge * hEdge * _BrowIntensity;
                amt = TexEdge(TexCoverage(saturate(amt), browTexC), browTexE); // 제형 커버·엣지

                // 색소 — 어두운 털에서도 선택한 색이 보이도록 base를 올린다.
                // (base 0.1이면 luma 낮은 털에서 색이 검정으로 뭉개짐). luma 항으로
                // 털 사이 명암(결)은 유지하되 색은 살린다.
                fixed3 pigment = _BrowColor.rgb * PigmentBaseKnee(luma, 1.0, 0.35, BROW_KNEE);
                pigment = TexBody(pigment, luma, browTexB); // 제형 발색 body
                // 마감 — 0=새틴=무변형(ApplyFinish 레거시 경로, 세부 6값 0). 결 틴트라
                // 시머 게인 0. sparkleUV=밴드 uv.
                pigment = ApplyFinish(pigment, luma, i.uv, _BrowFinish, 0,
                                      0, 0, 0, 0, 0, 0, screenUV, _PearlLightGain);
                pigment = TexGrain(pigment, i.uv, browTexG); // 제형 그레인

                // §11 오클루전 — face-skin 양성 게이트라 §14 눈썹 화이트리스트 함정 없음
                // (hair 지우개 미사용 — Occlusion.cginc 검증 주석). 앞머리가 눈썹을 덮으면
                // 가려지는 것이 정상 동작.
                return fixed4(pigment, amt * OccludeGate(i.grabPos));
            }
            ENDCG
        }
    }

    FallBack Off
}
