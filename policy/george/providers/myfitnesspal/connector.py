"""MyFitnessPal fetch connector."""

from __future__ import annotations

from ..base import RawRecord


class MyFitnessPalConnector:
    name = "myfitnesspal"

    def fetch(self) -> list[RawRecord]:
        raise NotImplementedError("TODO: implement MyFitnessPal API/scraper fetch.")

