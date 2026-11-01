"""EARTH-067 synthetic fixture; not an authoritative geographic source."""
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile
import zipfile

import shapefile

with tempfile.TemporaryDirectory() as td:
    root = pathlib.Path(td)
    stem = root / "ne_110m_land"
    with shapefile.Writer(str(stem), shapeType=shapefile.POLYGON) as writer:
        writer.field("name", "C")
        writer.poly([[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]])
        writer.record("SYNTHETIC")
    stem.with_suffix(".prj").write_text('GEOGCS["GCS_WGS_1984"]', encoding="utf-8")
    archive = root / "fixture.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
        for ext in (".shp", ".shx", ".dbf", ".prj"):
            z.write(stem.with_suffix(ext), stem.name + ext)
    output = root / "out"
    script = pathlib.Path(__file__).with_name("earth-066-convert.py")
    subprocess.run([sys.executable, str(script), str(archive), str(output)], check=True)
    geojson = (output / "ne_110m_land.geojson").read_bytes()
    evidence = json.loads((output / "conversion-evidence.json").read_text())
    data = json.loads(geojson)
    assert evidence["admission"] == "NOT_ADMITTED"
    assert evidence["feature_count"] == 1
    assert evidence["coordinate_pairs"] == 5
    assert evidence["dateline_crossing_rings"] == 0
    assert evidence["renderer_compatible"] is True
    assert evidence["render_admission"] == "ELIGIBLE_FOR_REVIEW"
    assert evidence["geojson_sha256"] == hashlib.sha256(geojson).hexdigest()
    assert evidence["raw_sha256"] == hashlib.sha256(archive.read_bytes()).hexdigest()
    assert data["type"] == "FeatureCollection"
    assert data["features"][0]["geometry"]["type"] == "Polygon"
    # Repeat with identical input; output bytes must be reproducible.
    second = root / "out2"
    subprocess.run([sys.executable, str(script), str(archive), str(second)], check=True)
    assert geojson == (second / "ne_110m_land.geojson").read_bytes()
print("EARTH-067 SYNTHETIC CONVERTER QA PASS")
