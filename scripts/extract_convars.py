#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "pefile>=2024.8.26",
#   "unicorn>=2.1",
# ]
# ///
"""Extract the convar default values compiled into the Deadlock game DLLs.

Convars aren't in any game data file: each one is registered by a small static
initializer in `client.dll` / `server.dll`. Every initializer, directly or via a
per-type wrapper, ends in the same register function, called as

    register(ConVarRef*, const char* name, uint64 flags, const char* help,
             ..., CVarCreation* creation)   // creation: 6th arg ([rsp+0x28])

where `creation` holds the default value at +0x07 and the `EConVarType` at
+0x60. Rather than pattern-match each initializer variant, this emulates every
initializer (Unicorn) up to the register call and reads the arguments there.

The register function is located as the most common call target among calls
that pass a `citadel_*` name string, so it survives rebuilds without hardcoded
addresses.

Run by `scripts/build_version_and_upload.sh` on every assets build. Manually:

    uv run scripts/extract_convars.py \
        game/citadel/bin/win64/client.dll game/citadel/bin/win64/server.dll \
        > convars.json

Output: a JSON object of convar name -> `{type, default, flags, description?}`,
sorted by name. Convars registered by both DLLs are merged (server wins).
"""

from __future__ import annotations

import bisect
import collections
import json
import math
import re
import struct
import sys

import pefile
from unicorn import UC_ARCH_X86, UC_HOOK_CODE, UC_MODE_64, Uc, UcError
from unicorn.x86_const import (
    UC_X86_REG_GS_BASE,
    UC_X86_REG_R8,
    UC_X86_REG_R9,
    UC_X86_REG_RAX,
    UC_X86_REG_RCX,
    UC_X86_REG_RDX,
    UC_X86_REG_RIP,
    UC_X86_REG_RSP,
)

# EConVarType (tier1/convar.h)
TYPES = {
    0: "bool",
    1: "int16",
    2: "uint16",
    3: "int32",
    4: "uint32",
    5: "int64",
    6: "uint64",
    7: "float32",
    8: "float64",
    9: "string",
    10: "color",
    11: "vector2",
    12: "vector3",
    13: "vector4",
    14: "qangle",
}
VALUE_OFFSET = 0x07
TYPE_OFFSET = 0x60

STACK_BASE, STACK_SIZE = 0x7F0000000000, 0x100000
TLS_BASE, TLS_SIZE = 0x7E0000000000, 0x10000
RETURN_SENTINEL = 0x7D0000000000
IMPORT_STUBS = 0x7C0000000000
# String defaults are copied in with `CUtlString::Set(this, const char*)`.
CUTLSTRING_SET = "?Set@CUtlString@@QEAAXPEBD@Z"
MAX_INSTRUCTIONS = 20_000


class Image:
    def __init__(self, path: str):
        pe = pefile.PE(path, fast_load=True)
        pe.parse_data_directories(
            directories=[
                pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_EXCEPTION"],
                pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_IMPORT"],
            ]
        )
        self.base = pe.OPTIONAL_HEADER.ImageBase
        self.data = pe.get_memory_mapped_image()
        text = next(s for s in pe.sections if s.Name.rstrip(b"\0") == b".text")
        self.text_start = text.VirtualAddress
        self.text_end = text.VirtualAddress + text.Misc_VirtualSize
        # Function start RVAs from the unwind table (.pdata).
        self.funcs = sorted(
            {
                e.struct.BeginAddress
                for e in getattr(pe, "DIRECTORY_ENTRY_EXCEPTION", [])
            }
        )
        # IAT slot RVA -> imported symbol name.
        self.imports = {
            imp.address - self.base: (imp.name or b"").decode()
            for dll in getattr(pe, "DIRECTORY_ENTRY_IMPORT", [])
            for imp in dll.imports
        }

    def func_of(self, rva: int) -> int | None:
        i = bisect.bisect_right(self.funcs, rva) - 1
        return self.funcs[i] if i >= 0 else None

    def cstr(self, rva: int, limit: int = 4096) -> str | None:
        if not 0 < rva < len(self.data):
            return None
        end = self.data.find(b"\0", rva, rva + limit)
        if end < 0:
            return None
        try:
            return self.data[rva:end].decode("utf-8")
        except UnicodeDecodeError:
            return None

    def calls(self) -> list[tuple[int, int]]:
        """(call site, target) for every `call rel32` landing inside .text."""
        out = []
        text = self.data[self.text_start : self.text_end]
        for m in re.finditer(rb"\xe8", text):
            off = m.start()
            if off + 5 > len(text):
                break
            target = (
                self.text_start + off + 5 + struct.unpack_from("<i", text, off + 1)[0]
            )
            if self.text_start <= target < self.text_end:
                out.append((self.text_start + off, target))
        return out


def find_register(img: Image, calls: list[tuple[int, int]]) -> int:
    """Most common call target right after a `lea rdx, [rip+"citadel_..."]`."""
    votes = collections.Counter()
    for site, target in calls:
        # `lea rdx, [rip+disp32]` (48 8d 15) within the preceding few instructions.
        window = img.data[site - 24 : site]
        for m in re.finditer(rb"\x48\x8d\x15", window):
            lea = site - 24 + m.start()
            disp = struct.unpack_from("<i", img.data, lea + 3)[0]
            name = img.cstr(lea + 7 + disp, 128)
            if name and name.startswith("citadel_"):
                votes[target] += 1
    if not votes:
        raise SystemExit("register function not found")
    return votes.most_common(1)[0][0]


def candidates(img: Image, calls: list[tuple[int, int]], register: int) -> set[int]:
    """Functions calling `register`, plus the callers of those (per-type wrappers)."""
    callers = collections.defaultdict(set)
    for site, target in calls:
        f = img.func_of(site)
        if f is not None:
            callers[target].add(f)
    direct = callers[register]
    out = set(direct)
    for f in direct:
        out |= callers[f]
    return out


def num(v: float) -> float | None:
    """Rounded float; non-finite values (invalid JSON) become null."""
    return round(v, 6) if math.isfinite(v) else None


def decode(uc: Uc, ty: int, addr: int, img: Image):
    raw = bytes(uc.mem_read(addr, 16))
    match TYPES.get(ty):
        case "bool":
            return raw[0] != 0
        case "int16":
            return struct.unpack_from("<h", raw)[0]
        case "uint16":
            return struct.unpack_from("<H", raw)[0]
        case "int32":
            return struct.unpack_from("<i", raw)[0]
        case "uint32":
            return struct.unpack_from("<I", raw)[0]
        case "int64":
            return struct.unpack_from("<q", raw)[0]
        case "uint64":
            return struct.unpack_from("<Q", raw)[0]
        case "float32":
            return num(struct.unpack_from("<f", raw)[0])
        case "float64":
            return num(struct.unpack_from("<d", raw)[0])
        case "string":
            ptr = struct.unpack_from("<Q", raw)[0]
            return img.cstr(ptr - img.base) if ptr else ""
        case "color":
            return list(raw[:4])
        case "vector2":
            return [num(v) for v in struct.unpack_from("<2f", raw)]
        case "vector3" | "qangle":
            return [num(v) for v in struct.unpack_from("<3f", raw)]
        case "vector4":
            return [num(v) for v in struct.unpack_from("<4f", raw)]
    return None


def extract(path: str) -> dict[str, dict]:
    img = Image(path)
    calls = img.calls()
    register = find_register(img, calls)

    uc = Uc(UC_ARCH_X86, UC_MODE_64)
    size = (len(img.data) + 0xFFF) & ~0xFFF
    uc.mem_map(img.base, size)
    uc.mem_write(img.base, img.data)
    uc.mem_map(STACK_BASE, STACK_SIZE)
    uc.mem_map(TLS_BASE, TLS_SIZE)
    uc.mem_map(RETURN_SENTINEL, 0x1000)
    # Point every import at its own stub address; see `on_import`.
    stubs = {}
    uc.mem_map(IMPORT_STUBS, (len(img.imports) + 0xFFF) & ~0xFFF or 0x1000)
    for i, (slot, name) in enumerate(img.imports.items()):
        stubs[IMPORT_STUBS + i] = name
        uc.mem_write(img.base + slot, struct.pack("<Q", IMPORT_STUBS + i))
    uc.reg_write(UC_X86_REG_GS_BASE, TLS_BASE)

    found: dict[str, dict] = {}
    register_va = img.base + register

    def on_code(uc: Uc, address: int, _size: int, _user) -> None:
        if address != register_va:
            return
        rsp = uc.reg_read(UC_X86_REG_RSP)
        name = img.cstr(uc.reg_read(UC_X86_REG_RDX) - img.base, 256)
        creation = struct.unpack("<Q", uc.mem_read(rsp + 0x28, 8))[0]
        if name and creation:
            try:
                ty = struct.unpack("<h", uc.mem_read(creation + TYPE_OFFSET, 2))[0]
                if ty in TYPES:
                    help_ptr = uc.reg_read(UC_X86_REG_R9)
                    entry = {
                        "type": TYPES[ty],
                        "default": decode(uc, ty, creation + VALUE_OFFSET, img),
                        "flags": uc.reg_read(UC_X86_REG_R8),
                    }
                    if help_ptr and (desc := img.cstr(help_ptr - img.base)):
                        entry["description"] = desc
                    found[name] = entry
            except UcError:
                pass
        # Skip the register call itself: return the ConVarRef like it does.
        ret = struct.unpack("<Q", uc.mem_read(rsp, 8))[0]
        uc.reg_write(UC_X86_REG_RAX, uc.reg_read(UC_X86_REG_RCX))
        uc.reg_write(UC_X86_REG_RSP, rsp + 8)
        uc.reg_write(UC_X86_REG_RIP, ret)

    def on_import(uc: Uc, address: int, _size: int, _user) -> None:
        rsp = uc.reg_read(UC_X86_REG_RSP)
        this = uc.reg_read(UC_X86_REG_RCX)
        if stubs.get(address) == CUTLSTRING_SET:
            # A CUtlString is just its char*; keep pointing at the image's copy.
            uc.mem_write(this, struct.pack("<Q", uc.reg_read(UC_X86_REG_RDX)))
        uc.reg_write(UC_X86_REG_RAX, 0)
        uc.reg_write(UC_X86_REG_RSP, rsp + 8)
        uc.reg_write(UC_X86_REG_RIP, struct.unpack("<Q", uc.mem_read(rsp, 8))[0])

    uc.hook_add(UC_HOOK_CODE, on_code, begin=register_va, end=register_va)
    uc.hook_add(
        UC_HOOK_CODE, on_import, begin=IMPORT_STUBS, end=IMPORT_STUBS + len(stubs)
    )

    for func in sorted(candidates(img, calls, register)):
        uc.mem_write(STACK_BASE, b"\0" * STACK_SIZE)
        rsp = STACK_BASE + STACK_SIZE - 0x1000
        uc.mem_write(rsp, struct.pack("<Q", RETURN_SENTINEL))
        uc.reg_write(UC_X86_REG_RSP, rsp)
        for reg in (UC_X86_REG_RCX, UC_X86_REG_RDX, UC_X86_REG_R8, UC_X86_REG_R9):
            uc.reg_write(reg, 0)
        try:
            uc.emu_start(img.base + func, RETURN_SENTINEL, count=MAX_INSTRUCTIONS)
        except UcError:
            # Initializers tail-call into CRT code (atexit) we don't map; whatever
            # was registered before that is already recorded.
            pass
    return found


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(f"usage: {sys.argv[0]} <client.dll> [server.dll ...]")
    convars: dict[str, dict] = {}
    for path in sys.argv[1:]:
        found = extract(path)
        print(f"{path}: {len(found)} convars", file=sys.stderr)
        convars.update(found)
    json.dump(
        dict(sorted(convars.items())),
        sys.stdout,
        indent=1,
        ensure_ascii=False,
        allow_nan=False,
    )
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
