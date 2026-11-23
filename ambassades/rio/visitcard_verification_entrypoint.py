"""PALACO RIO v3.7 — single non-authorizing consumer verification facade.

This facade is the only supported entrypoint for NEW RIO VisitCard consumers.
Earlier versions remain internal/DRAFT compatibility APIs and are NOT
automatically disabled. No signing, key enrollment, execution, deployment,
identity issuance or access authorization is performed here. GO-13 HOLD.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import sqlite3
from typing import Any, Mapping

from visitcard_highwater_governed_gate import (
    IntegratedState, verify_highwater_governed_chain,
)


@dataclass(frozen=True)
class VerifiedContext:
    """Trusted configuration provisioned out of band, never from credentials.

    All mappings must be immutable/pinned by the caller's trust management.
    This Python dataclass itself does not implement secure key provisioning.
    """
    issuer: str
    nonce: str
    witness_keys: Mapping[str, bytes]
    archive_keys: Mapping[str, bytes]
    publisher_keys: Mapping[str, bytes]
    primary_signer_keys: Mapping[str, bytes]
    secondary_signer_keys: Mapping[str, bytes]
    primary_authorities: Mapping[str, bytes]
    secondary_authorities: Mapping[str, bytes]
    lifecycle_roots: Mapping[str, bytes]
    primary_custodians: Mapping[str, bytes]
    secondary_custodians: Mapping[str, bytes]


@dataclass(frozen=True)
class ProofPackage:
    """Complete evidence envelope; intentionally has no legacy route flag."""
    publication_receipt: Any
    primary_response: Any
    primary_challenge: str
    secondary_response: Any
    secondary_challenge: str
    primary_governance: Any
    secondary_governance: Any
    primary_checkpoint: Any
    secondary_checkpoint: Any


@dataclass(frozen=True)
class VerificationResult:
    state: IntegratedState
    policy: str = "RIO-VISITCARD-V3.7-GO13-HOLD"
    can_authorize: bool = False

    @property
    def matched(self) -> bool:
        """Match means cryptographic consistency only; never authorization."""
        return self.state is IntegratedState.MATCHED_INFORMATIONAL


def verify_visitcard(
    archive_db: sqlite3.Connection,
    governance_db: sqlite3.Connection,
    custodian_db: sqlite3.Connection,
    *,
    proof: ProofPackage,
    trust: VerifiedContext,
    now: datetime | None = None,
) -> VerificationResult:
    """Only current full-chain route; missing/untrusted inputs fail closed."""
    denied=VerificationResult(IntegratedState.UNKNOWN_BLOCKED)
    if not isinstance(proof, ProofPackage) or not isinstance(trust, VerifiedContext):
        return denied
    try:
        if not all(isinstance(db,sqlite3.Connection) for db in
                   (archive_db,governance_db,custodian_db)):
            return denied
        if not isinstance(trust.issuer,str) or not trust.issuer or not isinstance(trust.nonce,str) or not trust.nonce:
            return denied
        # Fail closed for missing trust roots instead of accepting a
        # downgrade to a legacy single-witness or unsigned code path.
        keyrings=(
            trust.witness_keys,trust.archive_keys,trust.publisher_keys,
            trust.primary_signer_keys,trust.secondary_signer_keys,
            trust.primary_authorities,trust.secondary_authorities,
            trust.lifecycle_roots,trust.primary_custodians,
            trust.secondary_custodians,
        )
        if any(not isinstance(x,Mapping) or not x for x in keyrings):
            return denied
        if not isinstance(proof.primary_challenge,str) or not isinstance(proof.secondary_challenge,str):
            return denied
        if any(not isinstance(x,dict) or not x for x in (
            proof.publication_receipt,proof.primary_response,
            proof.secondary_response,proof.primary_governance,
            proof.secondary_governance,proof.primary_checkpoint,
            proof.secondary_checkpoint,
        )):
            return denied
        state=verify_highwater_governed_chain(
            archive_db,governance_db,custodian_db,
            proof.publication_receipt,
            proof.primary_response,proof.primary_challenge,
            proof.secondary_response,proof.secondary_challenge,
            proof.primary_governance,proof.secondary_governance,
            proof.primary_checkpoint,proof.secondary_checkpoint,
            issuer=trust.issuer,nonce=trust.nonce,
            witness_keys=trust.witness_keys,
            archive_keys=trust.archive_keys,
            publisher_keys=trust.publisher_keys,
            primary_signer_keys=trust.primary_signer_keys,
            secondary_signer_keys=trust.secondary_signer_keys,
            primary_authorities=trust.primary_authorities,
            secondary_authorities=trust.secondary_authorities,
            lifecycle_roots=trust.lifecycle_roots,
            primary_custodians=trust.primary_custodians,
            secondary_custodians=trust.secondary_custodians,
            now=now,
        )
        if not isinstance(state,IntegratedState):
            return denied
        return VerificationResult(state)
    except (ValueError,TypeError,KeyError,AttributeError,sqlite3.Error):
        return denied


def execution_permitted(result: VerificationResult) -> bool:
    """Evidence never conveys authority — irrespective of status."""
    return False
