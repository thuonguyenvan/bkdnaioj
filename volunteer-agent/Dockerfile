FROM python:3.11-slim
WORKDIR /agent
COPY pyproject.toml .
COPY app/ ./app/
RUN pip install --no-cache-dir -e .
CMD ["olpai-volunteer"]
