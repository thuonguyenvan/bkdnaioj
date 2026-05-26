FROM python:3.11-slim

WORKDIR /app

# Minimal system deps
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml /app/pyproject.toml
RUN pip install --no-cache-dir "redis>=5.0,<6" "psycopg[binary]>=3.1,<4" "structlog>=24.0,<26" "minio>=7.2,<8" "docker>=7.0.0"

COPY app /app/app

ENV PYTHONUNBUFFERED=1
CMD ["python","-m","app.main"]
