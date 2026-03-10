# syntax=docker/dockerfile:1.7

FROM python:3.12-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY apps/api/pyproject.toml ./apps/api/pyproject.toml
COPY apps/api/app ./apps/api/app
RUN mkdir -p ./blueprint/cbt/02_domain
COPY blueprint/cbt/02_domain/cbt_state_schema.json ./blueprint/cbt/02_domain/cbt_state_schema.json

RUN pip install --no-cache-dir -e "./apps/api[ml]"

WORKDIR /app/apps/api
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
