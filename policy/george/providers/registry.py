"""In-memory provider registry."""

from __future__ import annotations

from .base import ProviderConnector, ProviderMapper

CONNECTORS: dict[str, ProviderConnector] = {}
MAPPERS: dict[str, ProviderMapper] = {}


def register_connector(key: str, connector: ProviderConnector) -> None:
    CONNECTORS[key] = connector


def register_mapper(key: str, mapper: ProviderMapper) -> None:
    MAPPERS[key] = mapper


def get_connector(key: str) -> ProviderConnector:
    if key not in CONNECTORS:
        raise KeyError(f"Connector not registered for provider: {key}")
    return CONNECTORS[key]


def get_mapper(key: str) -> ProviderMapper:
    if key not in MAPPERS:
        raise KeyError(f"Mapper not registered for provider: {key}")
    return MAPPERS[key]

