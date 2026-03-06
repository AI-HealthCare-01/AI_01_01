# 유해언어 탐지 모델 통합 가이드 (Codex용)

목표:
- 커뮤니티 위반 언어(욕설/혐오/위협/성희롱/개인정보노출/도배)를 탐지해 관리자 큐로 보낸다.
- 사용자의 '힘들다/불안하다/무기력하다' 같은 감정 표현은 위반으로 처리하지 않는다.
- 자해/자살/타해 관련 표현은 일반 혐오 탐지와 분리해 별도 안전 큐로 보낸다.

## 권장 아키텍처 (MVP)
### 1단계: 규칙 기반 프리필터
- 금칙어/위협 패턴/연락처·개인정보 정규식
- obvious spam 패턴
- high-confidence면 moderation queue에 바로 적재

### 2단계: 모델 기반 분류
옵션 A. OpenAI Moderation API
- 장점: 빠른 통합, 공식 문서 존재
- 사용: 서버에서 post/comment 본문을 moderation endpoint로 전송
- 결과 카테고리를 내부 taxonomy(abuse/hate/threat 등)로 매핑

옵션 B. Hugging Face 한국어 모델
- 예시: jinkyeongk/kcELECTRA-toxic-detector
- 장점: 한국어 특화 가능, 자체 호스팅 가능
- 사용:
  1) `pip install transformers torch`
  2) `from transformers import AutoTokenizer, AutoModelForSequenceClassification, pipeline`
  3) 모델 로드 후 text-classification pipeline 생성
  4) 결과 score 기준으로 큐 적재

## 권장 운영
- MVP는 '규칙 기반 + 모델 큐 적재'까지만
- 자동 숨김은 아래 조건에서만:
  - 명백한 위협/폭력 문구
  - 고신뢰도 혐오/욕설
  - 동일 작성자의 반복 위반
- 그 외는 관리자 검토 우선

## 구현 예시(의사코드)
```python
def moderate_text(text: str) -> dict:
    rule_hits = run_rule_filter(text)
    safety_hits = run_self_harm_safety_filter(text)
    model_pred = run_toxic_model(text)
    return {
        "rule_hits": rule_hits,
        "safety_hits": safety_hits,
        "model_pred": model_pred,
        "queue_target": choose_queue(rule_hits, safety_hits, model_pred),
        "auto_hide": should_auto_hide(rule_hits, model_pred),
    }
```

## 큐 분리
- moderation_queue: 욕설/혐오/위협/성희롱/스팸/개인정보
- safety_queue: 자해/자살/타해 우려

## 주의
- '감정적으로 힘들다'는 이유만으로 moderation_queue에 넣지 않는다.
- 안전 큐와 커뮤니티 위반 큐를 혼동하지 않는다.
