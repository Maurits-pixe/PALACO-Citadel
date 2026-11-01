#!/usr/bin/env python3
"""EARTH-093: real two-connection PostgreSQL contention probe (isolated CI only)."""
import os
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor

ENV = os.environ.copy()
BASE = ["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"]

def sql(statement):
    return subprocess.run(BASE + ["-c", statement], env=ENV, capture_output=True, text=True)

def writer(record_hash, receipt_hash):
    statement = (
        "SET lock_timeout='8s'; SELECT * FROM earth_audit.append_checkpoint_batch("
        "0,1,repeat('a',64),"
        "jsonb_build_array(jsonb_build_object('index',1,'previousHash',repeat('a',64),"
        f"'receiptSHA256',repeat('{receipt_hash}',64),'recordHash',repeat('{record_hash}',64))));"
    )
    return sql(statement)

def main():
    seed = sql("INSERT INTO earth_audit.checkpoint VALUES(1,0,1,repeat('a',64));"
               "INSERT INTO earth_audit.review_record(record_index,previous_hash,receipt_hash,record_hash)"
               " VALUES(0,NULL,repeat('b',64),repeat('a',64));")
    if seed.returncode:
        raise RuntimeError(f"seed failed: {seed.stderr}")
    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(writer, "c", "e")
        f2 = pool.submit(writer, "d", "f")
        results = [f1.result(), f2.result()]
    if sum(r.returncode == 0 for r in results) != 1:
        raise AssertionError(f"Expected exactly one winner, got {[r.returncode for r in results]}")
    state = sql("SELECT version||':'||chain_length FROM earth_audit.checkpoint WHERE id=1;"
                "SELECT count(*) FROM earth_audit.review_record;")
    if state.returncode or state.stdout.strip().splitlines() != ["1:2", "2"]:
        raise AssertionError(f"Invalid final state: {state.stdout!r} {state.stderr!r}")
    print("EARTH-093 PASS: exactly one writer committed; stale writer denied; no extra record")

if __name__ == "__main__":
    main()
