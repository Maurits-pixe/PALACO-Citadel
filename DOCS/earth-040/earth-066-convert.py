#!/usr/bin/env python3
"""EARTH-066: deterministic local Shapefile -> GeoJSON conversion. Not source admission."""
import hashlib
import json
import pathlib
import sys
import zipfile

def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: earth-066-convert.py <official-zip> <output-directory>")
    archive_path = pathlib.Path(sys.argv[1])
    output_dir = pathlib.Path(sys.argv[2])
    try:
        import shapefile
    except ImportError as exc:
        raise SystemExit("MISSING_PINNED_PYSHP: install pyshp in a controlled environment") from exc
    raw = archive_path.read_bytes()
    if not raw or len(raw) > 20 * 1024 * 1024:
        raise SystemExit("SOURCE_SIZE_LIMIT")
    with zipfile.ZipFile(archive_path) as z:
        names = z.namelist()
        expected = {"ne_110m_land.shp", "ne_110m_land.shx", "ne_110m_land.dbf", "ne_110m_land.prj"}
        if len(names) != len(set(names)) or not expected.issubset(set(names)):
            raise SystemExit("INVALID_ARCHIVE_CONTENTS")
        if any("/" in name or "\\" in name or name in (".", "..") for name in names):
            raise SystemExit("UNSAFE_ARCHIVE_PATH")
        if len(names) > 32 or sum(i.file_size for i in z.infolist()) > 40 * 1024 * 1024:
            raise SystemExit("ZIP_EXPANSION_LIMIT")
        if z.testzip() is not None:
            raise SystemExit("ZIP_CRC_FAILURE")
        prj = z.read("ne_110m_land.prj").decode("utf-8").upper()
        if "WGS_1984" not in prj and "WGS 84" not in prj:
            raise SystemExit("UNVERIFIED_CRS")
        # Read from memory; never extract untrusted paths.
        import io
        reader = shapefile.Reader(
            shp=io.BytesIO(z.read("ne_110m_land.shp")),
            shx=io.BytesIO(z.read("ne_110m_land.shx")),
            dbf=io.BytesIO(z.read("ne_110m_land.dbf")),
        )
        features = []
        for shape in reader.shapes():
            geom = shape.__geo_interface__
            if geom["type"] not in ("Polygon", "MultiPolygon"):
                raise SystemExit("UNSUPPORTED_GEOMETRY")
            features.append({"type": "Feature", "properties": {}, "geometry": geom})
        if len(features) > 20000:
            raise SystemExit("FEATURE_COUNT_LIMIT")
    result = {"type": "FeatureCollection", "features": features}
    encoded = (json.dumps(result, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode("utf-8")
    if len(encoded) > 20 * 1024 * 1024:
        raise SystemExit("GEOJSON_SIZE_LIMIT")
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "ne_110m_land.geojson").write_bytes(encoded)
    evidence = {
        "admission": "NOT_ADMITTED",
        "raw_sha256": hashlib.sha256(raw).hexdigest(),
        "geojson_sha256": hashlib.sha256(encoded).hexdigest(),
        "feature_count": len(features),
        "converter": "EARTH-066 pyshp",
        "pyshp_version": shapefile.__version__,
        "source_archive": archive_path.name,
    }
    (output_dir / "conversion-evidence.json").write_text(
        json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps(evidence, sort_keys=True))

if __name__ == "__main__":
    main()
