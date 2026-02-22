"""Top-level CLI command definitions."""

from __future__ import annotations

import argparse


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="GeorgeAI command interface.")
    parser.add_argument(
        "command",
        choices=["ingest", "metrics", "forecast"],
        help="Pipeline command to run.",
    )
    parser.add_argument(
        "--provider",
        default="pushups",
        help="Data provider key (for example: pushups, myfitnesspal, garmin).",
    )
    return parser


def run_from_args(args: argparse.Namespace) -> int:
    """Dispatch CLI commands to orchestration modules."""
    raise NotImplementedError("TODO: wire CLI commands to orchestration layer.")

