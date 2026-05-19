"""EVM bytecode disassembly helpers (pyevmasm wrapper).

Pure, offline, no network. The check modules (T10) build on these primitives:
- `disassemble` — tolerant instruction stream
- `iter_pushes` — every PUSHn immediate (pc, size, int value)
- `find_address_constants` — PUSH20 immediates that look like addresses
- `find_selectors` — PUSH4 immediates (candidate function selectors)
- `pushes_value` — does any immediate equal `value` (e.g. hardcoded chainId 1)
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass

from pyevmasm import disassemble_all


@dataclass(frozen=True, slots=True)
class Instr:
    pc: int
    name: str
    size: int
    operand: int | None  # PUSHn immediate as int, else None


def _normalize(code: bytes | str) -> bytes:
    if isinstance(code, str):
        code = code.removeprefix("0x")
        return bytes.fromhex(code)
    return code


def disassemble(code: bytes | str) -> list[Instr]:
    """Tolerant disassembly. Trailing/invalid bytes become INVALID, never raise."""
    raw = _normalize(code)
    out: list[Instr] = []
    for ins in disassemble_all(raw):
        out.append(
            Instr(
                pc=ins.pc,
                name=ins.name,
                size=ins.size,
                operand=ins.operand if ins.has_operand else None,
            )
        )
    return out


def iter_pushes(code: bytes | str) -> Iterator[tuple[int, int, int]]:
    """Yield (pc, push_size_bytes, value) for every PUSH1..PUSH32."""
    for ins in disassemble(code):
        if ins.operand is not None and ins.name.startswith("PUSH"):
            push_size = ins.size - 1  # opcode byte + N immediate bytes
            yield ins.pc, push_size, ins.operand


def find_address_constants(code: bytes | str) -> set[str]:
    """0x addresses embedded as PUSH20 immediates (lowercase hex).

    Skips the zero address and trivially small values (not real addresses).
    """
    found: set[str] = set()
    for _pc, size, value in iter_pushes(code):
        if size == 20 and value > 0xFFFF:
            found.add("0x" + format(value, "040x"))
    return found


def find_selectors(code: bytes | str) -> set[str]:
    """Candidate 4-byte function selectors (PUSH4 immediates), as 0x hex."""
    sels: set[str] = set()
    for _pc, size, value in iter_pushes(code):
        if size == 4:
            sels.add("0x" + format(value, "08x"))
    return sels


def pushes_value(code: bytes | str, value: int) -> bool:
    """True if any PUSH immediate equals `value` (e.g. a hardcoded chainId)."""
    return any(v == value for _pc, _sz, v in iter_pushes(code))


def has_opcode(code: bytes | str, name: str) -> bool:
    """True if the disassembly contains opcode `name` (e.g. 'CHAINID')."""
    target = name.upper()
    return any(ins.name == target for ins in disassemble(code))
