# apps/api

Python API scaffold for MindSight.

## Local Run

1. `python3 -m venv .venv`
2. `source .venv/bin/activate`
3. `pip install -U pip`
4. `pip install -e .[dev]`
5. `uvicorn app.main:app --reload --port 8000`

모델 서빙까지 로컬에서 검증하려면:
- `pip install -e .[dev,ml]`

## Auth/Onboarding Endpoints

- `POST /v1/auth/signup`
- `POST /v1/auth/session/bootstrap`
- `POST /v1/onboarding/profile`
- `POST /v1/onboarding/baseline-assessment/complete`

`/v1/onboarding/baseline-assessment/complete`는 수동 점수를 받지 않고,
완료된 온보딩 설문의 `assessment_id`를 받아 baseline을 확정한다.

## Modeling Endpoints

- `GET /v1/modeling/runtime`
- `POST /v1/modeling/nowcast/predict`
- `GET /v1/modeling/nowcast/history`

모델 아티팩트 경로는 `MODEL_BUNDLE_DIR` 환경변수로 지정할 수 있다.
지정하지 않으면 루트 `model/` 폴더를 기본값으로 사용한다.

## Firebase Emulator Support

- `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` 를 설정하면 로컬 Auth Emulator 토큰 검증 흐름을 사용한다.
- 로컬 테스트 편의를 위해 `AUTH_ALLOW_EMULATOR_UID_FALLBACK=true` 일 때 `X-Firebase-Uid` 헤더 기반 fallback 인증을 허용한다.
