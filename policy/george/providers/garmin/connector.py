"""Garmin fetch connector."""

from __future__ import annotations

from ..base import RawRecord


class GarminConnector:
    name = "garmin"

    def fetch(self) -> list[RawRecord]:
        raise NotImplementedError("TODO: implement Garmin API/scraper fetch.")

