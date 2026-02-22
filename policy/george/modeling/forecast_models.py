"""Forecast model placeholders."""

from __future__ import annotations


class BaselineForecastModel:
    name = "baseline"

    def predict_next(self, values: list[float]) -> float:
        raise NotImplementedError("TODO: implement baseline forecasting strategy.")

