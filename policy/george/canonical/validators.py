"""Validation helpers for canonical models."""

from __future__ import annotations

from .schemas import ActivityEvent


def validate_event(event: ActivityEvent) -> None:
    if not event.provider:
        raise ValueError("provider is required")
    if not event.metric:
        raise ValueError("metric is required")
    if event.unit == "":
        raise ValueError("unit is required")

