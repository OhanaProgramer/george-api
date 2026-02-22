"""Ingestion checkpoint placeholders."""

from __future__ import annotations

from pathlib import Path


def checkpoint_path(provider: str) -> Path:
    return Path(__file__).resolve().parent.parent.parent / "data" / "ingest" / f"{provider}.checkpoint"
