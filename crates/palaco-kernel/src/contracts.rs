//! Constitutional Operational Contracts
//!
//! These traits define the interface that any Citadel, Harbor, or Quay
//! must implement to be constitutional.

use palaco_foundation::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// IdentityContract: Verify WHO is acting
///
/// Any system claiming to operate under PALACO must be able to:
/// 1. Establish an Identity
/// 2. Verify it is still valid
/// 3. Trace it back to a canonical source
/// 4. Reject unverifiable identities
pub trait IdentityContract: Send + Sync {
    /// Establish a new Identity in this realm
    fn establish_identity(
        &self,
        principal: Principal,
        realm: String,
    ) -> Result<Identity>;

    /// Verify an existing Identity is still valid
    fn verify_identity(&self, identity: &Identity) -> Result<bool>;

    /// Trace an Identity back to its root Principal
    fn trace_to_root(&self, identity: &Identity) -> Result<Principal>;

    /// List all Identities for a Principal
    fn list_identities_for(&self, principal: &Principal) -> Result<Vec<Identity>>;

    /// Revoke an Identity (must be permanent)
    fn revoke_identity(&self, identity: &Identity) -> Result<()>;
}

/// AuthorizationContract: Verify WITH WHICH AUTHORITY?
///
/// Any system claiming to operate under PALACO must enforce:
/// 1. CAPABILITY ≠ AUTHORITY (explicit grants only)
/// 2. Authority is scoped and bounded
/// 3. Authority expires and cannot be renewed retroactively
/// 4. Authority grants require evidence
pub trait AuthorizationContract: Send + Sync {
    /// Grant Authority to an Identity
    fn grant_authority(
        &self,
        principal: Principal,
        granted_by: Principal,
        scope: AuthorityScope,
        expires_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<Authority>;

    /// Verify that an Identity has Authority for an action
    fn verify_authority(
        &self,
        identity: &Identity,
        action: &str,
        resource: &str,
        scope: &AuthorityScope,
    ) -> Result<AuthorizationDecision>;

    /// Revoke Authority (permanent)
    fn revoke_authority(&self, authority_id: Uuid) -> Result<()>;

    /// List all active Authority grants
    fn list_active_authorities(&self) -> Result<Vec<Authority>>;

    /// Require: Every grant includes evidence_hash
    fn authority_requires_evidence(&self) -> bool {
        true
    }
}

/// EvidenceContract: Verify WITH WHICH EVIDENCE?
///
/// The constitutional rule:
/// **NO EVIDENCE → NO VALID ALLOW**
///
/// Any system claiming to operate under PALACO must:
/// 1. Require evidence for every security decision
/// 2. Make evidence immutable and traceable
/// 3. Support proof reconstruction (replay)
/// 4. Reject claims without evidence
pub trait EvidenceContract: Send + Sync {
    /// Record a Claim backed by Evidence
    fn claim_with_evidence(&self, claim: Claim, evidence: Evidence) -> Result<Proof>;

    /// Verify a Proof by replaying its evidence chain
    fn verify_proof(&self, proof: &Proof) -> Result<bool>;

    /// Retrieve Evidence by hash
    fn get_evidence(&self, hash: &str) -> Result<Option<Evidence>>;

    /// Retrieve all Evidence supporting a Claim
    fn get_evidence_for_claim(&self, claim_id: Uuid) -> Result<Vec<Evidence>>;

    /// Replay a Proof to reconstruct verification
    fn replay_proof(&self, proof: &Proof) -> Result<String>;

    /// Require: All evidence must be signed or authenticated
    fn evidence_requires_authentication(&self) -> bool {
        true
    }
}

/// ProvenanceContract: Verify FROM/TO WHICH STATE?
///
/// The canonical action loop requires:
/// 1. Every state change is traceable to source state
/// 2. Every transition includes justification
/// 3. History is append-only and immutable
/// 4. Transitions can be replayed to verify integrity
pub trait ProvenanceContract: Send + Sync {
    /// Record a StateTransition in the History
    fn record_transition(&self, transition: StateTransition) -> Result<()>;

    /// Retrieve a History by name
    fn get_history(&self, name: &str) -> Result<Option<History>>;

    /// Verify the integrity of a History by replay
    fn verify_history(&self, history: &History) -> Result<bool>;

    /// Get all transitions since a state hash
    fn get_transitions_since(&self, history_name: &str, state_hash: &str) -> Result<Vec<StateTransition>>;

    /// Retrieve the current canonical state
    fn get_current_state(&self, history_name: &str) -> Result<Option<String>>;

    /// Require: All transitions must include Proof
    fn transition_requires_proof(&self) -> bool {
        true
    }

    /// Require: History must always be verifiable
    fn history_must_be_verifiable(&self) -> bool {
        true
    }
}

/// ConstitutionalDecision: The outcome of a constitutional evaluation
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum ConstitutionalDecision {
    /// Action is authorized and evidence is sufficient
    Allow(String),

    /// Action is denied
    Deny(String),

    /// Action requires escalation to higher authority
    RequiresEscalation(String),

    /// Constitutional violation detected
    ViolatesConstitution(String),
}

/// ConstitutionalValidator: Checks if a decision meets constitutional requirements
pub trait ConstitutionalValidator: Send + Sync {
    /// Execute the Watermark Test on a request
    ///
    /// Returns true if all questions can be answered:
    /// - WHO?
    /// - WHAT?
    /// - WHY?
    /// - UNDER WHICH POLICY?
    /// - WITH WHICH AUTHORITY?
    /// - WITH WHICH EVIDENCE?
    /// - FROM WHICH STATE?
    /// - TO WHICH STATE?
    fn watermark_test(
        &self,
        identity: &Identity,
        action: &str,
        authority: &Authority,
        evidence: &Evidence,
        from_state: &str,
        to_state: &str,
    ) -> Result<bool>;

    /// Execute the Brainpower Test on a claim
    ///
    /// Verifies the chain: CLAIM → EVIDENCE → PROVENANCE → REPLAY → VERIFICATION
    fn brainpower_test(&self, claim: &Claim, proof: &Proof) -> Result<bool>;

    /// Check for constitutional invariant violations
    fn check_invariants(&self) -> Result<()>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_authorization_decision_variants() {
        let allow = AuthorizationDecision::Allow("User authorized".to_string());
        let deny = AuthorizationDecision::Deny("No authority".to_string());

        assert_ne!(allow, deny);
    }

    #[test]
    fn test_constitutional_decision_variants() {
        let allow = ConstitutionalDecision::Allow("Evidence sufficient".to_string());
        let escalate =
            ConstitutionalDecision::RequiresEscalation("Authority unclear".to_string());

        assert_ne!(allow, escalate);
    }
}
