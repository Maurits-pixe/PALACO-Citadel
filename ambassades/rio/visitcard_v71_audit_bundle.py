"""RIO v7.1 independently verifiable offline atomic retention evidence bundle.

Exporter reads the existing SQLite database but verification accepts ONLY
canonical bundle bytes, separately pinned audit/proof heads and independently
trusted two-archive Ed25519 public keys. The verifier builds a disposable
in-memory database to reuse strict v6.8/v6.9 chain and signature verification;
it never needs the originating SQLite database or its filesystem.

Not a remote archive attestation, export signing service or production release.
GO-13 DRAFT / HOLD / DENY.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import hashlib
import json
import sqlite3
from typing import Any,Mapping

from visitcard_release_review import _hex
from visitcard_v68_retention_schedule import (
    GENESIS as AUDIT_GENESIS,_scan,initialize_retention_schedule,MAX_CHECKS
)
from visitcard_v69_historical_proofs import (
    GENESIS as PROOF_GENESIS,_proof_chain,initialize_historical_proofs
)
from visitcard_v5_security_review import EXTERNAL_BLOCKERS
from visitcard_witness_enrollment import _canonical

MAX_BUNDLE=4*1024*1024
MAX_BUNDLE_EVENTS=256
SCOPE="RIO-VISITCARD-V7.1-ATOMIC-AUDIT-BUNDLE"


class BundleState(str,Enum):
    VERIFIED_INFORMATIONAL="VERIFIED_INFORMATIONAL"
    HISTORICAL_QUARANTINE="HISTORICAL_QUARANTINE"
    BLOCKED="BLOCKED"


@dataclass(frozen=True)
class BundleReview:
    state:BundleState
    blockers:tuple[str,...]
    audit_count:int|None=None
    proof_count:int|None=None
    bundle_sha256:str|None=None
    release_permitted:bool=False
    merge_permitted:bool=False
    activation_permitted:bool=False


def _blocked(reason:str)->BundleReview:
    return BundleReview(BundleState.BLOCKED,
                        tuple(sorted(set(EXTERNAL_BLOCKERS+(reason,)))))


def _unique_pairs(pairs:list[tuple[str,Any]])->dict[str,Any]:
    result={}
    for k,v in pairs:
        if k in result:
            raise ValueError("duplicate key")
        result[k]=v
    return result


def _validate_pins(archive_keys:Mapping[str,bytes],archive_ids:tuple[str,str],
    audit_sequence:int,audit_head:str,proof_sequence:int,proof_head:str)->bool:
    return (
        isinstance(archive_keys,Mapping) and isinstance(archive_ids,tuple)
        and len(archive_ids)==2 and archive_ids[0]!=archive_ids[1]
        and all(isinstance(n,str) and 1<=len(n)<=128 for n in archive_ids)
        and all(isinstance(archive_keys.get(n),bytes)
                and len(archive_keys[n])==32 for n in archive_ids)
        and archive_keys[archive_ids[0]]!=archive_keys[archive_ids[1]]
        and type(audit_sequence) is int and 0<=audit_sequence<=MAX_BUNDLE_EVENTS
        and type(proof_sequence) is int and 0<=proof_sequence<=audit_sequence
        and _hex(audit_head) and _hex(proof_head)
    )


def _extract(db:sqlite3.Connection)->dict[str,Any]:
    """Trusted table names only. Caller must already be in read transaction."""
    p=db.execute("""SELECT anchor_at,interval_seconds,grace_seconds,go13
                    FROM rio_v68_schedule WHERE id=1""").fetchone()
    if p is None or len(p)!=4:
        raise ValueError("missing schedule")
    events=db.execute("""SELECT slot,event_json,previous_sha256,head_sha256
                         FROM rio_v68_history ORDER BY slot""").fetchall()
    proofs=db.execute("""SELECT sequence,audit_slot,evidence_json,
                         previous_sha256,head_sha256
                         FROM rio_v69_historical_proofs ORDER BY sequence""").fetchall()
    if len(events)>MAX_BUNDLE_EVENTS or len(proofs)>MAX_BUNDLE_EVENTS:
        raise ValueError("bundle must be split into independently pinned exports")
    return {
        "version":1,"scope":SCOPE,"go13":"HOLD",
        "schedule":{
            "anchor_at":p[0],"interval_seconds":p[1],
            "grace_seconds":p[2],"go13":p[3]
        },
        "audit":[{"slot":row[0],"event_json":row[1],
                  "previous_sha256":row[2],"head_sha256":row[3]}
                 for row in events],
        "proofs":[{"sequence":row[0],"audit_slot":row[1],
                   "evidence_json":row[2],"previous_sha256":row[3],
                   "head_sha256":row[4]} for row in proofs]
    }


def export_atomic_audit_bundle(db:sqlite3.Connection,*,
    pinned_archive_keys:Mapping[str,bytes],expected_archive_ids:tuple[str,str],
    independently_pinned_audit_sequence:int,
    independently_pinned_audit_head_sha256:str,
    independently_pinned_proof_sequence:int,
    independently_pinned_proof_head_sha256:str,
)->bytes:
    """Export a verified, complete small history, not a local success assertion."""
    if (not isinstance(db,sqlite3.Connection) or db.in_transaction
        or not _validate_pins(
            pinned_archive_keys,expected_archive_ids,
            independently_pinned_audit_sequence,independently_pinned_audit_head_sha256,
            independently_pinned_proof_sequence,independently_pinned_proof_head_sha256)):
        raise ValueError("independent archive pins and idle database required")
    try:
        db.execute("BEGIN")
        audit=_scan(db)
        proofs=_proof_chain(db,pinned_archive_keys,expected_archive_ids)
        if (audit is None or proofs is None
            or (audit[0],audit[1])!=
              (independently_pinned_audit_sequence,independently_pinned_audit_head_sha256)
            or proofs[:2]!=
              (independently_pinned_proof_sequence,independently_pinned_proof_head_sha256)):
            raise ValueError("audit or signed proof history is invalid")
        obj=_extract(db)
        raw=_canonical(obj)
        if len(raw)>MAX_BUNDLE:
            raise ValueError("audit bundle exceeds maximum size")
        return raw
    finally:
        if db.in_transaction:
            db.rollback()


def verify_atomic_audit_bundle(bundle:Any,*,
    pinned_archive_keys:Mapping[str,bytes],expected_archive_ids:tuple[str,str],
    independently_pinned_audit_sequence:int,
    independently_pinned_audit_head_sha256:str,
    independently_pinned_proof_sequence:int,
    independently_pinned_proof_head_sha256:str,
    independently_pinned_bundle_sha256:str,
)->BundleReview:
    """No connection to source database; never trusts embedded keys or pins."""
    if (type(bundle) is not bytes or not 0<len(bundle)<=MAX_BUNDLE
        or not _hex(independently_pinned_bundle_sha256)
        or not _validate_pins(
            pinned_archive_keys,expected_archive_ids,
            independently_pinned_audit_sequence,independently_pinned_audit_head_sha256,
            independently_pinned_proof_sequence,independently_pinned_proof_head_sha256)):
        return _blocked("INVALID_EXTERNAL_BUNDLE_TRUST_INPUT")
    digest=hashlib.sha256(bundle).hexdigest()
    if digest!=independently_pinned_bundle_sha256:
        return _blocked("BUNDLE_CONTENT_PIN_MISMATCH")
    try:
        obj=json.loads(bundle,object_pairs_hook=_unique_pairs)
        if (not isinstance(obj,dict)
            or set(obj)!={"version","scope","go13","schedule","audit","proofs"}
            or _canonical(obj)!=bundle
            or type(obj["version"]) is not int or obj["version"]!=1
            or obj["scope"]!=SCOPE or obj["go13"]!="HOLD"):
            return _blocked("INVALID_CANONICAL_BUNDLE")
        policy=obj["schedule"]
        if (not isinstance(policy,dict)
            or set(policy)!={"anchor_at","interval_seconds","grace_seconds","go13"}
            or policy["go13"]!="HOLD"):
            return _blocked("INVALID_SCHEDULE_POLICY")
        from visitcard_v68_retention_schedule import _time
        anchor=_time(policy["anchor_at"])
        if (type(policy["interval_seconds"]) is not int
            or type(policy["grace_seconds"]) is not int):
            return _blocked("INVALID_POLICY_TYPES")
        events=obj["audit"]
        proofs=obj["proofs"]
        if (not isinstance(events,list) or not isinstance(proofs,list)
            or len(events)>MAX_BUNDLE_EVENTS or len(proofs)>MAX_BUNDLE_EVENTS
            or len(events)!=independently_pinned_audit_sequence
            or len(proofs)!=independently_pinned_proof_sequence):
            return _blocked("MISSING_OR_EXTRA_ARCHIVE_RECORDS")
        with sqlite3.connect(":memory:") as temp:
            initialize_retention_schedule(temp,anchor=anchor,
                interval_seconds=policy["interval_seconds"],
                grace_seconds=policy["grace_seconds"])
            initialize_historical_proofs(temp)
            temp.execute("BEGIN IMMEDIATE")
            for event in events:
                if not isinstance(event,dict) or set(event)!={
                    "slot","event_json","previous_sha256","head_sha256"
                }:
                    raise ValueError("invalid event fields")
                if type(event["slot"]) is not int:
                    raise ValueError("invalid event slot")
                temp.execute("""INSERT INTO rio_v68_history
                    (slot,event_json,previous_sha256,head_sha256)
                    VALUES(?,?,?,?)""",(
                    event["slot"],event["event_json"],
                    event["previous_sha256"],event["head_sha256"]
                ))
            for proof in proofs:
                if not isinstance(proof,dict) or set(proof)!={
                    "sequence","audit_slot","evidence_json",
                    "previous_sha256","head_sha256"
                }:
                    raise ValueError("invalid evidence fields")
                if (type(proof["sequence"]) is not int
                    or type(proof["audit_slot"]) is not int):
                    raise ValueError("invalid proof position")
                temp.execute("""INSERT INTO rio_v69_historical_proofs
                    (sequence,audit_slot,evidence_json,previous_sha256,head_sha256)
                    VALUES(?,?,?,?,?)""",(
                    proof["sequence"],proof["audit_slot"],
                    proof["evidence_json"],proof["previous_sha256"],
                    proof["head_sha256"]
                ))
            audit=_scan(temp)
            signed=_proof_chain(temp,pinned_archive_keys,expected_archive_ids)
            if (audit is None or signed is None
                or (audit[0],audit[1])!=
                (independently_pinned_audit_sequence,independently_pinned_audit_head_sha256)
                or signed[:2]!=
                (independently_pinned_proof_sequence,independently_pinned_proof_head_sha256)):
                return _blocked("OFFLINE_SIGNED_HISTORY_INVALID")
            state=(BundleState.HISTORICAL_QUARANTINE if signed[3]
                   else BundleState.VERIFIED_INFORMATIONAL)
            return BundleReview(state,EXTERNAL_BLOCKERS,
                                audit[0],signed[0],digest)
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError,OverflowError,
            UnicodeDecodeError):
        return _blocked("OFFLINE_BUNDLE_VERIFICATION_FAILED")


def execution_permitted(result:BundleReview)->bool:
    return False
