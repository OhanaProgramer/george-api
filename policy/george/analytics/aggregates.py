"""Aggregate metrics utilities."""

from __future__ import annotations


def average(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / float(len(values))

