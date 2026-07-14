using UnityEngine;

namespace ARMakeup.Face
{
    // 헤드포즈 프록시(재질 확장) — 랜드마크에서 "시점 각도"와 "움직임 세기"를 뽑아 전역
    // 유니폼(_ViewAngle, _MotionEnergy)으로 흘린다. 글리터 명멸(scintillation)·홀로그램
    // 색이동·메탈 하이라이트 이동의 공통 입력. 정확한 오일러각이 목적이 아니라 "고개를
    // 돌리면 값이 연속적으로 변한다"는 신호가 목적이다.
    //
    // ★ 하위호환: 얼굴이 없으면 프록시를 0으로 감쇠한다. Finish.cginc의 재질/명멸 항은
    //   _ViewAngle=0·_MotionEnergy=0에서 기존 마감과 픽셀 동일(무변조)이 되도록 짜므로,
    //   이 소스가 없거나 얼굴이 없어도 마감이 깨지지 않는다.
    public class HeadPoseSource : MonoBehaviour
    {
        static readonly int ViewAngleId = Shader.PropertyToID("_ViewAngle");
        static readonly int ViewAngleSmoothId = Shader.PropertyToID("_ViewAngleSmooth");
        static readonly int MotionEnergyId = Shader.PropertyToID("_MotionEnergy");

        // MediaPipe FaceMesh 인덱스(안정 랜드마크 위주).
        const int EyeOuterL = 33, EyeOuterR = 263, NoseTip = 1, BrowL = 105, BrowR = 334, MouthTop = 13;

        // 평활/스케일 상수 — 실기기 튜닝 대상.
        const float ViewEma = 0.35f;     // 시점 프록시 평활(지터 억제 ↔ 반응성) — 글리터 명멸용
        const float ViewSlowEma = 0.15f; // 평활 시점 — 재질(메탈/홀로) 색 travel용. 움직이면 서서히 변하되 노이즈 명멸 억제
        const float MotionEma = 0.25f;   // 움직임 세기 평활
        const float MotionScale = 14f;   // 프레임간 시점 변화 → 0..1 매핑
        const float DecayLerp = 0.2f;    // 얼굴 소실 시 0으로 감쇠 속도

        FaceLandmarkSource _src;
        Vector2 _view;      // 평활된 시점 프록시 (x=yaw, y=pitch), 정면 ≈ 0
        Vector2 _viewSlow;  // 강평활 시점 — 재질 색 travel(가만히=고정, 움직이면 서서히)
        Vector2 _prevView;
        float _motion;      // 평활된 움직임 세기 0..1
        bool _primed;

        public void Init(FaceLandmarkSource src)
        {
            _src = src;
        }

        void LateUpdate()
        {
            var src = _src != null ? _src : FaceLandmarkSource.Instance;
            if (src == null || !src.HasFace)
            {
                // 얼굴 소실 — 프록시를 0으로 감쇠해 마감 하위호환(무변조)으로 복귀.
                _view = Vector2.Lerp(_view, Vector2.zero, DecayLerp);
                _viewSlow = Vector2.Lerp(_viewSlow, Vector2.zero, DecayLerp);
                _motion = Mathf.Lerp(_motion, 0f, DecayLerp);
                _primed = false;
                Push();
                return;
            }

            var L = src.Landmarks;
            Vector2 eL = L[EyeOuterL], eR = L[EyeOuterR], nose = L[NoseTip];
            Vector2 browMid = (Vector2)(L[BrowL] + L[BrowR]) * 0.5f;
            Vector2 mouth = L[MouthTop];

            // 요(yaw) 프록시 — 코가 두 눈꼬리 사이 어디에 있나. 고개를 돌리면 원근 단축으로
            // 코의 상대 위치가 좌우로 이동한다. 정면 ≈ 0, 좌/우로 ~±0.5.
            float span = Mathf.Max(Mathf.Abs(eR.x - eL.x), 1e-4f);
            float yaw = ((nose.x - eL.x) / span) - 0.5f;
            // 피치(pitch) 프록시 — 코가 눈썹~입 사이 세로 어디에. 고개를 끄덕이면 이동.
            float vspan = Mathf.Max(Mathf.Abs(mouth.y - browMid.y), 1e-4f);
            float pitch = ((nose.y - browMid.y) / vspan) - 0.5f;

            var raw = new Vector2(yaw, pitch);
            if (!_primed) { _view = raw; _viewSlow = raw; _prevView = raw; _primed = true; }
            _view = Vector2.Lerp(_view, raw, ViewEma);
            _viewSlow = Vector2.Lerp(_viewSlow, raw, ViewSlowEma);

            // 움직임 세기 = 평활된 시점의 프레임간 변화량. 정지 시 ≈0, 돌릴 때 커진다.
            float delta = (_view - _prevView).magnitude;
            _prevView = _view;
            _motion = Mathf.Lerp(_motion, Mathf.Clamp01(delta * MotionScale), MotionEma);

            Push();
        }

        void Push()
        {
            // xy = 시점 프록시(yaw, pitch), z = 움직임 세기(편의 미러), w 예약.
            Shader.SetGlobalVector(ViewAngleId, new Vector4(_view.x, _view.y, _motion, 0f));
            // 강평활 시점 — 재질(메탈/홀로) 색 travel. 노이즈 명멸 없이 움직임에만 서서히 반응.
            Shader.SetGlobalVector(ViewAngleSmoothId, new Vector4(_viewSlow.x, _viewSlow.y, 0f, 0f));
            Shader.SetGlobalFloat(MotionEnergyId, _motion);
        }
    }
}
