# 2차 반대 검증

사진을 다시 독립적으로 확인한 후 1차 관찰을 항목별로 confirmed, partially_confirmed, rejected, not_assessable 중 하나로 판정하세요.

반드시 다음 모순을 검사하세요.

- 블러셔가 얼굴의 시각적 무게를 지배한다고 관찰하고도 전체 균형을 근거 없이 우수하다고 보는가.
- 눈썹 높이·두께·경계 또는 아이라인 꼬리 차이를 확인하고도 정교함과 지각 균형을 최고 수준이라고 보는가.
- 섀도 범위가 좌우 중구난방하거나 경계가 남는데 블렌딩이 깔끔하다고 보는가.
- 립 경계·채움·질감 문제가 있는데 립 완성도를 만점으로 볼 근거를 만드는가.
- 베이스 적용이 식별되지 않는데 타고난 피부 표현을 메이크업 장점으로 바꾸는가.
- 색 신뢰도가 낮은데 색 조화에 강한 확정 판단을 하는가.
- 무쌍·속쌍 등 눈꺼풀 구조에 비해 라인이 너무 두껍거나 꼬리 방향이 분리되는데 단순히 선명하다는 이유로 칭찬하는가.
- 긴 중안부에서 낮은 블러셔와 긴 코 세로선이 길이감을 더하는데 넓게 발랐다는 사실만으로 보완 성공이라고 보는가.
- 얼굴 구조를 보완한 차등 적용을 기계적 비대칭으로 잘못 감점하는가.
- 사용자 상황명만으로 연함·호감·글로우 같은 취향을 만들어내는가.

결함 분류는 execution_defect, feature_mismatch, proportion_mismatch, color_or_texture_mismatch, goal_mismatch, photo_uncertainty 중 하나 이상을 사용하세요.

다음 JSON만 반환하세요.

{
  "auditSummary": {
    "scoreable": true,
    "keyRisks": ["점수 과대평가를 막기 위해 반드시 반영할 내용"]
  },
  "verifiedObservations": [
    {
      "id": "AUD-001",
      "sourceObservationIds": ["OBS-001"],
      "topicId": "brow",
      "verdict": "confirmed | partially_confirmed | newly_found",
      "polarity": "positive | negative | neutral | not_assessable",
      "claim": "검증 후 남긴 원자적 관찰",
      "evidenceLocation": "정확한 위치",
      "visualEffect": "전체 얼굴과 얼굴 구조에서 만드는 효과",
      "severity": "none | minor | moderate | major | critical",
      "confidence": "high | medium | low",
      "defectTypes": ["execution_defect"],
      "faceStructureRelation": "구조 보완·강조·무효·역효과 또는 관련 없음",
      "regionIds": ["full"]
    }
  ],
  "rejectedObservations": [
    {
      "sourceObservationId": "OBS-002",
      "reason": "사진 근거로 기각한 이유"
    }
  ],
  "contradictions": ["최종 채점에서 동시에 주장하면 안 되는 내용"],
  "missingChecks": ["1차에서 빠져 새로 검사한 내용"]
}

검증된 관찰은 최대 40개입니다. 사진에서 확인되는 medium·major·critical 결함은 반드시 verifiedObservations에 남기고, 긍정 관찰은 반증 검사를 통과한 경우에만 남기세요.
