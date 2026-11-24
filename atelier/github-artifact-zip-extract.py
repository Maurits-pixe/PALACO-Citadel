#!/usr/bin/env python3
"""Bounded extraction of a GitHub Actions evidence ZIP; never grants release."""
import os
import pathlib
import stat
import sys
import zipfile

EXPECTED = frozenset(("atelier-review-evidence.json", "atelier-review-integrity.json"))
MAX_ARCHIVE = 100_000
MAX_MEMBER = 20_000


def extract(archive_path: str, output_path: str) -> None:
    archive = pathlib.Path(archive_path)
    target = pathlib.Path(output_path)
    if not archive.is_file() or archive.is_symlink() or archive.stat().st_size > MAX_ARCHIVE:
        raise ValueError("Invalid or oversized artifact ZIP")
    with zipfile.ZipFile(archive) as zipped:
        items = zipped.infolist()
        if len(items) != len(EXPECTED) or {i.filename for i in items} != EXPECTED:
            raise ValueError("Artifact ZIP must contain exactly the two expected JSON files")
        for item in items:
            mode = (item.external_attr >> 16) & 0xFFFF
            if item.is_dir() or (mode and stat.S_IFMT(mode) not in (0, stat.S_IFREG)):
                raise ValueError("Artifact ZIP member is not a regular file")
            if item.file_size < 1 or item.file_size > MAX_MEMBER or item.compress_size < 1:
                raise ValueError("Artifact ZIP member has invalid size")
            if item.file_size > 100 * item.compress_size:
                raise ValueError("Artifact ZIP member compression ratio is excessive")
        # Reject redirects anywhere in the destination ancestry, including
        # a symlinked parent of a not-yet-created output directory.
        for component in (target, *target.parents):
            if component.is_symlink():
                raise ValueError("Artifact extraction path must not contain symlinks")
        if target.exists() and (not target.is_dir() or any(target.iterdir())):
            raise ValueError("Artifact extraction directory must be an empty directory")
        target.mkdir(mode=0o700, parents=True, exist_ok=True)
        for item in items:
            # Only exact basenames are accepted; no zip-slip, path nesting or symlinks.
            with zipped.open(item) as source:
                data = source.read(MAX_MEMBER + 1)
                if len(data) != item.file_size or source.read(1):
                    raise ValueError("ZIP member size mismatch")
            destination = target / item.filename
            fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            try:
                with os.fdopen(fd, "wb") as stream:
                    stream.write(data)
            except BaseException:
                try:
                    os.close(fd)
                except OSError:
                    pass
                raise


if __name__ == "__main__":
    try:
        if len(sys.argv) != 3:
            raise ValueError("Usage: github-artifact-zip-extract.py ZIP OUTPUT_DIR")
        extract(sys.argv[1], sys.argv[2])
        print("Bounded expected evidence members extracted for downstream byte comparison; HOLD/DENY")
    except (ValueError, OSError, zipfile.BadZipFile, RuntimeError) as exc:
        print(f"Artifact ZIP rejected: {exc}", file=sys.stderr)
        sys.exit(1)
