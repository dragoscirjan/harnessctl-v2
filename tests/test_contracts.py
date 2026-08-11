from hashlib import sha256
from importlib.resources import files
from pathlib import Path

import pytest

CONTRACT_NAMES = ("config-v2.schema.json", "memory-record-v1.schema.json")


@pytest.mark.parametrize("name", CONTRACT_NAMES)
def test_contract_copies_match_canonical_bytes(name: str) -> None:
    root = Path(__file__).parents[1]
    canonical = (root / "contracts" / name).read_bytes()
    npm_copy = (root / "extensions" / "contracts" / name).read_bytes()
    wheel_copy = files("harnessctl.contracts").joinpath(name).read_bytes()

    expected = sha256(canonical).hexdigest()
    assert sha256(npm_copy).hexdigest() == expected
    assert sha256(wheel_copy).hexdigest() == expected
