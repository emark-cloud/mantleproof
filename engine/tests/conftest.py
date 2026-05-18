"""Pytest fixtures. SCAFFOLD — shared fixtures added alongside T10/T18."""

import pytest


@pytest.fixture
def fixtures_dir():
    import pathlib
    return pathlib.Path(__file__).parent / "fixtures"
