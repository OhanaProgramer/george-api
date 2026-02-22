"""Rolling window metrics."""

from __future__ import annotations


def rolling_average(values: list[float], window_size: int) -> float | None:
    if window_size <= 0:
        raise ValueError("window_size must be positive")
    if len(values) < window_size:
        return None
    window = values[-window_size:]
    return sum(window) / float(window_size)

