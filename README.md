# Mental Health Check API + Frontend (MVP)

FastAPI(백엔드) + React(Vite, 프론트) 기반 멘탈헬스 MVP입니다.

주의: 이 프로젝트의 결과는 **참고용**이며, **의료적 진단이 아닙니다**.

## Added in This Update
- `model/`의 nowcast 모델(`dep/anx/ins .joblib`)을 백엔드에 연결
- 주간 대시보드 API 추가 (`week_delta`, `severity`, `composite`, `alert`)
- `OPENAI_API_KEY` 기반 CBT 채팅 API 추가
- CBT 대화에서 인지왜곡/정서 지표 추출 및 DB 저장
- 프론트에 CBT 채팅 + nowcast 대시보드 탭 추가

## Tech Stack
- Backend: Python 3.11, FastAPI, SQLAlchemy 2.0 (async), asyncpg
- Auth: bcrypt, PyJWT
- AI/Model: scikit-learn, pandas, joblib, OpenAI API
- DB: PostgreSQL 16
- Frontend: React + Vite + TypeScript
- Infra: Docker / Docker Compose

## Project Structure
```text
.
├── backend
├── frontend
├── model
├── AI
├── worker
└── docker-compose.yml
```

## Environment Variables
루트 `.env` + `backend/.env`를 함께 사용합니다.

```env
APP_NAME=Mental Health Check API
API_V1_PREFIX=
SECRET_KEY=change-this-to-a-long-random-secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/mental_health

ADMIN_EMAILS=mongle@gmail.com

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini

# 실사용 모델/데이터 경로 (model 폴더 기준)
CHECK_MODEL_PATH=/model/models/dep_nowcast_rf.joblib
MONITOR_MODEL_PATH=/model/models/anx_nowcast_rf.joblib
NOWCAST_MODEL_DIR=/model/models
NOWCAST_DATA_PATH=/model/data/derived/train_user_day_nowcast.csv
NOWCAST_CBT_RAW_PATH=/model/data/raw/cbt_session.csv
NOWCAST_WEEKLY_OUTPUT_PATH=/model/outputs/nowcast_user_week_dashboard.csv

POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=mental_health
API_PORT=8001

```

## Run with Docker
```bash
cp .env.example .env
cp backend/.env.example backend/.env
docker compose up -d --build
```

- API: `http://localhost:8001`
- Swagger: `http://localhost:8001/docs`
- Frontend: `http://localhost:5173`

## Main API Endpoints
- `POST /auth/signup`
- `POST /auth/login`
- `GET /auth/me`
- `POST /assessments/phq9`
- `GET /assessments/phq9`
- `POST /chat/cbt` (JWT 필요)
- `POST /ai/check/predict`
- `POST /ai/monitor/predict`
- `POST /ai/nowcast/predict`
- `GET /ai/nowcast/dashboard/{user_id}`

## Notes
- `POST /chat/cbt`는 답변 + 지표 추출(`distortion` 포함) 결과를 저장합니다.
- `GET /ai/nowcast/dashboard/{user_id}`는 현재 synthetic user 기준(`U000001` 등)입니다.
- nowcast 모델은 `model/models/*.joblib`를 그대로 로드합니다.

## Disclaimer
본 서비스는 자기 점검을 위한 참고 도구입니다. 의료 진단/치료 판단에 사용하지 마세요.
