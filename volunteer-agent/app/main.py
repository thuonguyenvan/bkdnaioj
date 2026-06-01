"""Entrypoint kept for backward compatibility. CLI is in cli.py."""
from .cli import app


def main() -> None:
    app()
