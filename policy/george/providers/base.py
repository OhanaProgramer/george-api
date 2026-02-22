"""Shared contracts for all data providers."""

from __future__ import annotations

from typing import Any, Protocol, Sequence


RawRecord = dict[str, Any]
CanonicalRecord = dict[str, Any]


class ProviderConnector(Protocol):
    """Fetches source-native records from one provider."""

    name: str

    def fetch(self) -> list[RawRecord]:
        """Return raw records from a source system."""


class ProviderMapper(Protocol):
    """Maps source-native records into canonical records."""

    name: str

    def map(self, raw_records: Sequence[RawRecord]) -> list[CanonicalRecord]:
        """Convert source-specific data into canonical shape."""

