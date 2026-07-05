# Auradin MVP Agent Eval (20260703)

## Summary

| # | Prompt | Final phase | Questions | Asked attributes | Products | Cards purchasable | Error |
|---:|---|---|---:|---|---:|---|---|
| 1 | 쿨톤인데 너무 진하지 않은 글로시 핑크 립 2만원 이하 | results | 3 | finish, channel, colorFamily | 6 | yes |  |
| 2 | 데일리로 쓸 만한 제품 추천해줘 | results | 3 | category, priceTier, finish | 6 | yes |  |
| 3 | 올리브영에서 살 수 있는 데일리 립 | results | 3 | priceTier, finish, texture | 6 | yes |  |
| 4 | 면접용 자연스러운 블러셔, 너무 붉지 않게 | results | 3 | texture, priceTier, channel | 6 | yes |  |
| 5 | 글리터 강한 아이섀도우 말고 은은한 쉬머 | results | 3 | priceTier, texture, channel | 6 | yes |  |
| 6 | 브로우 추천해줘 | failed | 0 |  | 0 | yes | unsupported_category |

## Per Prompt Details

### 1. 쿨톤인데 너무 진하지 않은 글로시 핑크 립 2만원 이하

- Final phase: `results`
- Question count: 3
- Asked attributes: finish, channel, colorFamily
- Product cards: 6
- All cards have price/image/purchase URL: True
- Question `finish` (hard): before 86, after 26, top scores [0.489839, 0.489839, 0.489839]
- Question `channel` (hard): before 26, after 14, top scores [0.548172, 0.548172, 0.548172]
- Question `colorFamily` (soft): before 14, after 14, top scores [0.569435, 0.559274, 0.55715]
- Top card: 에스쁘아 / [에스쁘아] NEW 꾸뛰르 립틴트 글레이즈 / 18700원

### 2. 데일리로 쓸 만한 제품 추천해줘

- Final phase: `results`
- Question count: 3
- Asked attributes: category, priceTier, finish
- Product cards: 6
- All cards have price/image/purchase URL: True
- Question `category` (hard): before 337, after 119, top scores [0.5525, 0.5525, 0.491204]
- Question `priceTier` (hard): before 119, after 58, top scores [0.36, 0.297037, 0.291481]
- Question `finish` (hard): before 58, after 26, top scores [0.448897, 0.438704, 0.438704]
- Top card: 3CE / 3CE 블러 워터 틴트+미니아이스위치(랜덤) / 14340원

### 3. 올리브영에서 살 수 있는 데일리 립

- Final phase: `results`
- Question count: 3
- Asked attributes: priceTier, finish, texture
- Product cards: 6
- All cards have price/image/purchase URL: True
- Question `priceTier` (hard): before 46, after 26, top scores [0.479515, 0.463704, 0.463704]
- Question `finish` (hard): before 26, after 11, top scores [0.501086, 0.487037, 0.442729]
- Question `texture` (hard): before 11, after 9, top scores [0.471335, 0.465242, 0.4625]
- Top card: 투쿨포스쿨 / 투쿨포스쿨 스웨이 립 벨벳 기획/단품 / 13770원

### 4. 면접용 자연스러운 블러셔, 너무 붉지 않게

- Final phase: `results`
- Question count: 3
- Asked attributes: texture, priceTier, channel
- Product cards: 6
- All cards have price/image/purchase URL: True
- Question `texture` (hard): before 114, after 78, top scores [0.287563, 0.275, 0.275]
- Question `priceTier` (hard): before 78, after 38, top scores [0.462228, 0.45, 0.442222]
- Question `channel` (hard): before 38, after 14, top scores [0.520252, 0.508333, 0.500556]
- Top card: 페리페라 / 페리페라 시럽피 톡 치크 13 Colors | 올리브영 / 11200원

### 5. 글리터 강한 아이섀도우 말고 은은한 쉬머

- Final phase: `results`
- Question count: 3
- Asked attributes: priceTier, texture, channel
- Product cards: 6
- All cards have price/image/purchase URL: True
- Question `priceTier` (hard): before 104, after 37, top scores [0.385, 0.36, 0.36]
- Question `texture` (hard): before 37, after 25, top scores [0.56, 0.535, 0.535]
- Question `channel` (hard): before 25, after 7, top scores [0.618333, 0.433333, 0.429878]
- Top card: 롬앤 / 베러 댄 팔레트 / 22800원

### 6. 브로우 추천해줘

- Final phase: `failed`
- Question count: 0
- Asked attributes: -
- Product cards: 0
- All cards have price/image/purchase URL: True
- Error: `unsupported_category` / 지금 MVP seed는 립·치크·아이섀도우 중심이라 브로우 제품은 아직 충분하지 않아요.

## Notes

- Price and channel filters are not silently relaxed.
- Brow/base/liner shortage is reported as recoverable unsupported/seed-limited state.
- Low-confidence title residual values remain soft evidence and are not described as official or exact shades.
