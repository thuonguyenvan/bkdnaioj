from __future__ import annotations

import os
from urllib.parse import urlparse

from minio import Minio


def _endpoint_host(endpoint: str) -> str:
    if endpoint.startswith("http://") or endpoint.startswith("https://"):
        parsed = urlparse(endpoint)
        return parsed.netloc
    return endpoint


class ObjectStore:
    def __init__(self, *, endpoint: str, bucket: str, access_key: str, secret_key: str, secure: bool) -> None:
        self._bucket = bucket
        self._client = Minio(
            _endpoint_host(endpoint),
            access_key=access_key,
            secret_key=secret_key,
            secure=secure,
        )

    def download(self, object_key: str, dest_path: str) -> str:
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        self._client.fget_object(self._bucket, object_key, dest_path)
        return dest_path
