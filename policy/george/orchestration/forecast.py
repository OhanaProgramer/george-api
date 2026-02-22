"""Forecast orchestration entry points."""

from __future__ import annotations


def run_forecast(model_name: str = "baseline") -> int:
    """Run forecasting against prepared feature sets."""
    raise NotImplementedError(f"TODO: implement forecast workflow for model '{model_name}'.")

