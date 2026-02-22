"""Data lake path and persistence helpers."""

from __future__ import annotations

from pathlib import Path


def project_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent


def data_layer_path(layer: str) -> Path:
    if layer not in {"ingest", "canonical", "derived", "publish"}:
        raise ValueError("layer must be one of: ingest, canonical, derived, publish")
    return project_root() / "data" / layer
