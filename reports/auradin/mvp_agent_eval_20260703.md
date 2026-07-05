# Auradin MVP Agent Golden Eval (20260703)

## Summary

| Prompt | Status | First phase | First question | Final phase | Questions | Products/Error |
|---|---|---|---|---|---:|---|
| 쿨톤인데 너무 진하지 않은 글로시 핑크 립 2만원 이하 | PASS | question | channel | results | 3 | 6 products |
| 데일리로 쓸 만한 제품 추천해줘 | PASS | question | category | results | 3 | 6 products |
| 올리브영에서 살 수 있는 데일리 립 | PASS | question | finish | results | 2 | 6 products |
| 면접용 자연스러운 블러셔, 너무 붉지 않게 | PASS | question | priceTier | results | 1 | 6 products |
| 글리터 강한 아이섀도우 말고 은은한 쉬머 | PASS | question | priceTier | results | 3 | 5 products |
| 브로우 추천해줘 | PASS | failed | None | failed | 0 | error=unsupported_category, recoverable=True |

## Candidate Count Logs

### 쿨톤인데 너무 진하지 않은 글로시 핑크 립 2만원 이하
- step=1 before=125 after=28 attribute=channel type=hard
- step=2 before=28 after=10 attribute=finish type=hard
- step=3 before=10 after=10 attribute=colorFamily type=soft
- step=4 before=10 after=None attribute=None type=None

### 데일리로 쓸 만한 제품 추천해줘
- step=1 before=501 after=167 attribute=category type=hard
- step=2 before=167 after=83 attribute=priceTier type=hard
- step=3 before=83 after=27 attribute=finish type=hard
- step=4 before=27 after=None attribute=None type=None

### 올리브영에서 살 수 있는 데일리 립
- step=1 before=29 after=10 attribute=finish type=hard
- step=2 before=10 after=7 attribute=priceTier type=hard
- step=3 before=7 after=None attribute=None type=None

### 면접용 자연스러운 블러셔, 너무 붉지 않게
- step=1 before=167 after=78 attribute=priceTier type=hard
- step=2 before=78 after=None attribute=None type=None

### 글리터 강한 아이섀도우 말고 은은한 쉬머
- step=1 before=167 after=51 attribute=priceTier type=hard
- step=2 before=51 after=34 attribute=texture type=hard
- step=3 before=34 after=5 attribute=channel type=hard
- step=4 before=5 after=None attribute=None type=None

### 브로우 추천해줘
