from __future__ import annotations

import json
import time

import redis
import structlog


log = structlog.get_logger()


class Streams:
    def __init__(self, redis_url: str) -> None:
        self.rdb = redis.Redis.from_url(redis_url, decode_responses=True)

    def ensure_group(self, stream: str, group: str) -> None:
        try:
            self.rdb.xgroup_create(stream, group, id="$", mkstream=True)
        except redis.exceptions.ResponseError as e:
            # BUSYGROUP means it already exists.
            if "BUSYGROUP" not in str(e):
                raise

    def consume_forever(self, *, stream: str, group: str, consumer: str, handler) -> None:
        self.ensure_group(stream, group)
        while True:
            resp = self.rdb.xreadgroup(group, consumer, {stream: ">"}, count=10, block=5000)
            if not resp:
                continue
            for _stream, msgs in resp:
                for msg_id, fields in msgs:
                    payload = fields.get("payload")
                    try:
                        env = json.loads(payload) if payload else {}
                        handler(env)
                    except Exception as e:
                        log.exception("handler crashed", error=str(e), submission_id=(env or {}).get("submission_id"))
                        try:
                            handler.mark_failed(env, str(e))
                        except Exception as e2:
                            log.exception("mark_failed crashed", error=str(e2), submission_id=(env or {}).get("submission_id"))
                    finally:
                        self.rdb.xack(stream, group, msg_id)

    def emit_result(self, stream: str, submission_id: str, typ: str) -> None:
        payload = json.dumps({"submission_id": submission_id, "type": typ})
        self.rdb.xadd(stream, {"payload": payload}, maxlen=100_000, approximate=True)

    def ping_loop(self) -> None:
        while True:
            try:
                self.rdb.ping()
            except Exception:
                log.exception("redis ping failed")
            time.sleep(10)
