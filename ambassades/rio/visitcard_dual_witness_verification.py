"""RIO v3.2 two-witness freshness agreement — DRAFT / GO-13 HOLD.

This is an offline verification contract, not evidence of operationally
independent hosts. Two pinned and *distinct* Ed25519 keys must sign fresh
answers to different random challenges and agree with the same independently
signed publication receipt and audited local archive. No recovery, issuance,
registration, key activation, access rights or automatic delegation.
"""
from __future__ import annotations

from datetime import datetime
import sqlite3
from typing import Any, Mapping

from visitcard_fresh_publication_head import verify_fresh_head, _decode
from visitcard_governance_attestation import verify_governance_separation
from visitcard_governance_ledger import signer_is_current
from visitcard_integrated_verification import (
    IntegratedState, verify_integrated_chain,
)


def verify_dual_witness_chain(
    archive_db: sqlite3.Connection,
    publication_receipt: Any,
    primary_response: Any,
    primary_challenge: str,
    secondary_response: Any,
    secondary_challenge: str,
    *,
    issuer: str,
    nonce: str,
    witness_keys: Mapping[str, bytes],
    archive_keys: Mapping[str, bytes],
    publisher_keys: Mapping[str, bytes],
    primary_signer_keys: Mapping[str, bytes],
    secondary_signer_keys: Mapping[str, bytes],
    now: datetime | None = None,
) -> IntegratedState:
    """Classify only after verifying TWO distinct trusted fresh signers.

    Separate challenge values prevent reusing one signed response in both
    witness roles. Separate pinned key bytes prevent pretending one key is
    two witnesses merely by supplying different signer labels. Real host,
    operator and key custody independence must be audited outside this code.
    """
    unknown = IntegratedState.UNKNOWN_BLOCKED
    try:
        if archive_db.in_transaction:
            return unknown
        if primary_challenge == secondary_challenge:
            return unknown
        _decode(primary_challenge, 32)
        _decode(secondary_challenge, 32)
        if not isinstance(primary_response,dict) or not isinstance(secondary_response,dict):
            return unknown
        primary_id=primary_response.get("signer_id")
        secondary_id=secondary_response.get("signer_id")
        if not isinstance(primary_id,str) or not isinstance(secondary_id,str):
            return unknown
        if primary_id==secondary_id:
            return unknown
        primary_key=primary_signer_keys.get(primary_id)
        secondary_key=secondary_signer_keys.get(secondary_id)
        if (not isinstance(primary_key,bytes) or len(primary_key)!=32 or
            not isinstance(secondary_key,bytes) or len(secondary_key)!=32 or
            primary_key==secondary_key):
            return unknown
        first=verify_fresh_head(
            primary_response,primary_signer_keys,issuer=issuer,nonce=nonce,
            expected_challenge=primary_challenge,now=now
        )
        second=verify_fresh_head(
            secondary_response,secondary_signer_keys,issuer=issuer,nonce=nonce,
            expected_challenge=secondary_challenge,now=now
        )
        if first is None or second is None:
            return unknown
        if first[0]!=second[0]:
            return unknown  # replication delay; no trusted fork determination
        if first[1]!=second[1]:
            return IntegratedState.FORK_BLOCKED
        # Existing integrated verifier checks published receipt signature,
        # full archive witness/seal chain, and the first fresh signature.
        result=verify_integrated_chain(
            archive_db,publication_receipt,primary_response,primary_challenge,
            issuer=issuer,nonce=nonce,witness_keys=witness_keys,
            archive_keys=archive_keys,publisher_keys=publisher_keys,
            fresh_signer_keys=primary_signer_keys,now=now
        )
        return result
    except (ValueError,TypeError,KeyError,AttributeError,sqlite3.Error):
        return unknown


def execution_permitted(status: IntegratedState) -> bool:
    """Every verification result remains informational; GO-13 HOLD."""
    return False


def verify_governed_dual_witness_chain(
    archive_db: sqlite3.Connection,
    publication_receipt: Any,
    primary_response: Any,
    primary_challenge: str,
    secondary_response: Any,
    secondary_challenge: str,
    primary_governance: Any,
    secondary_governance: Any,
    *,
    issuer: str, nonce: str,
    witness_keys: Mapping[str,bytes],
    archive_keys: Mapping[str,bytes],
    publisher_keys: Mapping[str,bytes],
    primary_signer_keys: Mapping[str,bytes],
    secondary_signer_keys: Mapping[str,bytes],
    primary_authorities: Mapping[str,bytes],
    secondary_authorities: Mapping[str,bytes],
    now: datetime | None = None,
) -> IntegratedState:
    """v3.3 separate signed governance claim gate; NEVER authorization."""
    unknown=IntegratedState.UNKNOWN_BLOCKED
    try:
        if not isinstance(primary_response,dict) or not isinstance(secondary_response,dict):
            return unknown
        first_id=primary_response.get("signer_id")
        second_id=secondary_response.get("signer_id")
        if not isinstance(first_id,str) or not isinstance(second_id,str):
            return unknown
        key_a=primary_signer_keys.get(first_id)
        key_b=secondary_signer_keys.get(second_id)
        if not verify_governance_separation(
            primary_governance,secondary_governance,
            primary_authorities,secondary_authorities,
            expected_issuer=issuer,primary_signer_id=first_id,
            secondary_signer_id=second_id,
            primary_public_key=key_a,secondary_public_key=key_b,now=now,
        ):
            return unknown
        return verify_dual_witness_chain(
            archive_db,publication_receipt,
            primary_response,primary_challenge,
            secondary_response,secondary_challenge,
            issuer=issuer,nonce=nonce,
            witness_keys=witness_keys,archive_keys=archive_keys,
            publisher_keys=publisher_keys,
            primary_signer_keys=primary_signer_keys,
            secondary_signer_keys=secondary_signer_keys,now=now
        )
    except (ValueError,TypeError,KeyError,AttributeError,sqlite3.Error):
        return unknown


def verify_lifecycle_governed_chain(
    archive_db: sqlite3.Connection,
    governance_db: sqlite3.Connection,
    publication_receipt: Any,
    primary_response: Any,
    primary_challenge: str,
    secondary_response: Any,
    secondary_challenge: str,
    primary_governance: Any,
    secondary_governance: Any,
    *,
    issuer: str, nonce: str,
    witness_keys: Mapping[str,bytes],
    archive_keys: Mapping[str,bytes],
    publisher_keys: Mapping[str,bytes],
    primary_signer_keys: Mapping[str,bytes],
    secondary_signer_keys: Mapping[str,bytes],
    primary_authorities: Mapping[str,bytes],
    secondary_authorities: Mapping[str,bytes],
    lifecycle_roots: Mapping[str,bytes],
    now: datetime | None = None,
) -> IntegratedState:
    """v3.4 fail closed on stale/rotated/revoked keys before v3.3 checks.

    The ledger is independently provisioned and externally pinned; this
    read-only method never grants execution or changes trust configuration.
    """
    unknown=IntegratedState.UNKNOWN_BLOCKED
    try:
        if archive_db is governance_db or governance_db.in_transaction:
            return unknown
        if not isinstance(primary_response,dict) or not isinstance(secondary_response,dict):
            return unknown
        first_id=primary_response.get("signer_id")
        second_id=secondary_response.get("signer_id")
        if not isinstance(first_id,str) or not isinstance(second_id,str):
            return unknown
        key_a=primary_signer_keys.get(first_id)
        key_b=secondary_signer_keys.get(second_id)
        if not signer_is_current(governance_db,issuer,first_id,key_a,lifecycle_roots):
            return unknown
        if not signer_is_current(governance_db,issuer,second_id,key_b,lifecycle_roots):
            return unknown
        return verify_governed_dual_witness_chain(
            archive_db,publication_receipt,
            primary_response,primary_challenge,
            secondary_response,secondary_challenge,
            primary_governance,secondary_governance,
            issuer=issuer,nonce=nonce,witness_keys=witness_keys,
            archive_keys=archive_keys,publisher_keys=publisher_keys,
            primary_signer_keys=primary_signer_keys,
            secondary_signer_keys=secondary_signer_keys,
            primary_authorities=primary_authorities,
            secondary_authorities=secondary_authorities,now=now
        )
    except (sqlite3.Error,ValueError,TypeError,KeyError,AttributeError):
        return unknown
