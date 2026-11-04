"""EARTH-101 deterministic hash/link verification. NOT authorization or signature verification."""
import hashlib
import json
import re

HEX = re.compile(r"^[0-9a-f]{64}$")
MAX_BATCH = 1000


class AuditVerificationError(ValueError):
    pass


def canonical_bytes(value):
    if isinstance(value, float):
        raise AuditVerificationError("FLOAT_NOT_CANONICAL")
    if isinstance(value, dict):
        if any(not isinstance(k, str) for k in value):
            raise AuditVerificationError("INVALID_KEY")
        return ("{" + ",".join(
            json.dumps(k, ensure_ascii=False, separators=(",", ":")) + ":" +
            canonical_bytes(v).decode("utf-8")
            for k, v in sorted(value.items())
        ) + "}").encode("utf-8")
    if isinstance(value, list):
        return ("[" + ",".join(canonical_bytes(v).decode("utf-8") for v in value) + "]").encode("utf-8")
    if value is None or isinstance(value, (str, int, bool)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    raise AuditVerificationError("UNSUPPORTED_TYPE")


def digest(value):
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def verify_batch(expected_length, expected_head, records):
    if (type(expected_length) is not int or expected_length < 1 or
            not isinstance(expected_head, str) or not HEX.fullmatch(expected_head) or
            not isinstance(records, list) or not 1 <= len(records) <= MAX_BATCH):
        raise AuditVerificationError("INVALID_BATCH")
    previous = expected_head
    for index, item in enumerate(records, expected_length):
        if not isinstance(item, dict) or set(item) != {
            "index", "previousHash", "receipt", "receiptSHA256", "recordHash"
        }:
            raise AuditVerificationError("INVALID_RECORD_SCHEMA")
        if type(item["index"]) is not int or item["index"] != index or item["previousHash"] != previous:
            raise AuditVerificationError("INVALID_LINK")
        if not isinstance(item["receipt"], dict):
            raise AuditVerificationError("INVALID_RECEIPT")
        receipt_hash = digest(item["receipt"])
        if item["receiptSHA256"] != receipt_hash:
            raise AuditVerificationError("RECEIPT_HASH_MISMATCH")
        record_hash = digest({"index": index, "previousHash": previous, "receiptSHA256": receipt_hash})
        if item["recordHash"] != record_hash:
            raise AuditVerificationError("RECORD_HASH_MISMATCH")
        previous = record_hash
    return previous


def make_record(index, previous, receipt):
    receipt_hash = digest(receipt)
    return {"index": index, "previousHash": previous, "receipt": receipt,
            "receiptSHA256": receipt_hash,
            "recordHash": digest({"index": index, "previousHash": previous, "receiptSHA256": receipt_hash})}
