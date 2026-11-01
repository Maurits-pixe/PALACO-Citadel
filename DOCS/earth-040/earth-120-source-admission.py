#!/usr/bin/env python3
"""EARTH-120: independent source hash gate; no trust-on-first-use."""
import hashlib
import json
import pathlib
import re
import sys

def verify(archive, manifest):
    record = json.loads(pathlib.Path(manifest).read_text(encoding="utf-8"))
    if record.get("status") != "REVIEWED_PIN" or record.get("source") != "Natural Earth 1:110m land" or record.get("archive") != "ne_110m_land.zip":
        raise ValueError("SOURCE_PIN_NOT_APPROVED")
    digest = record.get("sha256")
    if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise ValueError("INVALID_PIN")
    if hashlib.sha256(pathlib.Path(archive).read_bytes()).hexdigest() != digest:
        raise ValueError("SOURCE_HASH_MISMATCH")
    return "SOURCE_PIN_MATCH_ONLY_NOT_RENDER_ADMITTED"

if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: earth-120-source-admission.py <zip> <manifest>")
    try:
        print(verify(sys.argv[1], sys.argv[2]))
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"HOLD: {exc}") from exc
