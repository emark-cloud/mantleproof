"""Pytest fixtures shared across Tier-1 check tests (T10) and Tier-2 (T18)."""

import pathlib

import pytest


@pytest.fixture
def fixtures_dir():
    return pathlib.Path(__file__).parent / "fixtures"


@pytest.fixture
def load_contract(fixtures_dir):
    """Return the Solidity source of a fixture under fixtures/contracts/."""

    def _load(name: str) -> str:
        return (fixtures_dir / "contracts" / name).read_text()

    return _load
