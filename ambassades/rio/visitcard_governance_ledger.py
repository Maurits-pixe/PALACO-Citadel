"""RIO v3.4 append-only governance lifecycle ledger — DRAFT / GO-13 HOLD.

An independently controlled registry of signed governance lifecycle commands.
Commands are authenticated with *separately pinned* root authority keys.
The registry never installs a signing key into any trust store and never
authorizes issuance, execution, enrollment or recovery. SQLite triggers
do not defend against privileged database rollback; retain an external head.
"""
from __future__ import annotations

import base64
from datetime import datetime,timezone
import hashlib
import json
import sqlite3
from typing import Any,Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from visitcard_witness_enrollment import _canonical

DOMAIN=b"PALACO-RIO-GOVERNANCE-LIFECYCLE-V1\x00"
ZERO="0"*64
SCHEMA="""
CREATE TABLE IF NOT EXISTS rio_governance_events (
 issuer TEXT NOT NULL,
 signer_id TEXT NOT NULL,
 sequence INTEGER NOT NULL CHECK(sequence BETWEEN 1 AND 1000000),
 kind TEXT NOT NULL CHECK(kind IN ('REGISTER','ROTATE','REVOKE')),
 old_fingerprint TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 event_json TEXT NOT NULL,
 event_sha256 TEXT NOT NULL,
 PRIMARY KEY(issuer,signer_id,sequence)
);
CREATE TABLE IF NOT EXISTS rio_governance_heads (
 issuer TEXT NOT NULL, signer_id TEXT NOT NULL,
 sequence INTEGER NOT NULL, fingerprint TEXT NOT NULL,
 revoked INTEGER NOT NULL CHECK(revoked IN (0,1)),
 event_sha256 TEXT NOT NULL,
 PRIMARY KEY(issuer,signer_id)
);
CREATE TRIGGER IF NOT EXISTS rio_governance_events_no_update
 BEFORE UPDATE ON rio_governance_events BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER IF NOT EXISTS rio_governance_events_no_delete
 BEFORE DELETE ON rio_governance_events BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER IF NOT EXISTS rio_governance_heads_no_delete
 BEFORE DELETE ON rio_governance_heads BEGIN SELECT RAISE(ABORT,'no-delete'); END;
CREATE TRIGGER IF NOT EXISTS rio_governance_heads_monotone
 BEFORE UPDATE ON rio_governance_heads
 WHEN OLD.issuer!=NEW.issuer OR OLD.signer_id!=NEW.signer_id
 OR NEW.sequence!=OLD.sequence+1 BEGIN SELECT RAISE(ABORT,'nonmonotone'); END;
"""


def initialize_governance_ledger(db:sqlite3.Connection)->None:
    if db.in_transaction:
        raise ValueError("migration in transaction")
    db.executescript(SCHEMA)


def _hex(x:Any)->bool:
    return isinstance(x,str) and len(x)==64 and all(c in "0123456789abcdef" for c in x)


def _packed(x:Any)->str:
    return json.dumps(x,sort_keys=True,separators=(",",":"),ensure_ascii=False,allow_nan=False)


def _signature(x:Any)->bytes:
    if not isinstance(x,str) or len(x)!=86:
        raise ValueError("signature")
    data=base64.urlsafe_b64decode(x+"==")
    if len(data)!=64 or base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")!=x:
        raise ValueError("noncanonical signature")
    return data


def _verify_command(event:Any, roots:Mapping[str,bytes], *, issuer:str, signer_id:str)->bool:
    try:
        if not isinstance(event,dict) or set(event)!={"payload","authority_id","signature"}:
            return False
        p=event["payload"]
        if not isinstance(p,dict) or set(p)!={
            "version","issuer","signer_id","sequence","kind",
            "old_fingerprint","fingerprint","previous_event_sha256"
        }:
            return False
        if type(p["version"]) is not int or p["version"]!=1 or p["issuer"]!=issuer or p["signer_id"]!=signer_id:
            return False
        if not isinstance(issuer,str) or not 0<len(issuer)<=128 or not isinstance(signer_id,str) or not 0<len(signer_id)<=128:
            return False
        if type(p["sequence"]) is not int or not 1<=p["sequence"]<=1000000:
            return False
        if p["kind"] not in ("REGISTER","ROTATE","REVOKE"):
            return False
        if not all(_hex(p[key]) for key in ("old_fingerprint","fingerprint","previous_event_sha256")):
            return False
        aid=event["authority_id"]
        if not isinstance(aid,str) or not 0<len(aid)<=128:
            return False
        public=roots.get(aid)
        if not isinstance(public,bytes) or len(public)!=32:
            return False
        Ed25519PublicKey.from_public_bytes(public).verify(
            _signature(event["signature"]),DOMAIN+aid.encode()+b"\x00"+_canonical(p)
        )
        return True
    except (ValueError,TypeError,KeyError,AttributeError,InvalidSignature,OverflowError):
        return False


def _replay(db:sqlite3.Connection,issuer:str,signer_id:str,roots:Mapping[str,bytes])->tuple|None:
    """Reconstruct head from signed contiguous rows; return None on corruption."""
    try:
        rows=db.execute(
            """SELECT sequence,kind,old_fingerprint,fingerprint,event_json,event_sha256
               FROM rio_governance_events WHERE issuer=? AND signer_id=?
               ORDER BY sequence""",(issuer,signer_id)
        ).fetchall()
        head=db.execute(
            """SELECT sequence,fingerprint,revoked,event_sha256
               FROM rio_governance_heads WHERE issuer=? AND signer_id=?""",
            (issuer,signer_id)
        ).fetchone()
        if not rows or head is None or len(rows)>1000000:
            return None
        previous=ZERO
        current=ZERO
        revoked=False
        for i,(seq,kind,old,fingerprint,packed,digest) in enumerate(rows,1):
            if seq!=i or not _hex(digest) or hashlib.sha256(packed.encode()).hexdigest()!=digest:
                return None
            event=json.loads(packed)
            if _packed(event)!=packed or not _verify_command(event,roots,issuer=issuer,signer_id=signer_id):
                return None
            p=event["payload"]
            if (p["sequence"],p["kind"],p["old_fingerprint"],p["fingerprint"],p["previous_event_sha256"]) != (i,kind,old,fingerprint,previous):
                return None
            if i==1:
                if kind!="REGISTER" or old!=ZERO or fingerprint==ZERO:
                    return None
            else:
                if revoked or kind=="REGISTER" or old!=current:
                    return None
                if kind=="ROTATE" and (fingerprint==current or fingerprint==ZERO):
                    return None
                if kind=="REVOKE" and fingerprint!=current:
                    return None
            current=fingerprint
            revoked=kind=="REVOKE"
            previous=digest
        expected=(len(rows),current,int(revoked),previous)
        return expected if head==expected else None
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError):
        return None


def apply_governance_event(
    db:sqlite3.Connection,event:Any,pinned_roots:Mapping[str,bytes]
)->bool:
    """Append a verified administrative event; revoked signer cannot reactivate."""
    if db.in_transaction or not isinstance(event,dict):
        return False
    try:
        p=event["payload"]
        issuer,signer=p["issuer"],p["signer_id"]
        if not _verify_command(event,pinned_roots,issuer=issuer,signer_id=signer):
            return False
        packed=_packed(event)
        if len(packed.encode())>4096:
            return False
        digest=hashlib.sha256(packed.encode()).hexdigest()
        db.execute("BEGIN IMMEDIATE")
        head=db.execute(
            "SELECT sequence,fingerprint,revoked,event_sha256 FROM rio_governance_heads WHERE issuer=? AND signer_id=?",
            (issuer,signer)
        ).fetchone()
        if head is None:
            if p["sequence"]!=1 or p["kind"]!="REGISTER" or p["old_fingerprint"]!=ZERO or p["previous_event_sha256"]!=ZERO or p["fingerprint"]==ZERO:
                db.rollback()
                return False
        else:
            if _replay(db,issuer,signer,pinned_roots) is None:
                db.rollback()
                return False
            if p["sequence"]==head[0]:
                row=db.execute(
                    "SELECT event_json FROM rio_governance_events WHERE issuer=? AND signer_id=? AND sequence=?",
                    (issuer,signer,head[0])
                ).fetchone()
                same=row is not None and row[0]==packed
                db.commit()
                return same
            if head[2] or p["sequence"]!=head[0]+1 or p["previous_event_sha256"]!=head[3] or p["old_fingerprint"]!=head[1]:
                db.rollback()
                return False
            if p["kind"]=="ROTATE":
                if p["fingerprint"] in (ZERO,head[1]):
                    db.rollback()
                    return False
            elif p["kind"]=="REVOKE":
                if p["fingerprint"]!=head[1]:
                    db.rollback()
                    return False
            else:
                db.rollback()
                return False
        db.execute(
            "INSERT INTO rio_governance_events VALUES (?,?,?,?,?,?,?,?)",
            (issuer,signer,p["sequence"],p["kind"],p["old_fingerprint"],p["fingerprint"],packed,digest)
        )
        db.execute(
            """INSERT INTO rio_governance_heads VALUES (?,?,?,?,?,?)
               ON CONFLICT(issuer,signer) DO UPDATE SET
               sequence=excluded.sequence,fingerprint=excluded.fingerprint,
               revoked=excluded.revoked,event_sha256=excluded.event_sha256""",
            (issuer,signer,p["sequence"],p["fingerprint"],int(p["kind"]=="REVOKE"),digest)
        )
        db.commit()
        return True
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError,OverflowError):
        if db.in_transaction:
            db.rollback()
        return False


def signer_is_current(
    db:sqlite3.Connection,issuer:str,signer_id:str,signer_public_key:bytes,
    pinned_roots:Mapping[str,bytes]
)->bool:
    """A current ledger match is NECESSARY but NEVER sufficient for access."""
    if db.in_transaction or not isinstance(signer_public_key,bytes) or len(signer_public_key)!=32:
        return False
    state=_replay(db,issuer,signer_id,pinned_roots)
    return bool(state is not None and state[2]==0 and
                state[1]==hashlib.sha256(signer_public_key).hexdigest())
