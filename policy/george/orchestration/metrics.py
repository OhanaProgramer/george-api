"""Metrics orchestration entry points."""

from __future__ import annotations


def run_metrics(window_days: tuple[int, ...] = (7, 30)) -> int:
    """Build rolling and aggregate metrics in the derived layer."""
    raise NotImplementedError(f"TODO: implement metrics workflow for windows={window_days}.")
