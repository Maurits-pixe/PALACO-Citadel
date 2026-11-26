"""RIO v3.6 end-to-end signed governance high-water gate — DRAFT / GO-13 HOLD.

Read only. Requires two independently retained, current, pinned-custodian
checkpoints that match audited custodian ledgers and the signed lifecycle
ledger before v3.4's governed dual-witness checks. All states informational.
Separate SQLite connections cannot establish operational independence.
"""
from __future__ import annotations

from datetime import datetime
import sqlite3
from typing import Any, Mapping

from visitcard_dual_witness_verification import (
    IntegratedState, verify_lifecycle_governed_chain,
)
from visitcard_governance_highwater import (
    GovernanceRestore, audit_highwater_custodian,
    compare_restored_governance, verify_governance_checkpoint,
)
from visitcard_governance_ledger import _packed


def verify_highwater_governed_chain(
    archive_db: sqlite3.Connection,
    governance_db: sqlite3.Connection,
    custodian_db: sqlite3.Connection,
    publication_receipt: Any,
    primary_response: Any,
    primary_challenge: str,
    secondary_response: Any,
    secondary_challenge: str,
    primary_governance: Any,
    secondary_governance: Any,
    primary_checkpoint: Any,
    secondary_checkpoint: Any,
    *,
    issuer: str,
    nonce: str,
    witness_keys: Mapping[str, bytes],
    archive_keys: Mapping[str, bytes],
    publisher_keys: Mapping[str, bytes],
    primary_signer_keys: Mapping[str, bytes],
    secondary_signer_keys: Mapping[str, bytes],
    primary_authorities: Mapping[str, bytes],
    secondary_authorities: Mapping[str, bytes],
    lifecycle_roots: Mapping[str, bytes],
    primary_custodians: Mapping[str, bytes],
    secondary_custodians: Mapping[str, bytes],
    now: datetime | None = None,
) -> IntegratedState:
    """v3.6: verify each external highest head before trusting local lifecycle.

    Caller must independently obtain and retain the true latest checkpoint.
    A rollback of both the local and *all* checkpoint copies remains
    undetectable; no key enrollment, replay, release or access is authorized.
    """
    unknown=IntegratedState.UNKNOWN_BLOCKED
    try:
        databases=(archive_db,governance_db,custodian_db)
        if len({id(db) for db in databases})!=3 or any(db.in_transaction for db in databases):
            return unknown
        if (not isinstance(primary_response,dict) or
            not isinstance(secondary_response,dict)):
            return unknown
        a_id=primary_response.get("signer_id")
        b_id=secondary_response.get("signer_id")
        if not isinstance(a_id,str) or not isinstance(b_id,str) or a_id==b_id:
            return unknown
        a_key=primary_signer_keys.get(a_id)
        b_key=secondary_signer_keys.get(b_id)
        if (not isinstance(a_key,bytes) or not isinstance(b_key,bytes) or
            len(a_key)!=32 or len(b_key)!=32 or a_key==b_key):
            return unknown

        # Require two distinct checkpoint signing identities and key bytes.
        if not isinstance(primary_checkpoint,dict) or not isinstance(secondary_checkpoint,dict):
            return unknown
        ca=primary_checkpoint.get("custodian_id")
        cb=secondary_checkpoint.get("custodian_id")
        if not isinstance(ca,str) or not isinstance(cb,str) or ca==cb:
            return unknown
        ka=primary_custodians.get(ca)
        kb=secondary_custodians.get(cb)
        if (not isinstance(ka,bytes) or not isinstance(kb,bytes) or
            len(ka)!=32 or len(kb)!=32 or ka==kb):
            return unknown

        for signer,public,checkpoint,trust in (
            (a_id,a_key,primary_checkpoint,primary_custodians),
            (b_id,b_key,secondary_checkpoint,secondary_custodians),
        ):
            pinned=verify_governance_checkpoint(
                checkpoint,trust,issuer=issuer,signer_id=signer,
            )
            if pinned is None:
                return unknown
            # Require the externally supplied checkpoint to equal the
            # separately stored *latest* audited custodian head, not just
            # a valid historical signed record.
            if not audit_highwater_custodian(custodian_db,issuer,signer,trust):
                return unknown
            row=custodian_db.execute(
                """SELECT sequence,fingerprint,revoked,event_sha256,checkpoint_json
                   FROM rio_governance_highwater
                   WHERE issuer=? AND signer_id=?""",
                (issuer,signer),
            ).fetchone()
            if row is None or row[:4]!=pinned or row[4]!=_packed(checkpoint):
                return unknown
            state=compare_restored_governance(
                governance_db,checkpoint,trust,lifecycle_roots,
                issuer=issuer,signer_id=signer,
            )
            if state!=GovernanceRestore.MATCHED_INFORMATIONAL:
                return unknown
            if pinned[2]!=0:
                return unknown
            import hashlib
            if pinned[1]!=hashlib.sha256(public).hexdigest():
                return unknown

        # Once both signed high-water checks match, apply the existing
        # full governance, freshness, publication and archived-proof gate.
        return verify_lifecycle_governed_chain(
            archive_db,governance_db,publication_receipt,
            primary_response,primary_challenge,
            secondary_response,secondary_challenge,
            primary_governance,secondary_governance,
            issuer=issuer,nonce=nonce,
            witness_keys=witness_keys,archive_keys=archive_keys,
            publisher_keys=publisher_keys,
            primary_signer_keys=primary_signer_keys,
            secondary_signer_keys=secondary_signer_keys,
            primary_authorities=primary_authorities,
            secondary_authorities=secondary_authorities,
            lifecycle_roots=lifecycle_roots,now=now,
        )
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError):
        return unknown


def execution_permitted(state: IntegratedState) -> bool:
    """Never grant recovery, issuance, registration or access from evidence."""
    return False
