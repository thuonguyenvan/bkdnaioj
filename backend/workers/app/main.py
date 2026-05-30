from __future__ import annotations

import os

import structlog

from .config import Settings
from .db import DB
from .logging import configure_logging
from .queue import Streams
from .storage import ObjectStore
from .worker_judge import JudgeWorker


def main() -> None:
    configure_logging()
    log = structlog.get_logger()

    s = Settings()

    role = os.getenv("WORKER_ROLE", "judge")
    if role != "judge":
        raise RuntimeError("Lean V1 supports only WORKER_ROLE=judge")

    streams = Streams(s.redis_url)
    store = ObjectStore(
        endpoint=s.s3_endpoint,
        bucket=s.s3_bucket,
        access_key=s.s3_access_key,
        secret_key=s.s3_secret_key,
        secure=s.s3_secure,
    )
    worker = JudgeWorker(db=DB(s.database_url), streams=streams, stream_results=s.stream_results, store=store)

    log.info(
        "worker_start",
        role=role,
        stream=s.stream_judge,
        group=s.worker_group,
        consumer=s.worker_consumer,
    )
    streams.consume_forever(
        stream=s.stream_judge,
        group=s.worker_group,
        consumer=s.worker_consumer,
        handler=worker,
    )


if __name__ == "__main__":
    main()
