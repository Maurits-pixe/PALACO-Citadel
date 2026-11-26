#!/usr/bin/env python3
"""Fail-closed extraction of the five-file Atelier diagnostic archive."""
import os
import pathlib
import stat
import sys
import zipfile

EXPECTED = frozenset((
    "atelier-artifact-metadata-observation.json",
    "atelier-extracted-evidence-check.json",
    "atelier-zip-integrity-check.json",
    "atelier-final-artifact-witness.json",
    "atelier-archive-manifest.json",
))
MAX_ZIP = 200_000
MAX_MEMBER = 20_000

def extract(archive_path, output_path):
    archive, target = pathlib.Path(archive_path), pathlib.Path(output_path)
    if archive.is_symlink() or not archive.is_file() or not (0 < archive.stat().st_size <= MAX_ZIP):
        raise ValueError("Missing, symlinked or oversized archive")
    for component in (target, *target.parents):
        if component.is_symlink():
            raise ValueError("Symlink in extraction path")
    if target.exists() and (not target.is_dir() or any(target.iterdir())):
        raise ValueError("Extraction destination must be an empty directory")
    with zipfile.ZipFile(archive) as z:
        members = z.infolist()
        if len(members) != len(EXPECTED) or {m.filename for m in members} != EXPECTED:
            raise ValueError("Archive has missing, duplicate or unexpected members")
        verified = {}
        for m in members:
            mode = (m.external_attr >> 16) & 0xFFFF
            if (m.is_dir() or (mode and stat.S_IFMT(mode) not in (0, stat.S_IFREG))
                or not (0 < m.file_size <= MAX_MEMBER)
                or m.compress_size < 1 or m.file_size > m.compress_size * 100):
                raise ValueError("Unsafe or excessive archive member")
            with z.open(m) as source:
                contents = source.read(MAX_MEMBER + 1)
                if len(contents) != m.file_size or source.read(1):
                    raise ValueError("Archive member integrity failure")
            verified[m.filename] = contents
    target.mkdir(parents=True, mode=0o700, exist_ok=True)
    for name, contents in verified.items():
        fd = os.open(target / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
        with os.fdopen(fd, "wb") as out:
            out.write(contents)

if __name__ == "__main__":
    try:
        if len(sys.argv) != 3:
            raise ValueError("Usage: python3 github-diagnostic-archive-extract.py ZIP DESTINATION")
        extract(sys.argv[1], sys.argv[2])
        print("Downloaded diagnostic archive extracted under HOLD/DENY")
    except (OSError, ValueError, RuntimeError, zipfile.BadZipFile) as exc:
        print("Diagnostic archive rejected: " + str(exc), file=sys.stderr)
        sys.exit(1)
