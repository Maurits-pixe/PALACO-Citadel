"""EARTH-104: strict legacy-js-v1 verifier for EARTH-084/085 safe-subset records.
No authorization, signing, or production writer capability.
"""
import hashlib
import json
import re

HEX = re.compile('^[0-9a-f]{64}$')
FIELDS_RECEIPT = ("protocol","sourceSHA256","outputSHA256","reviewerId","trustedEpoch","minimumAcceptedEpoch","status","stage","reasons")
FIELDS_RECORD = ("index","previousHash","receiptSHA256","status","stage")
MAX_SAFE = 9007199254740991

class LegacyError(ValueError):
    pass

def _validate(v):
    if v is None or isinstance(v,bool):
        return
    if isinstance(v,str):
        if any(0xD800 <= ord(c) <= 0xDFFF for c in v):
            raise LegacyError('UNPAIRED_SURROGATE')
        return
    if type(v) is int and -MAX_SAFE <= v <= MAX_SAFE:
        return
    if isinstance(v,list):
        for x in v: _validate(x)
        return
    if isinstance(v,dict):
        for k,x in v.items():
            if not isinstance(k,str) or re.fullmatch(r"(0|[1-9][0-9]*)", k) and int(k) < 4294967295: raise LegacyError("UNSUPPORTED_JS_KEY_ORDER")
            _validate(k)
            _validate(x)
        return
    raise LegacyError("UNSUPPORTED_JS_VALUE")

def strict_json_loads(raw):
    def pairs(items):
        result={}
        for key,value in items:
            if key in result: raise LegacyError("DUPLICATE_KEY")
            result[key]=value
        return result
    def invalid_constant(value):
        raise LegacyError("NONFINITE_NUMBER")
    try:
        obj=json.loads(raw,object_pairs_hook=pairs,parse_constant=invalid_constant)
    except (ValueError,UnicodeError) as exc:
        raise LegacyError("INVALID_JSON") from exc
    _validate(obj)
    return obj

def js_bytes(obj):
    _validate(obj)
    # Safe subset: ASCII escaping disabled to match JS JSON.stringify for Unicode.
    return json.dumps(obj,ensure_ascii=False,separators=(",",":"),allow_nan=False).encode("utf-8")

def sha(obj):
    return hashlib.sha256(js_bytes(obj)).hexdigest()

def _ordered(src,fields):
    if not isinstance(src,dict) or set(src)!=set(fields):
        raise LegacyError("SCHEMA_MISMATCH")
    return {k:src[k] for k in fields}

def verify_receipt(receipt):
    if not isinstance(receipt,dict) or set(receipt)!=set(FIELDS_RECEIPT)|{"receiptSHA256"}:
        raise LegacyError("RECEIPT_SCHEMA")
    payload=_ordered({k:receipt[k] for k in FIELDS_RECEIPT},FIELDS_RECEIPT)
    if not isinstance(receipt["receiptSHA256"],str) or not HEX.fullmatch(receipt["receiptSHA256"]):
        raise LegacyError("RECEIPT_HASH_FORMAT")
    if receipt["receiptSHA256"]!=sha(payload):
        raise LegacyError("RECEIPT_DIGEST")
    return receipt["receiptSHA256"]

def verify_chain(records):
    if not isinstance(records,list): raise LegacyError("CHAIN_TYPE")
    previous=None
    for i,record in enumerate(records):
        if not isinstance(record,dict) or set(record)!=set(FIELDS_RECORD)|{"recordHash"}:
            raise LegacyError("RECORD_SCHEMA")
        payload=_ordered({k:record[k] for k in FIELDS_RECORD},FIELDS_RECORD)
        if type(record["index"]) is not int or record["index"]!=i or record["previousHash"]!=previous:
            raise LegacyError("BROKEN_LINK")
        if not isinstance(record["receiptSHA256"],str) or not HEX.fullmatch(record["receiptSHA256"]):
            raise LegacyError("RECEIPT_HASH_FORMAT")
        expected=sha(payload)
        if not isinstance(record["recordHash"],str) or not HEX.fullmatch(record["recordHash"]): raise LegacyError("RECORD_HASH_FORMAT")
        if record["recordHash"]!=expected: raise LegacyError("RECORD_DIGEST")
        previous=expected
    return previous
)

FIELDS_RECEIPT = ("protocol","sourceSHA256","outputSHA256","reviewerId","trustedEpoch","minimumAcceptedEpoch","status","stage","reasons")
FIELDS_RECORD = ("index","previousHash","receiptSHA256","status","stage")
MAX_SAFE = 9007199254740991

class LegacyError(ValueError):
    pass

def _validate(v):
    if v is None or isinstance(v,(str,bool)):
        return
    if type(v) is int and -MAX_SAFE <= v <= MAX_SAFE:
        return
    if isinstance(v,list):
        for x in v: _validate(x)
        return
    if isinstance(v,dict):
        for k,x in v.items():
            if not isinstance(k,str): raise LegacyError("INVALID_KEY")
            _validate(x)
        return
    raise LegacyError("UNSUPPORTED_JS_VALUE")

def js_bytes(obj):
    _validate(obj)
    # Safe subset: ASCII escaping disabled to match JS JSON.stringify for Unicode.
    return json.dumps(obj,ensure_ascii=False,separators=(",",":"),allow_nan=False).encode("utf-8")

def sha(obj):
    return hashlib.sha256(js_bytes(obj)).hexdigest()

def _ordered(src,fields):
    if not isinstance(src,dict) or set(src)!=set(fields):
        raise LegacyError("SCHEMA_MISMATCH")
    return {k:src[k] for k in fields}

def verify_receipt(receipt):
    if not isinstance(receipt,dict) or set(receipt)!=set(FIELDS_RECEIPT)|{"receiptSHA256"}:
        raise LegacyError("RECEIPT_SCHEMA")
    payload=_ordered({k:receipt[k] for k in FIELDS_RECEIPT},FIELDS_RECEIPT)
    if receipt["receiptSHA256"]!=sha(payload):
        raise LegacyError("RECEIPT_DIGEST")
    return receipt["receiptSHA256"]

def verify_chain(records):
    if not isinstance(records,list): raise LegacyError("CHAIN_TYPE")
    previous=None
    for i,record in enumerate(records):
        if not isinstance(record,dict) or set(record)!=set(FIELDS_RECORD)|{"recordHash"}:
            raise LegacyError("RECORD_SCHEMA")
        payload=_ordered({k:record[k] for k in FIELDS_RECORD},FIELDS_RECORD)
        if type(record["index"]) is not int or record["index"]!=i or record["previousHash"]!=previous:
            raise LegacyError("BROKEN_LINK")
        if not isinstance(record["receiptSHA256"],str) or len(record["receiptSHA256"])!=64:
            raise LegacyError("RECEIPT_HASH_FORMAT")
        expected=sha(payload)
        if record["recordHash"]!=expected: raise LegacyError("RECORD_DIGEST")
        previous=expected
    return previous
)

FIELDS_RECEIPT = ("protocol","sourceSHA256","outputSHA256","reviewerId","trustedEpoch","minimumAcceptedEpoch","status","stage","reasons")
FIELDS_RECORD = ("index","previousHash","receiptSHA256","status","stage")
MAX_SAFE = 9007199254740991

class LegacyError(ValueError):
    pass

def _validate(v):
    if v is None or isinstance(v,bool):
        return
    if isinstance(v,str):
        if any(0xD800 <= ord(c) <= 0xDFFF for c in v):
            raise LegacyError('UNPAIRED_SURROGATE')
        return
    if type(v) is int and -MAX_SAFE <= v <= MAX_SAFE:
        return
    if isinstance(v,list):
        for x in v: _validate(x)
        return
    if isinstance(v,dict):
        for k,x in v.items():
            if not isinstance(k,str) or re.fullmatch(r"(0|[1-9][0-9]*)", k) and int(k) < 4294967295: raise LegacyError("UNSUPPORTED_JS_KEY_ORDER")
            _validate(k)
            _validate(x)
        return
    raise LegacyError("UNSUPPORTED_JS_VALUE")

def strict_json_loads(raw):
    def pairs(items):
        result={}
        for key,value in items:
            if key in result: raise LegacyError("DUPLICATE_KEY")
            result[key]=value
        return result
    def invalid_constant(value):
        raise LegacyError("NONFINITE_NUMBER")
    try:
        obj=json.loads(raw,object_pairs_hook=pairs,parse_constant=invalid_constant)
    except (ValueError,UnicodeError) as exc:
        raise LegacyError("INVALID_JSON") from exc
    _validate(obj)
    return obj

def js_bytes(obj):
    _validate(obj)
    # Safe subset: ASCII escaping disabled to match JS JSON.stringify for Unicode.
    return json.dumps(obj,ensure_ascii=False,separators=(",",":"),allow_nan=False).encode("utf-8")

def sha(obj):
    return hashlib.sha256(js_bytes(obj)).hexdigest()

def _ordered(src,fields):
    if not isinstance(src,dict) or set(src)!=set(fields):
        raise LegacyError("SCHEMA_MISMATCH")
    return {k:src[k] for k in fields}

def verify_receipt(receipt):
    if not isinstance(receipt,dict) or set(receipt)!=set(FIELDS_RECEIPT)|{"receiptSHA256"}:
        raise LegacyError("RECEIPT_SCHEMA")
    payload=_ordered({k:receipt[k] for k in FIELDS_RECEIPT},FIELDS_RECEIPT)
    if not isinstance(receipt["receiptSHA256"],str) or not HEX.fullmatch(receipt["receiptSHA256"]):
        raise LegacyError("RECEIPT_HASH_FORMAT")
    if receipt["receiptSHA256"]!=sha(payload):
        raise LegacyError("RECEIPT_DIGEST")
    return receipt["receiptSHA256"]

def verify_chain(records):
    if not isinstance(records,list): raise LegacyError("CHAIN_TYPE")
    previous=None
    for i,record in enumerate(records):
        if not isinstance(record,dict) or set(record)!=set(FIELDS_RECORD)|{"recordHash"}:
            raise LegacyError("RECORD_SCHEMA")
        payload=_ordered({k:record[k] for k in FIELDS_RECORD},FIELDS_RECORD)
        if type(record["index"]) is not int or record["index"]!=i or record["previousHash"]!=previous:
            raise LegacyError("BROKEN_LINK")
        if not isinstance(record["receiptSHA256"],str) or not HEX.fullmatch(record["receiptSHA256"]):
            raise LegacyError("RECEIPT_HASH_FORMAT")
        expected=sha(payload)
        if not isinstance(record["recordHash"],str) or not HEX.fullmatch(record["recordHash"]): raise LegacyError("RECORD_HASH_FORMAT")
        if record["recordHash"]!=expected: raise LegacyError("RECORD_DIGEST")
        previous=expected
    return previous
)

FIELDS_RECEIPT = ("protocol","sourceSHA256","outputSHA256","reviewerId","trustedEpoch","minimumAcceptedEpoch","status","stage","reasons")
FIELDS_RECORD = ("index","previousHash","receiptSHA256","status","stage")
MAX_SAFE = 9007199254740991

class LegacyError(ValueError):
    pass

def _validate(v):
    if v is None or isinstance(v,(str,bool)):
        return
    if type(v) is int and -MAX_SAFE <= v <= MAX_SAFE:
        return
    if isinstance(v,list):
        for x in v: _validate(x)
        return
    if isinstance(v,dict):
        for k,x in v.items():
            if not isinstance(k,str): raise LegacyError("INVALID_KEY")
            _validate(x)
        return
    raise LegacyError("UNSUPPORTED_JS_VALUE")

def js_bytes(obj):
    _validate(obj)
    # Safe subset: ASCII escaping disabled to match JS JSON.stringify for Unicode.
    return json.dumps(obj,ensure_ascii=False,separators=(",",":"),allow_nan=False).encode("utf-8")

def sha(obj):
    return hashlib.sha256(js_bytes(obj)).hexdigest()

def _ordered(src,fields):
    if not isinstance(src,dict) or set(src)!=set(fields):
        raise LegacyError("SCHEMA_MISMATCH")
    return {k:src[k] for k in fields}

def verify_receipt(receipt):
    if not isinstance(receipt,dict) or set(receipt)!=set(FIELDS_RECEIPT)|{"receiptSHA256"}:
        raise LegacyError("RECEIPT_SCHEMA")
    payload=_ordered({k:receipt[k] for k in FIELDS_RECEIPT},FIELDS_RECEIPT)
    if receipt["receiptSHA256"]!=sha(payload):
        raise LegacyError("RECEIPT_DIGEST")
    return receipt["receiptSHA256"]

def verify_chain(records):
    if not isinstance(records,list): raise LegacyError("CHAIN_TYPE")
    previous=None
    for i,record in enumerate(records):
        if not isinstance(record,dict) or set(record)!=set(FIELDS_RECORD)|{"recordHash"}:
            raise LegacyError("RECORD_SCHEMA")
        payload=_ordered({k:record[k] for k in FIELDS_RECORD},FIELDS_RECORD)
        if type(record["index"]) is not int or record["index"]!=i or record["previousHash"]!=previous:
            raise LegacyError("BROKEN_LINK")
        if not isinstance(record["receiptSHA256"],str) or len(record["receiptSHA256"])!=64:
            raise LegacyError("RECEIPT_HASH_FORMAT")
        expected=sha(payload)
        if record["recordHash"]!=expected: raise LegacyError("RECORD_DIGEST")
        previous=expected
    return previous
