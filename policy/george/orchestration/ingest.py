"""Ingest orchestration entry points."""

from __future__ import annotations


def run_ingest(provider: str) -> int:
    """Run provider ingestion into ingest/canonical layers."""
    raise NotImplementedError(f"TODO: implement ingest workflow for provider '{provider}'.")
