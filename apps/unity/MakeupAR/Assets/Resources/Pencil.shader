// 눈썹 펜슬 — 절차적으로 그린 개별 털 스트로크(가는 테이퍼 쿼드)를 렌더한다.
// PencilRenderer가 눈썹 결 방향으로 스트로크 지오메트리를 매 프레임 생성하고, 이
// 셰이더가 GrabPass 루마 보존 색소로 칠한다.
//
// 정점 uv.x = 스트로크 길이(0 뿌리 → 1 끝, 끝으로 페이드), uv.y = 폭(0~1, 가운데 진함).
Shader "ARMakeup/Pencil"
{
    Properties
    {
        _BrowColor ("Pencil Color", Color) = (0.24, 0.17, 0.12, 1)
        _BrowIntensity ("Pencil Intensity", Range(0, 1)) = 0.0
        // 마감(Tier B) — 0=새틴(기본, 기존 출력) 1=매트 2=듀이. ApplyFinish 레거시 경로.
        // 이 셰이더는 세 머티리얼 인스턴스(펜슬·위 속눈썹·아래 속눈썹)가 공유하며,
        // 각 인스턴스가 자기 _PencilFinish 값을 독립 SetFloat 한다.
        _PencilFinish ("Pencil Finish (0 satin 1 matte 2 dewy)", Float) = 0
        // 제형(텍스처) — browPencil template(13). -1=필드 부재/레거시 무변조.
        // 펜슬 인스턴스만 세팅 — 마스카라(위·아래) 인스턴스는 기본 0 → 무영향(하위호환).
        _PencilTexture ("Pencil Texture (domain enum)", Float) = -1
    }

    SubShader
    {
        // 밴드 제품들(+5~7) 위에 털을 얹는다.
        Tags { "Queue" = "Transparent+8" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

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
            #include "BrowResponse.cginc"

            fixed4 _BrowColor;
            float _BrowIntensity;
            float _PencilFinish; // 마감(Tier B) — 0=새틴=기존 출력(하위호환, 인스턴스별 독립)
            float _PencilTexture; // 브로우 펜슬 template(13): -1=레거시, 0=샤프 펜슬 1=크레용 2=틴트펜

            struct appdata { float4 vertex : POSITION; float2 uv : TEXCOORD0; float browSide : TEXCOORD3; };
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; float4 grabPos : TEXCOORD1; float browSide : TEXCOORD2; };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                o.grabPos = ComputeGrabScreenPos(o.pos);
                o.browSide = v.browSide;
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 screenUV = i.grabPos.xy / i.grabPos.w;
                fixed3 feed = tex2D(_CameraFeed, screenUV).rgb;
                float3 exposure = BrowResponseExposure(i.browSide);
                fixed3 normalizedFeed = BrowResponseNormalizeFeed(feed, exposure);
                float normalizedLuma = BrowResponseLuma(normalizedFeed);

                // 끝으로 갈수록 가늘게 페이드(뿌리 진함 → 끝 사라짐), 가장자리도 페더.
                float taper = 1.0 - smoothstep(0.5, 1.0, i.uv.x);
                float edge = 1.0 - smoothstep(0.4, 1.0, abs(i.uv.y * 2.0 - 1.0));
                // 브로우 펜슬 template(13) 시드 번들. body/grain=색소, coverage/edge=스트로크 amt.
                // -1=레거시 무변조, enum 0=샤프 펜슬 시드를 명시 적용한다.
                float pnTexE, pnTexG, pnTexC, pnTexB;
                TexBundleFromEnum(13.0, _PencilTexture, pnTexE, pnTexG, pnTexC, pnTexB);
                float amt = taper * edge * _BrowIntensity;
                amt = TexEdge(TexCoverage(saturate(amt), pnTexC), pnTexE); // 제형 커버·엣지

                fixed3 pigment = _BrowColor.rgb * PigmentBaseKnee(normalizedLuma, 0.9, 0.4, BROW_KNEE);
                pigment = TexBody(pigment, normalizedLuma, pnTexB); // 제형 발색 body
                // 마감 — 0=새틴=무변형(ApplyFinish 레거시 경로, 세부 6값 0). 스트로크라
                // 시머 게인 0. sparkleUV=스트로크 로컬 uv.
                pigment = ApplyFinish(pigment, normalizedLuma, i.uv, _PencilFinish, 0,
                                      0, 0, 0, 0, 0, 0, screenUV, _PearlLightGain);
                pigment = TexGrain(pigment, i.uv, pnTexG); // 제형 그레인
                pigment = BrowResponseReapplyExposure(pigment, exposure);
                // §11 오클루전 — 손·머리카락이 앞이면 그 픽셀 색소 제외(세그 없으면 1).
                // 이 셰이더는 눈썹 펜슬·마스카라(LashRenderer)가 공유 — 게이트 동일 적용.
                return fixed4(pigment, amt * OccludeGate(i.grabPos));
            }
            ENDCG
        }
    }

    FallBack Off
}
