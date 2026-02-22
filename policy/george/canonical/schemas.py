"""Canonical data models shared by all providers."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class ActivityEvent:
    """Normalized event shape for downstream analytics/modeling."""

    provider: str
    metric: str
    value: float
    unit: str
    occurred_at: datetime

