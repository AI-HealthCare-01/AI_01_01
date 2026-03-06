.PHONY: bootstrap web-install api-install web-dev web-dev-real web-dev-emulator api-dev api-dev-real api-dev-emulator auth-emulator auth-e2e db-up db-down docker-up docker-up-real docker-up-emulator docker-down lint test smoke build typecheck ignored-baseline ignored-diff

bootstrap: web-install api-install

web-install:
	npm install

api-install:
	python3 -m venv apps/api/.venv
	apps/api/.venv/bin/pip install --upgrade pip
	apps/api/.venv/bin/pip install -e "apps/api[dev,ml]"

web-dev:
	./scripts/dev-web.sh

web-dev-real:
	USE_FIREBASE_AUTH_EMULATOR=false ./scripts/dev-web.sh

web-dev-emulator:
	USE_FIREBASE_AUTH_EMULATOR=true ./scripts/dev-web.sh

api-dev:
	./scripts/dev-api.sh

api-dev-real:
	USE_FIREBASE_AUTH_EMULATOR=false ./scripts/dev-api.sh

api-dev-emulator:
	USE_FIREBASE_AUTH_EMULATOR=true ./scripts/dev-api.sh

auth-emulator:
	./scripts/dev-auth-emulator.sh

auth-e2e:
	node ./scripts/auth-emulator-e2e.mjs

db-up:
	./scripts/db-up.sh

db-down:
	./scripts/db-down.sh

docker-up:
	./scripts/docker-up.sh

docker-up-real:
	USE_FIREBASE_AUTH_EMULATOR=false ./scripts/docker-up.sh

docker-up-emulator:
	USE_FIREBASE_AUTH_EMULATOR=true ./scripts/docker-up.sh

docker-down:
	./scripts/docker-down.sh

lint:
	./scripts/lint.sh

test:
	./scripts/test.sh

smoke:
	./scripts/smoke.sh

build:
	npm run build

typecheck:
	npm run typecheck

ignored-baseline:
	./scripts/ignored-diff.sh baseline

ignored-diff:
	./scripts/ignored-diff.sh diff
