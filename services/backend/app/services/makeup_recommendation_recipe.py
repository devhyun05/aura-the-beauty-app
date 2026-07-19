"""Build reproducible, shop-order makeup application plans for recommendation guides."""

from copy import deepcopy
import re
from typing import Any


APPLICATION_RECIPE_VERSION = "makeup-application-v1"
AREA_APPLICATION_ORDER = {
  "base": 1,
  "brow": 2,
  "eye": 3,
  "cheek": 4,
  "lip": 5,
}
AREA_TIME_WEIGHTS = {
  "base": 0.27,
  "brow": 0.15,
  "eye": 0.30,
  "cheek": 0.12,
  "lip": 0.16,
}
AREA_MIN_STEPS = {
  "base": 4,
  "brow": 3,
  "eye": 5,
  "cheek": 3,
  "lip": 3,
}
AREA_FALLBACK_COLORS = {
  "base": ("뉴트럴 베이지", "#D9B49A"),
  "brow": ("내추럴 브라운", "#795548"),
  "eye": ("소프트 토프", "#9B7F74"),
  "cheek": ("로지 피치", "#D98E8E"),
  "lip": ("뮤티드 로즈", "#A85D68"),
}
_HEX_PATTERN = re.compile(r"^#[0-9A-Fa-f]{6}$")
_STEP_TEXT_FIELDS = (
  "title",
  "productType",
  "tool",
  "amount",
  "placement",
  "technique",
  "blending",
  "finishCheck",
)


def _mix_hex(value: str, target: tuple[int, int, int], ratio: float) -> str:
  if not _HEX_PATTERN.fullmatch(value):
    value = "#8B756A"
  source = tuple(int(value[index : index + 2], 16) for index in (1, 3, 5))
  mixed = tuple(
    round(channel + (target_channel - channel) * ratio)
    for channel, target_channel in zip(source, target)
  )
  return "#" + "".join(f"{channel:02X}" for channel in mixed)


def _guide_color(area: str, guide: dict[str, Any]) -> tuple[str, str]:
  fallback_name, fallback_hex = AREA_FALLBACK_COLORS[area]
  color = guide.get("color") if isinstance(guide.get("color"), dict) else {}
  name = str(color.get("name") or fallback_name).strip()[:80] or fallback_name
  hex_value = str(color.get("hex") or fallback_hex).strip()
  return name, hex_value.upper() if _HEX_PATTERN.fullmatch(hex_value) else fallback_hex


def _color(role: str, name: str, hex_value: str) -> dict[str, str]:
  return {"role": role, "name": name[:80], "hex": hex_value}


def _step(
  *,
  title: str,
  product_type: str,
  tool: str,
  colors: list[dict[str, str]],
  amount: str,
  placement: str,
  technique: str,
  blending: str,
  finish_check: str,
) -> dict[str, Any]:
  return {
    "title": title,
    "productType": product_type,
    "tool": tool,
    "colors": colors,
    "amount": amount,
    "placement": placement,
    "technique": technique,
    "blending": blending,
    "finishCheck": finish_check,
  }


def _base_plan(name: str, hex_value: str, texture: str) -> tuple[list[dict[str, Any]], list[str]]:
  light_hex = _mix_hex(hex_value, (255, 255, 255), 0.24)
  return (
    [
      _step(
        title="파운데이션을 얇게 펼치기",
        product_type="리퀴드 또는 쿠션 파운데이션",
        tool="납작 파운데이션 브러시 또는 물기를 꼭 짠 퍼프",
        colors=[_color("피부 바탕", name, hex_value)],
        amount="얼굴 전체 기준 반 펌프 또는 쿠션을 퍼프에 한 번 가볍게 묻힌 양",
        placement="양 볼·이마·코·턱의 얼굴 중심에 점처럼 나눠 놓고 헤어라인과 턱선 직전까지",
        technique="얼굴 중심에서 바깥쪽으로 얇게 밀고 코 옆과 입가만 퍼프로 두드려 밀착합니다.",
        blending="퍼프에 새 제품을 더하지 않고 헤어라인·귀 앞·턱선 경계를 10회 이상 가볍게 두드립니다.",
        finish_check=f"피부 결은 비치면서 붉은 기만 정돈되고 {texture} 질감이 균일하면 다음 단계로 갑니다.",
      ),
      _step(
        title="필요한 곳만 컨실러 보강",
        product_type="크림 또는 리퀴드 컨실러",
        tool="작은 플랫 브러시와 손가락 또는 미니 퍼프",
        colors=[_color("국소 보정", f"{name} 라이트", light_hex)],
        amount="눈 밑 한쪽당 쌀알 반 개, 콧방울과 잡티에는 점 하나씩",
        placement="눈 앞머리 아래·콧방울 옆·입가 또는 남아 있는 잡티에만 국소적으로",
        technique="보정할 지점 중앙은 건드리지 않고 가장자리부터 두드려 커버 경계를 지웁니다.",
        blending="파운데이션과 만나는 바깥 2~3mm만 작은 퍼프로 눌러 색 차이가 끊기지 않게 합니다.",
        finish_check="가까이서 봐도 컨실러 테두리는 없고 필요한 피부 결은 남아 있으면 완료입니다.",
      ),
      _step(
        title="매트가 필요한 구역만 파우더 고정",
        product_type="투명 루스 파우더",
        tool="작은 포인트 파우더 브러시와 깨끗한 큰 브러시",
        colors=[_color("고정", "투명 파우더", "#F2EFEA")],
        amount="브러시 끝에 한 번 묻힌 뒤 손등에서 두 번 털어낸 아주 소량",
        placement="눈 밑·콧방울·미간과 T존만; 광을 살릴 광대 윗면·볼 중앙·콧대에는 올리지 않습니다.",
        technique="유분이 올라오는 구역에 브러시를 눕혀 누르듯 고정하고 문지르지 않습니다.",
        blending="큰 브러시에 남은 양으로 파우더 구역의 가장자리만 한 번 쓸어 매트와 광의 경계를 풉니다.",
        finish_check="T존은 보송하지만 광대와 볼의 자연스러운 광은 사라지지 않았으면 완료입니다.",
      ),
      _step(
        title="베이스 밀착과 광 균형 마무리",
        product_type="수분 픽싱 미스트",
        tool="픽싱 미스트와 깨끗한 퍼프",
        colors=[_color("마무리", "투명 수분막", "#F6F2ED")],
        amount="얼굴에서 20cm 떨어져 두 번 분사한 양",
        placement="얼굴 전체에 안개처럼 분사하되 눈과 입은 감고, 광대 윗면은 퍼프 잔량으로만 누릅니다.",
        technique="미스트가 반쯤 마를 때 퍼프로 들뜬 곳만 한 번씩 눌러 층을 붙입니다.",
        blending="파우더가 뭉친 부위는 젖은 퍼프로 문지르지 말고 깨끗한 면으로 짧게 눌러 정리합니다.",
        finish_check="얼굴 중심과 턱선의 색 차이가 없고 매트 구역과 글로우 구역이 자연스럽게 이어지면 완료입니다.",
      ),
    ],
    [
      "파운데이션과 컨실러의 경계가 보이지 않고 피부 결이 남아 있어야 합니다.",
      "T존·눈 밑은 고정되어도 광대 윗면과 볼 중앙의 광은 유지되어야 합니다.",
    ],
  )


def _brow_plan(name: str, hex_value: str) -> tuple[list[dict[str, Any]], list[str]]:
  light_hex = _mix_hex(hex_value, (255, 255, 255), 0.28)
  deep_hex = _mix_hex(hex_value, (38, 28, 24), 0.28)
  return (
    [
      _step(
        title="눈썹 앞머리와 몸통에 옅은 바탕 넣기",
        product_type="브로우 파우더",
        tool="사선 브로우 브러시",
        colors=[_color("바탕", f"라이트 {name}", light_hex)],
        amount="브러시 한 면에 한 번 묻히고 손등에서 절반을 턴 양",
        placement="눈썹 앞머리 5mm는 비우고 눈썹 중간의 빈 곳부터 산 직전까지",
        technique="아래 라인을 먼저 짧게 잡고 털이 난 방향으로 2~3mm 선을 겹쳐 빈 곳만 채웁니다.",
        blending="남은 양으로 앞머리를 아래에서 위로 쓸어 시작점이 네모나지 않게 흐립니다.",
        finish_check="앞머리는 피부가 비칠 만큼 옅고 몸통의 빈 곳만 고르게 채워졌으면 완료입니다.",
      ),
      _step(
        title="산과 꼬리를 한 톤 깊게 연결",
        product_type="극세 브로우 펜슬",
        tool="1.5mm 안팎 브로우 펜슬",
        colors=[_color("꼬리 음영", f"딥 {name}", deep_hex)],
        amount="심을 2mm만 빼고 힘을 주지 않은 6~10개의 짧은 선",
        placement="눈썹 산부터 꼬리까지, 본래 털이 비는 부분 안쪽에만",
        technique="털 한 올 길이로 짧게 그으며 꼬리는 눈꼬리보다 과하게 아래로 내리지 않습니다.",
        blending="산에서 몸통 방향으로 스크루 브러시를 한 번 역방향으로 빗어 진한 경계만 풉니다.",
        finish_check="꼬리는 또렷하지만 앞머리보다 진하고 얇게 끝나 좌우 길이가 맞으면 완료입니다.",
      ),
      _step(
        title="결을 세워 색과 선을 통합",
        product_type="틴티드 또는 투명 브로우 마스카라",
        tool="액을 충분히 덜어낸 미니 스크루 브러시",
        colors=[_color("결 정돈", name, hex_value)],
        amount="용기 입구에서 솔의 네 면을 모두 덜어낸 잔량",
        placement="앞머리는 위쪽, 몸통은 사선 위, 꼬리는 털 방향을 따라",
        technique="피부에 닿지 않게 털만 들어 올리며 한 번 통과하고 같은 자리를 반복하지 않습니다.",
        blending="색이 뭉친 한 올은 제품 없는 스크루 브러시로 즉시 빗어 주변 털과 섞습니다.",
        finish_check="두 눈썹의 시작 농도와 산 높이가 비슷하고 털 결이 한 방향이면 완료입니다.",
      ),
    ],
    [
      "눈썹 앞머리에서 꼬리로 갈수록 자연스럽게 진해져야 합니다.",
      "좌우 산의 높이와 꼬리 길이는 맞되 본래 눈썹 결은 남아 있어야 합니다.",
    ],
  )


def _eye_plan(name: str, hex_value: str, texture: str) -> tuple[list[dict[str, Any]], list[str]]:
  light_hex = _mix_hex(hex_value, (255, 247, 240), 0.58)
  transition_hex = _mix_hex(hex_value, (224, 194, 172), 0.30)
  deep_hex = _mix_hex(hex_value, (44, 31, 29), 0.36)
  liner_hex = _mix_hex(hex_value, (24, 20, 19), 0.64)
  point_hex = _mix_hex(hex_value, (255, 244, 220), 0.72)
  return (
    [
      _step(
        title="밝은 베이스 섀도로 눈두덩 정돈",
        product_type="매트 베이스 아이섀도",
        tool="넓고 납작한 아이섀도 브러시",
        colors=[_color("베이스", f"라이트 {name}", light_hex)],
        amount="브러시 양면에 한 번씩 묻혀 손등에서 한 번 턴 양",
        placement="속눈썹 뿌리부터 눈을 떴을 때 보이는 눈두덩 경계 2~3mm 위까지",
        technique="눈 앞머리에서 꼬리까지 브러시를 눕혀 얇게 쓸고 눈썹뼈까지 올리지 않습니다.",
        blending="깨끗한 블렌딩 브러시로 윗경계만 좌우 5회 왕복해 피부색과 연결합니다.",
        finish_check="눈두덩의 유분과 색 얼룩은 정리되지만 베이스 색의 테두리는 보이지 않으면 완료입니다.",
      ),
      _step(
        title="전이 색으로 눈의 기본 범위 설계",
        product_type="매트 전이 아이섀도",
        tool="중간 크기 둥근 블렌딩 브러시",
        colors=[_color("전이", f"소프트 {name}", transition_hex)],
        amount="브러시 끝에 한 번 묻혀 손등에서 절반을 턴 양을 눈당 1회",
        placement="눈동자 위에서 눈꼬리까지 쌍꺼풀 선 또는 예상 선보다 2~3mm 넓은 범위",
        technique="눈을 뜬 상태에서 바깥쪽부터 작은 원을 그리며 안쪽으로 남은 양을 이동합니다.",
        blending="색의 위쪽 3mm만 깨끗한 브러시로 풀고 속눈썹 쪽 농도는 남깁니다.",
        finish_check="눈을 떴을 때 전이 색이 얇게 보이고 좌우 높이와 폭이 같으면 완료입니다.",
      ),
      _step(
        title="깊은 음영으로 바깥쪽 입체감 만들기",
        product_type="딥 매트 아이섀도",
        tool="작은 포인트 블렌딩 브러시",
        colors=[_color("깊이", f"딥 {name}", deep_hex)],
        amount="브러시 끝 3mm에 소량 묻힌 것을 눈당 두 번 이하로 나눈 양",
        placement="눈꼬리 바깥 V와 위 속눈썹 라인 바깥 1/3, 아래 눈꼬리 바깥 1/3",
        technique="바깥 V 안에서 짧게 찍은 뒤 전이 색 안쪽으로 5mm만 당겨 그라데이션합니다.",
        blending="전이 색 브러시의 잔량으로 깊은 음영의 위·안쪽 경계만 작은 원으로 연결합니다.",
        finish_check="눈을 감으면 세 색이 단계적으로 이어지고 뜨면 눈꼬리만 자연스럽게 깊어 보이면 완료입니다.",
      ),
      _step(
        title="속눈썹 사이를 채워 라인 정리",
        product_type="젤 펜슬 또는 리퀴드 아이라이너",
        tool="극세 아이라이너 또는 납작한 라이너 브러시",
        colors=[_color("라인", f"딥 {name} 라이너", liner_hex)],
        amount="속눈썹 사이를 채울 정도의 1mm 이하 짧은 선 8~12개",
        placement="위 속눈썹 사이와 눈꼬리 2~4mm; 앞머리와 아래 점막 전체는 비웁니다.",
        technique="한 번에 긴 선을 긋지 말고 속눈썹 사이를 점처럼 연결해 눈꼬리만 가늘게 뺍니다.",
        blending="라인이 강하면 딥 섀도 브러시 잔량으로 윗경계만 한 번 눌러 섀도와 붙입니다.",
        finish_check="정면에서 라인 두께보다 속눈썹 뿌리가 또렷해 보이고 좌우 꼬리 각도가 같으면 완료입니다.",
      ),
      _step(
        title="빛 포인트로 질감 마무리",
        product_type="새틴 또는 쉬머 포인트 아이섀도",
        tool="약지 손끝 또는 작은 플랫 브러시",
        colors=[_color("포인트", f"라이트 {name} 포인트", point_hex)],
        amount="손끝에 한 번 묻힌 뒤 손등에 찍고 남은 절반의 양",
        placement="눈동자 중앙 위 5~7mm와 눈 앞머리 2mm 이내",
        technique=f"문지르지 않고 한 번씩 눌러 {texture} 반사가 정면에서만 보이도록 올립니다.",
        blending="포인트 가장자리만 베이스 섀도 브러시로 가볍게 눌러 독립된 반짝이 점이 남지 않게 합니다.",
        finish_check="여러 각도에서 넓게 번쩍이지 않고 정면의 눈동자 위에만 빛이 모이면 완료입니다.",
      ),
    ],
    [
      "밝은 베이스→전이→깊은 음영의 세 색 경계가 끊기지 않아야 합니다.",
      "아이라인은 섀도 안에 연결되고 포인트 광은 눈동자 위와 앞머리 안에만 머물러야 합니다.",
    ],
  )


def _cheek_plan(name: str, hex_value: str, texture: str) -> tuple[list[dict[str, Any]], list[str]]:
  light_hex = _mix_hex(hex_value, (255, 245, 238), 0.38)
  deep_hex = _mix_hex(hex_value, (120, 62, 59), 0.18)
  highlight_hex = _mix_hex(hex_value, (255, 241, 222), 0.76)
  return (
    [
      _step(
        title="옅은 치크 바탕을 넓게 깔기",
        product_type="파우더 또는 크림 블러셔",
        tool="중간 크기 사선 블러시 브러시 또는 손가락",
        colors=[_color("바탕", f"라이트 {name}", light_hex)],
        amount="브러시에 한 번 묻힌 뒤 손등에서 두 번 턴 양을 볼 한쪽당 1회",
        placement="눈동자 바깥선 아래의 볼 중앙에서 관자놀이 직전까지 손가락 두 마디 폭",
        technique="볼 중앙에 먼저 눌러 색을 놓고 관자 방향으로 남은 양을 길게 연결합니다.",
        blending="파운데이션 브러시 잔량으로 치크의 아래·앞 경계를 한 번 눌러 피부와 붙입니다.",
        finish_check="정면에서 양쪽 색의 시작 높이와 넓이가 같고 경계선이 없으면 완료입니다.",
      ),
      _step(
        title="중심 색을 좁게 겹쳐 생기 조절",
        product_type="고발색 블러셔",
        tool="작은 둥근 블러시 브러시",
        colors=[_color("중심", name, deep_hex)],
        amount="브러시 끝에 아주 소량 묻혀 손등에 한 번 찍은 양",
        placement="첫 치크 범위 안쪽의 볼 중심 2~3cm 구역",
        technique="웃을 때 가장 올라오는 지점보다 살짝 바깥에 두 번 눌러 농도만 높입니다.",
        blending="옅은 바탕 브러시로 중심 둘레를 한 바퀴 쓸어 두 색을 연결합니다.",
        finish_check=f"중심은 생기가 있지만 {texture} 질감이 얼룩 없이 이어지면 완료입니다.",
      ),
      _step(
        title="광대 윗면에 제한적으로 빛 더하기",
        product_type="미세 펄 하이라이터",
        tool="작은 부채꼴 또는 포인트 브러시",
        colors=[_color("광 포인트", f"{name} 라이트", highlight_hex)],
        amount="브러시 끝에 한 번 묻혀 손등에서 거의 털어낸 잔량",
        placement="동공 바깥선부터 광대뼈 가장 높은 2~3cm 구간만",
        technique="길게 쓸지 말고 두세 번 눌러 정면보다 측면에서만 은은하게 반사되게 합니다.",
        blending="치크 브러시 잔량으로 하이라이터의 아래 경계를 한 번 쓸어 색과 광을 붙입니다.",
        finish_check="모공 위에 펄이 뭉치지 않고 고개를 돌릴 때만 광대 윗면이 반사되면 완료입니다.",
      ),
    ],
    [
      "치크는 볼 중앙에서 관자 방향으로 옅어지고 좌우 범위가 같아야 합니다.",
      "색과 하이라이터의 경계가 없고 펄이 모공이나 눈 밑까지 번지지 않아야 합니다.",
    ],
  )


def _lip_plan(name: str, hex_value: str, texture: str) -> tuple[list[dict[str, Any]], list[str]]:
  light_hex = _mix_hex(hex_value, (255, 238, 231), 0.40)
  deep_hex = _mix_hex(hex_value, (90, 29, 43), 0.30)
  glow_hex = _mix_hex(hex_value, (255, 248, 238), 0.74)
  return (
    [
      _step(
        title="밝은 바탕색으로 입술 톤 정리",
        product_type="립 베이스 또는 크리미 립 컬러",
        tool="납작한 립 브러시",
        colors=[_color("바탕", f"라이트 {name}", light_hex)],
        amount="립 브러시 양면에 얇게 묻힌 쌀알 한 개 정도의 양",
        placement="입술 전체에서 실제 입술선 안쪽 1mm까지",
        technique="입꼬리에서 중앙으로 얇게 펴고 티슈를 한 번 물어 표면의 유분만 걷어냅니다.",
        blending="깨끗한 브러시로 입술선과 피부가 만나는 경계만 짧게 쓸어 두꺼운 테두리를 없앱니다.",
        finish_check="본래 입술 톤은 균일해졌지만 세로 결이 막히지 않고 얇게 밀착되면 완료입니다.",
      ),
      _step(
        title="주 색상으로 기본 형태 만들기",
        product_type="틴트 또는 립스틱",
        tool="작은 라운드 립 브러시",
        colors=[_color("메인", name, hex_value)],
        amount="아랫입술 중앙에 콩알의 1/3, 윗입술에는 그 절반",
        placement="입술 안쪽 2/3 범위, 입꼬리와 외곽 2mm는 바탕색을 남김",
        technique="안쪽에서 바깥으로 짧게 쓸어 색을 펴고 입술을 비벼 섞지 않습니다.",
        blending="바탕색 브러시로 메인 색의 바깥 경계를 안쪽과 바깥쪽으로 번갈아 두드립니다.",
        finish_check="입술 중앙은 선명하고 외곽으로 갈수록 한 단계 옅어지면 완료입니다.",
      ),
      _step(
        title="안쪽 색을 겹쳐 그라데이션 깊이 만들기",
        product_type="고발색 틴트 또는 딥 립 컬러",
        tool="면봉 끝 또는 작은 포인트 립 브러시",
        colors=[_color("안쪽 포인트", f"딥 {name}", deep_hex)],
        amount="윗입술과 아랫입술 안쪽에 쌀알 반 개씩 나눌 양",
        placement="입술을 다물었을 때 맞닿는 안쪽 1/3과 아랫입술 중앙",
        technique="점 세 개로 나눠 찍고 입술 안쪽에서 중앙까지만 수직으로 두드립니다.",
        blending="메인 색 브러시의 잔량으로 딥 컬러 경계를 3~4회 눌러 두 색 사이 선을 없앱니다.",
        finish_check="두세 색이 띠처럼 나뉘지 않고 안쪽에서 바깥으로 자연스럽게 밝아지면 완료입니다.",
      ),
      _step(
        title="중앙 광으로 볼륨 마무리",
        product_type="투명 또는 컬러 립글로스",
        tool="깨끗한 립 브러시 또는 글로스 팁",
        colors=[_color("광택", f"{name} 글로우", glow_hex)],
        amount="아랫입술 중앙에 쌀알 반 개, 윗입술 산에는 그 절반",
        placement="아랫입술 중앙 1/3과 윗입술 산 바로 아래만; 입꼬리와 외곽은 비움",
        technique=f"문지르지 않고 점처럼 눌러 {texture} 광이 중앙에만 모이도록 합니다.",
        blending="글로스 경계는 제품 없는 브러시로 한 번만 눌러 색층을 들뜨지 않게 연결합니다.",
        finish_check="입꼬리는 번짐 없이 보송하고 정면의 입술 중앙에만 광이 모이면 완료입니다.",
      ),
    ],
    [
      "바탕·메인·안쪽 포인트의 2~3개 색이 선 없이 이어져야 합니다.",
      "글로스는 입술 중앙에만 있고 외곽선과 입꼬리는 번지지 않아야 합니다.",
    ],
  )


def _default_plan(area: str, guide: dict[str, Any], estimated_minutes: int) -> dict[str, Any]:
  name, hex_value = _guide_color(area, guide)
  texture = str(guide.get("texture") or "자연스러운").strip()[:100] or "자연스러운"
  if area == "base":
    steps, criteria = _base_plan(name, hex_value, texture)
  elif area == "brow":
    steps, criteria = _brow_plan(name, hex_value)
  elif area == "eye":
    steps, criteria = _eye_plan(name, hex_value, texture)
  elif area == "cheek":
    steps, criteria = _cheek_plan(name, hex_value, texture)
  else:
    steps, criteria = _lip_plan(name, hex_value, texture)
  return {
    "recipeVersion": APPLICATION_RECIPE_VERSION,
    "estimatedMinutes": estimated_minutes,
    "steps": [
      {"order": index, **step}
      for index, step in enumerate(steps, start=1)
    ],
    "completionCriteria": criteria,
  }


def _distinct_plan_colors(steps: list[dict[str, Any]]) -> set[tuple[str, str]]:
  return {
    (str(color.get("name") or "").strip().casefold(), str(color.get("hex") or "").upper())
    for step in steps
    for color in step.get("colors", [])
    if isinstance(step, dict) and isinstance(step.get("colors"), list) and isinstance(color, dict)
  }


def _plan_is_complete(area: str, value: object) -> bool:
  if not isinstance(value, dict):
    return False
  estimated_minutes = value.get("estimatedMinutes")
  criteria = value.get("completionCriteria")
  steps = value.get("steps")
  if (
    value.get("recipeVersion") != APPLICATION_RECIPE_VERSION
    or not isinstance(estimated_minutes, int)
    or isinstance(estimated_minutes, bool)
    or not 1 <= estimated_minutes <= 60
    or not isinstance(criteria, list)
    or not criteria
    or not all(isinstance(item, str) and 1 <= len(item.strip()) <= 260 for item in criteria)
    or len({item.strip().casefold() for item in criteria}) != len(criteria)
    or not isinstance(steps, list)
    or not AREA_MIN_STEPS[area] <= len(steps) <= 8
  ):
    return False
  orders = [step.get("order") for step in steps if isinstance(step, dict)]
  if (
    len(orders) != len(steps)
    or any(not isinstance(order, int) or isinstance(order, bool) for order in orders)
    or orders != list(range(1, len(steps) + 1))
  ):
    return False
  for step in steps:
    if not isinstance(step, dict):
      return False
    if any(not isinstance(step.get(field), str) or not str(step[field]).strip() for field in _STEP_TEXT_FIELDS):
      return False
    colors = step.get("colors")
    if not isinstance(colors, list) or not colors:
      return False
    if any(
      not isinstance(color, dict)
      or not str(color.get("role") or "").strip()
      or not str(color.get("name") or "").strip()
      or not _HEX_PATTERN.fullmatch(str(color.get("hex") or ""))
      for color in colors
    ):
      return False

  distinct_colors = _distinct_plan_colors(steps)
  distinct_color_names = {name for name, _hex_value in distinct_colors}
  distinct_color_hexes = {hex_value for _name, hex_value in distinct_colors}
  searchable = " ".join(
    str(step.get(field) or "")
    for step in steps
    if isinstance(step, dict)
    for field in (*_STEP_TEXT_FIELDS, "colors")
  )
  if area == "base" and not (
    "파우더" in searchable
    and ("광" in searchable or "글로우" in searchable)
    and ("올리지" in searchable or "비움" in searchable or "제외" in searchable)
  ):
    return False
  if area == "eye" and not (
    len(distinct_color_names) >= 3
    and len(distinct_color_hexes) >= 3
    and "섀도" in searchable
    and ("아이라이너" in searchable or "라이너" in searchable)
  ):
    return False
  if area == "lip" and not (
    len(distinct_color_names) >= 2
    and len(distinct_color_hexes) >= 2
    and ("안쪽" in searchable or "그라데이션" in searchable)
    and ("글로" in searchable or "광" in searchable)
  ):
    return False
  return True


def _normalize_complete_plan(plan: dict[str, Any]) -> dict[str, Any]:
  normalized = deepcopy(plan)
  steps = sorted(
    normalized["steps"],
    key=lambda step: step.get("order") if isinstance(step.get("order"), int) else 99,
  )
  normalized["steps"] = [
    {**step, "order": index}
    for index, step in enumerate(steps, start=1)
  ]
  normalized["recipeVersion"] = APPLICATION_RECIPE_VERSION
  return normalized


def enrich_makeup_application_plans(recommendation: dict[str, Any]) -> dict[str, Any]:
  """Return a non-mutating projection with complete, ordered plans for five required areas."""
  enriched = deepcopy(recommendation)
  looks = enriched.get("looks")
  if not isinstance(looks, list):
    return enriched

  for look in looks:
    if not isinstance(look, dict):
      continue
    guides = look.get("areaGuides")
    if not isinstance(guides, list):
      guides = look.get("area_guides")
    if not isinstance(guides, list):
      continue
    raw_duration = look.get("durationMinutes", look.get("duration_minutes"))
    duration = raw_duration if isinstance(raw_duration, int) and not isinstance(raw_duration, bool) else 25
    for guide in guides:
      if not isinstance(guide, dict):
        continue
      area = str(guide.get("area") or "")
      if area not in AREA_APPLICATION_ORDER:
        continue
      guide["applicationOrder"] = AREA_APPLICATION_ORDER[area]
      existing_plan = guide.get("applicationPlan", guide.get("application_plan"))
      guide.pop("application_plan", None)
      guide.pop("application_order", None)
      if _plan_is_complete(area, existing_plan):
        guide["applicationPlan"] = _normalize_complete_plan(existing_plan)
        continue
      estimated_minutes = max(2, min(60, round(duration * AREA_TIME_WEIGHTS[area])))
      guide["applicationPlan"] = _default_plan(area, guide, estimated_minutes)
    indexed_guides = list(enumerate(guides))
    indexed_guides.sort(
      key=lambda pair: (
        AREA_APPLICATION_ORDER.get(str(pair[1].get("area") or ""), 99)
        if isinstance(pair[1], dict)
        else 99,
        pair[0],
      ),
    )
    look["areaGuides"] = [guide for _, guide in indexed_guides]
    look.pop("area_guides", None)
  return enriched