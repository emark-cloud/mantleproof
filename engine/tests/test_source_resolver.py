"""T9 — Mantlescan/Etherscan source-resolver parser. Pure, no network/key."""

import json

import pytest

from mantleproof.source.mantlescan import (
    api_base,
    parse_getsourcecode,
)

ADDR = "0x5bE26527e817998A7206475496fDE1E68957c5A6"


def test_api_base_per_chain():
    assert api_base(5000) == "https://api.mantlescan.xyz/api"
    assert api_base(5003) == "https://api-sepolia.mantlescan.xyz/api"
    with pytest.raises(KeyError):
        api_base(1)


def test_unverified_returns_none():
    payload = {"status": "0", "message": "NOTOK", "result": "Not verified"}
    assert parse_getsourcecode(ADDR, payload) is None


def test_flat_single_file_source():
    payload = {
        "status": "1",
        "message": "OK",
        "result": [
            {
                "SourceCode": "// SPDX\npragma solidity 0.8.28;\ncontract A {}",
                "ABI": "[]",
                "ContractName": "A",
                "CompilerVersion": "v0.8.28+commit",
                "Proxy": "0",
                "Implementation": "",
            }
        ],
    }
    src = parse_getsourcecode(ADDR, payload)
    assert src is not None and src.verified
    assert src.name == "A"
    assert "A.sol" in src.sources
    assert "contract A" in src.flat()
    assert src.is_proxy is False


def test_standard_json_double_brace_multifile():
    std = {
        "language": "Solidity",
        "sources": {
            "src/Token.sol": {"content": "contract Token {}"},
            "lib/ERC20.sol": {"content": "contract ERC20 {}"},
        },
    }
    payload = {
        "status": "1",
        "message": "OK",
        "result": [
            {
                "SourceCode": "{" + json.dumps(std) + "}",  # Etherscan double-brace
                "ABI": "[]",
                "ContractName": "Token",
                "CompilerVersion": "v0.8.28",
                "Proxy": "0",
                "Implementation": "",
            }
        ],
    }
    src = parse_getsourcecode(ADDR, payload)
    assert src is not None
    assert set(src.sources) == {"src/Token.sol", "lib/ERC20.sol"}
    assert src.sources["src/Token.sol"] == "contract Token {}"


def test_proxy_detection():
    payload = {
        "status": "1",
        "message": "OK",
        "result": [
            {
                "SourceCode": "contract Proxy {}",
                "ABI": "[]",
                "ContractName": "Proxy",
                "CompilerVersion": "v0.8.28",
                "Proxy": "1",
                "Implementation": "0x3b355A7A25E75A320f631F9736afB3Dcc9F3Ef66",
            }
        ],
    }
    src = parse_getsourcecode(ADDR, payload)
    assert src is not None
    assert src.is_proxy is True
    assert src.implementation == "0x3b355A7A25E75A320f631F9736afB3Dcc9F3Ef66"
