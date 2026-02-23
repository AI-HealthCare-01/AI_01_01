# AI

멘탈헬스 프로젝트용 AI 실험 자산을 보관합니다.

## 구조

- `data/healthcheck_check_synth.csv`: check(설문) 가라 데이터
- `data/healthcheck_monitor_synth.csv`: monitor(추세) 가라 데이터
- `models/rule_model_v1.json`: 룰 기반 모델 임계값 설정
- `models/rule_model.py`: 룰 기반 추론 함수
- `scripts/generate_synthetic_data.py`: 가라 데이터 생성 스크립트

## 생성/재생성

```bash
cd /Users/admin/Desktop/Bootcamp/mental_project
python3 AI/scripts/generate_synthetic_data.py --users 250 --seed 42
```

기본 출력:

- `AI/data/healthcheck_check_synth.csv`
- `AI/data/healthcheck_monitor_synth.csv`

## Baseline 학습

```bash
cd /Users/admin/Desktop/Bootcamp/mental_project
python3 AI/scripts/train_baseline_models.py --seed 42
```

출력:

- `AI/models/baseline_check_overall_level.joblib`
- `AI/models/baseline_monitor_trend_label.joblib`
- `AI/reports/baseline_metrics.json`
- `AI/reports/baseline_metrics_summary.txt`
