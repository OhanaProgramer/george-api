"""Garmin canonical mapping."""

from __future__ import annotations

from collections.abc import Sequence

from ..base import CanonicalRecord, RawRecord


class GarminMapper:
    name = "garmin"

    def map(self, raw_records: Sequence[RawRecord]) -> list[CanonicalRecord]:
        raise NotImplementedError("TODO: map Garmin records to canonical schema.")

