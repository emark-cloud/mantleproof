"""SCAFFOLD — implement in T10. Positive + negative fixture each."""

import pytest

pytestmark = pytest.mark.skip(reason="SCAFFOLD: replay_check not implemented (T10)")


def test_replay_positive_fixture_triggers():
    ...


def test_replay_negative_fixture_clean():
    ...
