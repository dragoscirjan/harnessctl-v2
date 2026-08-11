import json
from pathlib import Path

import pytest

CONTRACT_IDS = {
    "config-v2.schema.json": "https://harnessctl.dev/contracts/config-v2.schema.json",
    "memory-record-v1.schema.json": "https://harnessctl.dev/contracts/memory-record-v1.schema.json",
}


@pytest.mark.parametrize(("name", "expected_id"), CONTRACT_IDS.items())
def test_canonical_contract_is_valid_json(name: str, expected_id: str) -> None:
    root = Path(__file__).parents[1]
    contract = json.loads((root / "contracts" / name).read_text(encoding="utf-8"))

    assert contract["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert contract["$id"] == expected_id
