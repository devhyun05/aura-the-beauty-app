# Glam2 속눈썹/아이라인 작업 인수인계 (Claude → Codex)

작성: 2026-07-22. 이 문서는 Claude가 하던 Unity AR 메이크업(글램 2.0) 작업을 Codex가 이어받기 위한 것.
**먼저 이 문서를 끝까지 읽고, 그다음 `docs/unity-ar/GLAM2_WORKLOG_KO.md`(전체 이력)를 읽을 것.**

> **핵심 워크플로우 한 줄 요약**: 코드/셰이더/텍스처 변경 → (셰이더면 ForceUpdate 리임포트) → Unity `execute_code`로 self1 얼굴에 glam2 올리고 게임뷰 캡처 → `captures/`에 비교 시트 만들어 **사용자에게 보여주고 판정** → 승인되면 approved/ 백업 + 워크로그 기록. **에디터 안에서만 반복 검증하고, 실기기 빌드는 사용자가 "실기기 가자" 할 때만.**
>
> **용어 정리 (혼동 주의)**:
> - **self1** = 메인 테스트 얼굴(남성 셀피, 앞머리 없음, 속눈썹 성김). 거의 모든 판정을 여기서 함.
> - **DL1** = 위 속눈썹 도안(`다운로드.png` 1행에서 추출) → 에셋 `lash_glam.png`.
> - **low1a** = 아래 속눈썹 도안(`1a9bec9d…jpg`) → 에셋 `lash_glam_lower.png`.
> - **v5** = 확정된 아이라이너 도안 = `default_eyeliner.png` = `approved/eyeliner_v5_orig.png`.
> - **"불투명화"** = 셰이더 알파 레벨 리맵(§5). "재추출 시 불투명화"(파이썬 텍스처, §6)와 "셰이더 불투명화"(런타임 `_AlphaLo/_AlphaHi`) **둘 다 있음** — 지금은 텍스처를 이미 불투명하게 재추출했으니 셰이더 리맵은 약하게/꺼도 됨. 이중 적용 주의.

---

## 0. 지금 당장 다음에 할 일 (한 줄)

DL1(위)·low1a(아래) 속눈썹 텍스처를 **"밀도보강 제거 + 비례유지 + 불투명화"** 방식으로 깨끗하게 재추출해 `Assets/Resources/lash_glam.png` / `lash_glam_lower.png`에 이미 승격했고, self1 얼굴에 올려 방금 캡처(`panel/clean-lash-self1.png`)한 상태. **이 캡처를 사용자에게 보여주고 판정받는 것**이 다음 액션. 판정 좋으면 → 실기기 재빌드. 나쁘면 → 텍스처 틈/굵기/불투명 파라미터 조정.

---

## 1. 프로젝트 구조 / 핵심 파일 위치

리포 루트: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/`

### Unity (엔진, 실제 렌더링)
- 프로젝트: `apps/unity/MakeupAR/`
- **속눈썹 렌더러**: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/LashRenderer.cs`
- **아이라이너 렌더러**: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/EyelinerStyleRenderer.cs`
- **속눈썹 셰이더**: `apps/unity/MakeupAR/Assets/Resources/LashTexture.shader`
- **립 셰이더** (GrabPass 참조 예시): `apps/unity/MakeupAR/Assets/Resources/Lip.shader`
- **속눈썹 텍스처 에셋**: `apps/unity/MakeupAR/Assets/Resources/lash_glam.png`(위), `lash_glam_lower.png`(아래)
- **아이라이너 텍스처**: `apps/unity/MakeupAR/Assets/Resources/default_eyeliner.png` (= v5, 백업은 `docs/unity-ar/glam2-refs/approved/eyeliner_v5_orig.png`)
- 브릿지(RN→Unity 메시지): `.../ARwithFable/Bridge/NativeBridge.cs`, `BridgeMessages.cs`

### 모바일 (RN, 화면/프리셋)
- 프리셋: `apps/mobile/src/features/ar/stencil/src/presets.ts` (`glam2` 프리셋 있음)
- 프리셋 등록: `apps/mobile/src/features/ar/stencil/src/composer/lookTree.ts` (`SYSTEM_PRESET_IDS`에 `glam2` 포함)
- 필터 파라미터 타입: `apps/mobile/src/features/ar/stencil/src/bridge/types.ts`

### 작업 산출물
- **전체 이력 워크로그**: `docs/unity-ar/GLAM2_WORKLOG_KO.md` ← 필독
- **판정 캡처 시트**: `docs/unity-ar/glam2-refs/captures/` (0721-*, 0722-* 파일들)
- **원본 속눈썹 샘플**: `docs/unity-ar/glam2-refs/속눈썹 샘플/` (한글 폴더명 주의)
- **승인 에셋 백업**: `docs/unity-ar/glam2-refs/approved/`
- **테스트 얼굴 패널**: `panel/` (리포 루트) — `self1.png`+`self1-lm.txt`(남성 셀피, 앞머리 없음, 메인 테스트), `self2.png`(앞머리 있음), `model.png`(여성 모델, 속눈썹 뚜렷)
  - `*-lm.txt` = 478 랜드마크 (첫 줄 `W H`, 이후 478줄 `x y z` 정규화). mediapipe tasks(`face_landmarker.task`)로 추출.

---

## 2. Unity 조종 방법 (MCP)

Claude는 UnityMCP로 에디터를 조종했다. Codex도 동일 MCP 사용:
- `mcp__UnityMCP__manage_editor` (play/stop)
- `mcp__UnityMCP__execute_code` (C# 인라인 실행 — 리플렉션으로 렌더러 필드 접근)
- `mcp__UnityMCP__refresh_unity` (스크립트 컴파일)
- `mcp__UnityMCP__read_console`

**에디터가 켜져 있어야 붙는다.** `.mcp.json`이 http 8080으로 연결.

### 에디터에서 self1 얼굴에 메이크업 올리는 표준 셋업 코드 (execute_code로 실행)
매번 이 순서: ①가이드 제외한 Face 컴포넌트 활성화 + MakeupController on + OnGUI 디버그 2종(FaceTrackingStatusReporter, MakeupRegionDebugControls) off ②FramePresenter MeshRenderer on ③self1 랜드마크+이미지 로드 → `FaceLandmarkSource.BeginExternalMode()` + `PushExternalFrame(na, W, H, lmr, true)` (이미지는 세로 뒤집어 로드: `srcRow = H-1-y`) ④`NativeBridge.OnMessageFromRN(json)`으로 glam2 필터 적용 ⑤아이라이너 텍스처를 `EyelinerStyleRenderer._material`에 `LineTexId`로 SetTexture ⑥`QueuePlayerLoopUpdate()` 여러 번 후 캡처.

**주의**: `execute_code`는 매번 상태가 초기화되지 않음(에디터가 살아있으면 이전 상태 유지). 하지만 **셰이더/텍스처를 재임포트하면 material 참조가 끊길 수 있으니**, 리임포트 후엔 위 셋업을 처음부터 다시 실행하는 게 안전. 또 **캡처 이미지는 반드시 Read 툴로 직접 눈으로 확인**할 것(파일만 저장하고 판단하지 말 것). 판정 시트는 항상 **before/after 나란히** + **눈 부위 확대**(랜드마크 33/133/263/362 등으로 크롭)로 만들어야 사용자가 판단 가능.

전체 코드는 워크로그/이 세션 히스토리에 반복 등장. glam2 필터 JSON:
```json
{"type":"applyFilter","filter":{"lipColor":"#C75A70","lipColor2":"#8F0F2A","lipGradient":1.0,"lipIntensity":0.3,"lipFinish":2,"lipTexture":2,"lipGlossColor":"#FFFFFF","lipGlossIntensity":0.7,"lipGlossShape":2,"eyelinerColor":"#2B2220","eyelinerStyleIntensity":0.85,"mascaraColor":"#141014","mascaraIntensity":0.95,"mascaraStyle":1,"mascaraLength":1.0,"mascaraTexStyle":3,"lowerLashIntensity":1.0,"lowerLashLength":0.65}}
```

---

## 3. 절대 반복하면 안 되는 실수 (Claude가 실제로 저지른 것들)

### 캡처 관련
1. **GrabPass 셰이더는 수동 `cam.Render()→2xRT` 경로에 안 잡힘.** 립·(이제)LashTexture 같은 GrabPass 셰이더는 **게임뷰 `ScreenCapture.CaptureScreenshotAsTexture()`로만** 캡처된다. 아이라이너/일반 셰이더는 2xRT OK.
2. **셰이더 파일 편집 후 `refresh_unity`만으론 재컴파일 안 됨.** 반드시 `UnityEditor.AssetDatabase.ImportAsset("Assets/Resources/LashTexture.shader", ForceUpdate)` + `material.shader = Shader.Find(...)` 재바인딩.
3. **프레임 push 직후 캡처하면 스테일 프레임을 잡음** — `PushExternalFrame` 후 `QueuePlayerLoopUpdate()` 8~12회 돌리고 캡처.
4. **텍스처 리임포트 후 캡처도 마찬가지** — 정점 갱신에 몇 틱 필요.

### 렌더러 material 관련
5. **`renderer.material`을 읽기만 해도 머티리얼이 복제·분리**되어 이후 파라미터 적용이 화면에 안 보임. 진단은 **`.sharedMaterial`만** 쓸 것.
6. `execute_code`에서 리플렉션으로 `LashRenderer._texMaterial`/`_lowerTexMaterial`, `EyelinerStyleRenderer._material` 접근.

### 코드/배열 관련 (실제 크래시 유발)
7. **`SubdivideArc(ctrl, n, out)`의 `out` 배열 크기 초과 금지.** `_lash`는 `Seg=25`칸. 컨트롤 점을 늘리면(`LidPts+1`=10점 서브디비전=28점) **매 프레임 IndexOutOfRange**로 **상단 리본이 통째로 안 그려진다**(정점 원점 방치, bounds 0). Claude가 "UpperTailExt 꼬리연장"을 넣었다가 이 크래시로 상단 속눈썹이 며칠간 안 보였음. **배열 크기를 함께 늘리지 않는 한 컨트롤 점 추가 금지.**
8. 컴파일 에러/크래시는 `read_console`로 항상 확인. XR 관련 에러("No active XRSessionSubsystem" 등)는 무해한 상시 노이즈 — 무시.

### 배포 관련 (중대)
9. **실기기 테스트 전 반드시 `apps/mobile/ios/UnityBuild/` 산출물 타임스탬프 확인.** Claude가 xcodebuild만 하고 **ditto 설치 3줄을 빼먹어** 옛 엔진이 폰에 들어갔고, 그걸 모르고 "지오메트리 버그"라 오진함. **"뭐가 그려졌나" 전에 "뭐가 설치됐나"부터 확인.**
10. **디스크 여유 확인** (`df -h /`). 8GB 미만이면 Xcode DerivedData 캐시 정리 먼저. 익스포트+xcodebuild가 수 GB 씀 → "disk is full"로 빌드 사망한 적 있음.
11. **iOS 서명 파일 커밋 금지**: `apps/mobile/app.json`, `ios/AURA.xcodeproj/project.pbxproj`, `AURA.entitlements`, `Podfile.lock` — 사용자 개인 서명(팀 9G4K6N63MK, 번들 `com.aurathebeautyapp.wei.mobile`). 기존 변경분은 워킹트리에 그대로 둘 것.
12. **Unity ProjectSettings/씬/패키지 매니페스트 변경도 커밋 금지** (에디터 세션 잔여물).

### 진단 태도
13. **검증 안 된 전제 위에서 진단하지 말 것.** Claude는 실기기 붕괴를 "크기 공식 과적합"으로 정교하게 오진했는데 실제론 설치 누락이었음.
14. **가로 방향/위치 판정은 육안 말고 10-bin 수치 프로파일로.** 시각 오판(좌우반전 등)이 잦았음.
15. **단일 테스트 얼굴에 과적합 금지.** self1 하나로 튜닝하면 다른 눈에서 깨짐. self1(성긴 남성)+model(뚜렷 여성) 둘 다 확인. per-face 튜닝 상수 만들지 말 것.

---

## 4. 지금까지 확정된 것 (건드리지 말 것)

### 아이라이너 — **확정 (사용자 "완벽")**
`EyelinerStyleRenderer.cs`:
- 텍스처 = 순정 v5 (`default_eyeliner.png` = `approved/eyeliner_v5_orig.png`). AI 생성본(New Sprite 19/20)·SDF 두께업은 **전부 실격**(모양 왜곡·이음선).
- **윙 = 코너 출발 2점 아크** (`CtrlPts = LidPts + 2`). `WingRise = 0.22`(거의 수평, 끝만 ~12° 상향), `WingLenFactor = 0.42`, `TailThick = 1.4`(꼬리 밴드폭 램프, smoothstep 0.6~1).
- **밀착 수정**: `RawFollow = 0.5`(아크피팅 50% 완화, 원본 랜드마크 체인 쪽으로), `MidTuck = 0.02`(눈 중앙 국소 턱), `BandTuck = 0.015`(눈알 침범 방지).
- **법선 스무딩**: `_nrm` 넓은 스텐실(±2)+2패스 → 윙 접합 자기접힘/이음선 제거.
- **교훈**: 두께·모양·윙은 "도안이 소유", 코드는 "앉히기만". 후처리 두께업(SDF/컬럼스케일)은 이음선·왜곡 유발 → 금지.

### 립 — **확정 (D안, 사용자 승인)**
`presets.ts`의 `glam2`: lipColor `#C75A70` / lipColor2 `#8F0F2A` / lipGradient 1.0 / lipIntensity **0.3** / lipFinish 2(글로시) / lipTexture 2(워터틴트) / lipGloss 0.7·shape 2(아랫입술).
- 시머(lipFinish 3)는 **사각 블록 노이즈 버그** → 사용 금지(별도 수리 대상).

### glam2 프리셋 등록 완료
`presets.ts`에 glam2, `lookTree.ts` `SYSTEM_PRESET_IDS`에 추가. tsc 클린 확인됨.

---

## 5. 속눈썹 — 진행 중 (핵심 미해결 → 방금 돌파 시도)

### 문제의 본질 (수많은 시도 끝에 확정된 진단)
작은 화면 스케일(눈 세로 ~20-30px, 속눈썹 영역 ~15px)에서 **속눈썹이 뭉쳐서 개별 털이 안 보인다.** 근본 원인 2개:
1. **반투명(알파 ~0.29)** → 밉맵 축소 시 알파가 평균돼 투명 쪽으로 **씻겨나감**(불투명 사진은 덩어리로 남지만 반투명은 사라짐).
2. **촘촘·겹침 도안** → 틈이 좁아 축소 시 틈이 먼저 뭉개져 덩어리.
3. **물리적 상한**: 15px에 "털1px+틈1px"이면 최대 **7~8가닥**만 개별로 보임. 30가닥은 어떤 방법으로도 불가. SODA도 작은 스케일에선 이 정도(+ 어두운 뿌리선 + haze). `captures/0722-soda-upper-vs-lower.png` 참조.

### 폐기된 접근 (다시 시도 금지, 이유 포함)
- **한올 per-strand 지오메트리**: 컬 99.94% 보존했으나 여전히 서브픽셀로 사라짐(가는 반투명 스프라이트라서). `captures/0722-strand-replay-gate2.png`.
- **enhance-real (GrabPass로 실제 속눈썹 증폭)**: `LashTexture.shader`에 GrabPass·검출기 구현했고 **작동 확인**(GATE 0/1 통과, `captures/0722-gate1-ab.png`). 그러나 **사용자 지적으로 폐기**: 사용자 실제 속눈썹은 아래로 처져 있어 증폭하면 글램(위로 솟음)과 충돌. **글램엔 부적합**(향후 "내추럴" 프리셋 옵션으로만 보류). GrabPass 코드는 `_LashDebug` 기본 0이라 dormant·무회귀 상태로 셰이더에 남아있음.
- **tightline (방향무관 뿌리선)**: `_LashDebug` mode 4. 지저분(울퉁불퉁 검은 띠) → 폐기.

### **현재 채택 방향 (사용자 "이거잖아 이거" 승인)**
**샘플이 문제였다.** DL1 원본 소스(`속눈썹 샘플/다운로드.png` 1행)는 낱낱이 예쁜데, Claude 파이프라인의 ①**밀도보강(mid-density fill)** ②**폭 512 과충전**이 떡지게 만들었음(`captures/0722-dl1-source-vs-processed.png`). 이 둘을 빼고 **불투명화**하니 개별 털이 살아남(`captures/0722-dl1-clean-reextract.png`, 사용자 승인).

**방금 한 작업 (미검증)**: 두 텍스처를 깨끗하게 재추출해 Resources에 이미 덮어씀:
- 위 `lash_glam.png` = DL1 재추출 (256행)
- 아래 `lash_glam_lower.png` = low1a 재추출 (128행, 앞머리 40% 공백)
- 재추출 레시피(파이썬, 아래 §6): 밀도보강 없음 + 종횡비 유지 + **불투명화 레벨 리맵** `alpha = clamp((a-0.14)/0.30, 0,1)`.
- Unity에서 리임포트 후 self1에 올려 `panel/clean-lash-self1.png` 캡처함 → **아직 사용자가 안 봄. 이걸 보여주고 판정받는 게 다음 스텝.**

### LashTexture.shader 현재 상태
- `GrabPass { "_CameraFeed" }` 있음(dormant, enhance-real 잔재).
- `_LashDebug` float: 0=합성(기본), 1=원시피드(초록), 2=enhance, 3=하이브리드, 4=tightline. **프로덕션은 0.**
- **mode 0에 불투명화 추가됨**: `_AlphaLo`(기본 0.12/세팅 0.14), `_AlphaHi`(0.40/세팅 0.38)로 알파 레벨 리맵. 이게 "반투명 씻김" 해결책. LashRenderer에서 `_texMaterial`/`_lowerTexMaterial`에 SetFloat로 넣어줌(§2 셋업 코드 참조).
- mode 1~4 코드는 남겨도 되고 나중에 정리해도 됨(dormant).

### 속눈썹 관련 확정 파라미터 (glam2)
`mascaraTexStyle 3`(=lash_glam), `mascaraLength 1.0`, `mascaraIntensity 0.95`, `lowerLashIntensity 1.0`, `lowerLashLength 0.65`.
LashRenderer 상수: `LowerTexLenFactor 0.15`, `LowerRibbonLift 0.008`, 아래 리본 컬럼 길이 균일화(텍스처 경로만).

### 남은 미해결 이슈 (사용자가 지적함, 아직 안 고침)
1. **아래 속눈썹 뿌리가 눈알 침범** — 아래 리본 루트 위치(`LowerRibbonLift`/턱) 지오메트리. 워터라인 아래로 내려야 함.
2. **위 속눈썹 위쪽 눈꺼풀에 얇은 검은 점선** — 위 리본 상단(팁) 경계 아티팩트(DL1 텍스처 뿌리앵커 or 리본 테두리). 제거 필요.
3. 위 두 개는 재추출본 판정 후 처리.

---

## 6. 속눈썹 텍스처 재추출 파이썬 레시피 (재현용)

`/tmp`에서 실행. 절대경로 사용(working dir이 바뀌면 상대경로 깨짐).

```python
from PIL import Image
import numpy as np
R="/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/"

def clean_extract(src_path, box, out_h, gap_frac=0.0, mirror=False):
    src = Image.open(src_path).convert("L")
    cell = src.crop(box)
    if mirror: cell = cell.transpose(Image.FLIP_LEFT_RIGHT)
    S=4
    big = cell.resize((cell.width*S, cell.height*S), Image.BICUBIC)
    g = np.asarray(big).astype(np.float32)
    bg = np.median(np.concatenate([g[0],g[-1],g[:,0],g[:,-1]]))   # 배경=테두리 중앙값
    ink = np.percentile(g,1)
    a = np.clip((bg-g)/max(bg-ink,20),0,1); a[a<0.04]=0            # 절대밝기 알파 (잉크정규화 아님)
    rows=np.where(a.max(1)>0.05)[0]; cols=np.where(a.max(0)>0.05)[0]
    u = a[rows.min():rows.max()+1, cols.min():cols.max()+1]        # 내용 bbox
    ch,cw=u.shape
    newW=512; newH=max(8,int(ch*newW/cw))                          # ★ 종횡비 유지(과충전 X)
    img = Image.fromarray((np.clip(u,0,1)*255).astype(np.uint8)).resize((newW,newH),Image.LANCZOS)
    arr=np.asarray(img).astype(np.float32)
    canvas=np.zeros((out_h,newW),np.float32)
    h2=min(newH,out_h); canvas[out_h-h2:,:]=arr[newH-h2:,:]        # 뿌리=하단(v0)
    if gap_frac>0:                                                 # 앞머리 공백(아래용)
        x=np.arange(newW); fade=np.ones(newW,np.float32)
        gp=int(newW*gap_frac); fade[:gp]=0; fade[gp:gp+8]=np.linspace(0,1,8)
        canvas*=fade[None,:]
    op=np.clip((canvas/255.0-0.14)/0.30,0,1)                       # ★ 불투명화 레벨 리맵
    have=op.max(0)>0.1; op[-1:,have]=np.maximum(op[-1:,have],0.6)  # 뿌리 앵커 최소
    tex=np.zeros((out_h,512,4),np.uint8); tex[...,3]=(op*255).astype(np.uint8)
    return Image.fromarray(tex,"RGBA")

# 위 = DL1 (다운로드.png 1행)
up = clean_extract(R+"docs/unity-ar/glam2-refs/속눈썹 샘플/다운로드.png", (590,30,1140,290), 256)
up.save(R+"apps/unity/MakeupAR/Assets/Resources/lash_glam.png")
# 아래 = low1a (1a9bec9d…jpg), 앞머리 40% 공백
low = clean_extract(R+"docs/unity-ar/glam2-refs/속눈썹 샘플/1a9bec9d78817015ce809bdc9b3d63a6.jpg", (5,380,1194,1040), 128, gap_frac=0.40)
low.save(R+"apps/unity/MakeupAR/Assets/Resources/lash_glam_lower.png")
```

**틈을 더 벌리거나 더 굵게** 하고 싶으면(개별 털 더 살리기): `clean_extract` 뒤에 세로 틈 마스크(주기적 투명 스트립) + `scipy.ndimage.grey_dilation`으로 굵게. 단, 직선 컷은 곡선 털을 어색하게 자르므로 주의(§5 참조). 정 안 되면 **Unity AI로 "적고(14가닥) 벌어지고 굵고 불투명한" 도안 신규 생성**이 대안.

핵심 원칙(재추출 계약):
- **밀도보강(mid-density fill) 절대 금지** — 떡짐·이음매의 주범.
- **폭 512 과충전 금지** — 종횡비 유지.
- **잉크 정규화 금지** — 절대밝기 알파 `(bg-g)/bg`. 진하기는 불투명화 레벨 리맵으로.
- **방향 규약**: 뿌리=텍스처 하단(v0), 위·아래 공통. (아래를 반대로 저장하면 상하 반전돼 위로 솟음 — 과거 버그.)
- 밉맵+Trilinear+aniso4는 임포트 설정 유지.

---

## 7. 실기기 빌드/실행 절차 (필요 시)

Unity 재빌드가 필요한 경우(C#/에셋 변경을 폰에서 확인):
```bash
cd /Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine
# 1) Unity 에디터 메뉴: "Makeup AR Validation > Export + Build Framework + Install Into RN" (3단계 자동)
#    또는 수동으로 아래:
# 2) xcodebuild (프레임워크)
xcodebuild -project apps/unity-builds/ios-export/Unity-iPhone.xcodeproj \
  -scheme UnityFramework -configuration Release -destination "generic/platform=iOS" build \
  CONFIGURATION_BUILD_DIR="$PWD/apps/unity-builds/framework" CODE_SIGNING_ALLOWED=NO
# 3) ★ ditto 설치 (Claude가 빼먹어 오진한 단계 — 절대 빠뜨리지 말 것)
ditto apps/unity-builds/framework/UnityFramework.framework apps/mobile/ios/UnityBuild/UnityFramework.framework
ditto apps/unity-builds/ios-export/Data apps/mobile/ios/UnityBuild/Data
ditto "apps/unity-builds/ios-export/Frameworks/com.github.homuler.mediapipe/Runtime/Plugins/iOS/MediaPipeUnity.framework" apps/mobile/ios/UnityBuild/MediaPipeUnity.framework
# 4) 설치 확인: apps/mobile/ios/UnityBuild/ 타임스탬프가 방금인지 볼 것
# 5) 앱 실행 (기기 UDID 지정 — 비대화형 셸이면 필수)
cd apps/mobile && npx expo run:ios --device 00008140-000924DE21BB801C
```
기기: "위승철의 iPhone" UDID `00008140-000924DE21BB801C`. 같은 WiFi면 Metro IP 자동. Mac WiFi IP 예: `172.21.102.157`(변동 가능, `ipconfig getifaddr en0`).

---

## 8. 커밋 상태

- 브랜치 `feature/glam2-lash-lip`에 3커밋 완료(AR 렌더러·에셋 / 모바일 프리셋 / 문서). detached HEAD였어서 브랜치 생성함.
- **그 이후 미커밋 변경**(이번 세션): EyelinerStyleRenderer.cs(윙 아크·밀착·꼬리두께), LashTexture.shader(GrabPass·모드·불투명화), LashRenderer.cs(UpperTailExt 제거·크래시픽스), lash_glam.png/lash_glam_lower.png(재추출), 워크로그, captures. **속눈썹 판정 끝나고 커밋할 것.**
- 커밋 금지 목록은 §3-11,12 참조.
- 커밋 메시지 끝: `Co-Authored-By: ...` (기존 컨벤션 따를 것).

---

## 9. 사용자 작업 스타일 (중요)

- 한국어로 소통. 짧고 직접적. **판정은 사용자가 얼굴 캡처를 보고 함** — 매 변경마다 self1(또는 model)에 올려 캡처 시트를 `captures/`에 만들고 보여줄 것.
- 사용자는 육안 관찰이 예리함(이음선·방향·떡짐 다 잡아냄). 사용자 직감을 신뢰할 것(반투명→불투명 통찰이 정확했음).
- **추측으로 밀어붙이지 말고**, 원인을 코드/수치로 확인한 뒤 최소 변경. 애매하면 캡처로 검증.
- 사용자가 "이거잖아 이거"/"완벽"이라 하면 확정. 그 상태를 approved/에 백업하고 워크로그에 기록.
- 완료 응답 끝에는 CLAUDE.md 규약대로 한국어 Context Bundle(목표/결과요약/다음스탭) 붙일 것.

---

## 10. 첫 액션 체크리스트 (Codex가 시작할 때)

1. 이 문서 + `GLAM2_WORKLOG_KO.md` 읽기.
2. Unity 에디터 켜져 있는지 확인(`read_console` 또는 `manage_editor`).
3. `panel/clean-lash-self1.png` **Read 툴로 열어서** 현재 재추출 속눈썹 상태 확인(방금 캡처됨).
4. 사용자에게 이 캡처 보여주고 판정받기. (좋으면 눈알침범·점선 아티팩트 수정 → 실기기. 나쁘면 텍스처 틈/굵기 조정.)
5. 모든 변경은 self1 캡처로 검증하며 진행.

### 자주 헷갈리는 것 (최종 정리)
- **에디터 vs 실기기**: 에디터 게임뷰는 실기기보다 해상도가 낮아 더 불리하게 보임. "에디터에서 되면 실기기에선 더 낫다"가 대략 성립. 최종 화질 판정은 실기기이되, **반복 튜닝은 전부 에디터에서** (빌드는 느리고 비쌈).
- **속눈썹이 안 보일 때 체크 순서**: ①`MascaraTex` GameObject의 MeshRenderer bounds가 (0,0,0)인가? → 리본 크래시(§3-7, IndexOutOfRange) 의심, `read_console` 확인. ②`_LashDebug`가 0인가? → 1~4면 디버그 모드. ③material `_AlphaHi`가 너무 낮아 다 투명해졌나? ④`mascaraTexStyle`가 3인가?
- **"샘플이 문제"의 진짜 의미**: 원본 샘플은 좋다. Claude 파이프라인의 **밀도보강+과충전**이 망친 것. 그러니 새 샘플 찾기 전에 **재추출 계약(§6)**부터 지킬 것. 그래도 부족하면 그때 Unity AI 신규 생성.
- **아이라이너·립은 확정**이니 속눈썹 작업 중 실수로 건드리지 말 것. glam2 필터 JSON에 이미 다 들어있음(그대로 쓰면 됨).
