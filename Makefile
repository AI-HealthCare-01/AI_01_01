PYTHON ?= python3
PIP ?= pip3

.PHONY: test test-backend test-frontend test-docker

test: test-backend test-frontend

test-backend:
	cd backend && $(PIP) install -r requirements.txt && pytest -q

test-frontend:
	cd frontend && npm run build

test-docker:
	docker compose run --rm api pytest -q
