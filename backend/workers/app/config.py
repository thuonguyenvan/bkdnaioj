import os


def _req(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise RuntimeError(f"missing env var: {name}")
    return v


class Settings:
    redis_url: str
    database_url: str

    worker_group: str
    worker_consumer: str

    stream_judge: str
    stream_results: str

    sandbox_timeout_s: int

    s3_endpoint: str
    s3_bucket: str
    s3_access_key: str
    s3_secret_key: str
    s3_secure: bool

    def __init__(self) -> None:
        self.redis_url = _req("REDIS_URL")
        self.database_url = _req("DATABASE_URL")

        self.worker_group = os.getenv("WORKER_GROUP", "cg:judge-worker")
        self.worker_consumer = os.getenv("WORKER_CONSUMER", os.getenv("HOSTNAME", "worker"))

        self.stream_judge = os.getenv("STREAM_JUDGE", "jobs:judge")
        self.stream_results = os.getenv("STREAM_RESULTS", "jobs:results")

        self.sandbox_timeout_s = int(os.getenv("SANDBOX_TIMEOUT_S", "300"))

        self.s3_endpoint = _req("S3_ENDPOINT")
        self.s3_bucket = _req("S3_BUCKET")
        self.s3_access_key = _req("S3_ACCESS_KEY")
        self.s3_secret_key = _req("S3_SECRET_KEY")
        self.s3_secure = os.getenv("S3_SECURE", "false").lower() == "true"
