//! Constitutional Responses
//!
//! Represents the response flowing back from a ConstitutionalRequest

use crate::contracts::ConstitutionalDecision;
use palaco_foundation::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// ConstitutionalResponse: The result of a Constitutional Action Loop evaluation
///
/// Every response must include:
/// - Decision (Allow, Deny, Escalate, or Violation)
/// - Evidence supporting the decision
/// - Proof that can be replayed
/// - Traceability back to the request
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConstitutionalResponse {
    /// Unique response ID
    pub response_id: Uuid,

    /// Link back to the request
    pub request_id: Uuid,

    /// The constitutional decision
    pub decision: ConstitutionalDecision,

    /// Evidence supporting this decision
    pub evidence: Option<Evidence>,

    /// Proof of the decision (for replay)
    pub proof: Option<Proof>,

    /// Timestamp of decision
    pub timestamp: chrono::DateTime<chrono::Utc>,

    /// If this is a state transition, the resulting History entry
    pub state_transition: Option<StateTransition>,

    /// Message explaining the decision
    pub message: String,

    /// Whether this decision is verifiable
    pub is_verifiable: bool,

    /// Watermark test results (all eight questions)
    pub watermark_results: WatermarkResults,
}

/// Results of the Watermark Test
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WatermarkResults {
    pub who: bool,           // Identity established
    pub what: bool,          // Action clear
    pub why: bool,           // Justification clear
    pub policy: bool,        // Policy referenced
    pub authority: bool,     // Authority verified
    pub evidence: bool,      // Evidence present
    pub from_state: bool,    // From state known (or N/A)
    pub to_state: bool,      // To state known (or N/A)
}

impl WatermarkResults {
    /// Check if all Watermark questions were answered
    pub fn all_answered(&self) -> bool {
        self.who
            && self.what
            && self.why
            && self.policy
            && self.authority
            && self.evidence
            && (self.from_state || self.to_state)
    }
}

impl ConstitutionalResponse {
    /// Create an Allow response
    pub fn allow(
        request_id: Uuid,
        message: String,
        watermark: WatermarkResults,
    ) -> Self {
        Self {
            response_id: Uuid::new_v4(),
            request_id,
            decision: ConstitutionalDecision::Allow(message.clone()),
            evidence: None,
            proof: None,
            timestamp: chrono::Utc::now(),
            state_transition: None,
            message,
            is_verifiable: watermark.all_answered(),
            watermark_results: watermark,
        }
    }

    /// Create a Deny response
    pub fn deny(request_id: Uuid, reason: String) -> Self {
        Self {
            response_id: Uuid::new_v4(),
            request_id,
            decision: ConstitutionalDecision::Deny(reason.clone()),
            evidence: None,
            proof: None,
            timestamp: chrono::Utc::now(),
            state_transition: None,
            message: reason,
            is_verifiable: true,
            watermark_results: WatermarkResults {
                who: false,
                what: false,
                why: false,
                policy: false,
                authority: false,
                evidence: false,
                from_state: false,
                to_state: false,
            },
        }
    }

    /// Create an Escalation response
    pub fn escalate(request_id: Uuid, reason: String) -> Self {
        Self {
            response_id: Uuid::new_v4(),
            request_id,
            decision: ConstitutionalDecision::RequiresEscalation(reason.clone()),
            evidence: None,
            proof: None,
            timestamp: chrono::Utc::now(),
            state_transition: None,
            message: reason,
            is_verifiable: false,
            watermark_results: WatermarkResults {
                who: false,
                what: false,
                why: false,
                policy: false,
                authority: false,
                evidence: false,
                from_state: false,
                to_state: false,
            },
        }
    }

    /// Attach evidence to this response
    pub fn with_evidence(mut self, evidence: Evidence) -> Self {
        self.evidence = Some(evidence);
        self
    }

    /// Attach proof to this response
    pub fn with_proof(mut self, proof: Proof) -> Self {
        self.is_verifiable = proof.status == palaco_foundation::proof::ProofStatus::Verified;
        self.proof = Some(proof);
        self
    }

    /// Attach a state transition
    pub fn with_state_transition(mut self, transition: StateTransition) -> Self {
        self.state_transition = Some(transition);
        self
    }

    /// Check if this response is fully evidenced
    pub fn is_evidenced(&self) -> bool {
        self.evidence.is_some() && self.proof.is_some()
    }

    /// Check if this decision permits action
    pub fn permits_action(&self) -> bool {
        matches!(self.decision, ConstitutionalDecision::Allow(_))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_watermark_results_complete() {
        let results = WatermarkResults {
            who: true,
            what: true,
            why: true,
            policy: true,
            authority: true,
            evidence: true,
            from_state: true,
            to_state: true,
        };

        assert!(results.all_answered());
    }

    #[test]
    fn test_watermark_results_incomplete() {
        let results = WatermarkResults {
            who: true,
            what: true,
            why: false,
            policy: true,
            authority: true,
            evidence: true,
            from_state: true,
            to_state: true,
        };

        assert!(!results.all_answered());
    }

    #[test]
    fn test_allow_response() {
        let request_id = Uuid::new_v4();
        let watermark = WatermarkResults {
            who: true,
            what: true,
            why: true,
            policy: true,
            authority: true,
            evidence: true,
            from_state: true,
            to_state: true,
        };

        let resp = ConstitutionalResponse::allow(
            request_id,
            "Action authorized".to_string(),
            watermark,
        );

        assert!(resp.permits_action());
        assert!(resp.is_verifiable);
    }

    #[test]
    fn test_deny_response() {
        let request_id = Uuid::new_v4();
        let resp = ConstitutionalResponse::deny(request_id, "No authority".to_string());

        assert!(!resp.permits_action());
        assert!(resp.is_verifiable);
    }
}
