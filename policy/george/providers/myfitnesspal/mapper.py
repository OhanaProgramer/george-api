"""MyFitnessPal canonical mapping."""

from __future__ import annotations

from collections.abc import Sequence

from ..base import CanonicalRecord, RawRecord


class MyFitnessPalMapper:
    name = "myfitnesspal"

    def map(self, raw_records: Sequence[RawRecord]) -> list[CanonicalRecord]:
        raise NotImplementedError("TODO: map MyFitnessPal records to canonical schema.")

