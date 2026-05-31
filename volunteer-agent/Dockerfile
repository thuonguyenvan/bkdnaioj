FROM python:3.11-slim
WORKDIR /agent
COPY pyproject.toml .
RUN pip install --no-cache-dir -e ".[docker]"
COPY app/ ./app/
CMD ["olpai-volunteer"]
