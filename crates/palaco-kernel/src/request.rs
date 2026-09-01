//! Constitutional Requests
//!
//! Represents a request flowing through the Constitutional Action Loop

use palaco_foundation::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// ConstitutionalRequest: A request for action within PALACO
///
/// This is the entry point to the Constitutional Action Loop:
///
/// ```text
/// REQUEST
///    ↓
/// IDENTITY VERIFY
///    ↓
/// POLICY CHECK
///    ↓
/// WISDOM ROUTING
///    ↓
/// DECISION
///    ↓
/// AUTHORIZATION CHECK
///    ↓
/// ACTION EXECUTE
///    ↓
/// EVIDENCE RECORD
///    ↓
/// PROVENANCE TRACK
///    ↓
/// QUAY PERSIST
///    ↓
/// VERIFICATION
/// ```
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConstitutionalRequest {
    /// Unique request ID
    pub request_id: Uuid,

    /// The Actor making this request
    pub actor: Actor,

    /// The action being requested
    pub action: String,

    /// Resource the action targets
    pub resource: String,

    /// Why this action is being requested
    pub justification: String,

    /// Policy URI under which this request is made
    pub policy_uri: String,

    /// From state (required for state transitions)
    pub from_state: Option<String>,

    /// To state (required for state transitions)
    pub to_state: Option<String>,

    /// Current timestamp
    pub timestamp: chrono::DateTime<chrono::Utc>,

    /// Session ID (for tracking across systems)
    pub session_id: Uuid,

    /// Optional evidence references
    pub evidence_ids: Vec<String>,
}

impl ConstitutionalRequest {
    /// Create a new ConstitutionalRequest
    pub fn new(
        actor: Actor,
        action: String,
        resource: String,
        justification: String,
        policy_uri: String,
        session_id: Uuid,
    ) -> Self {
        Self {
            request_id: Uuid::new_v4(),
            actor,
            action,
            resource,
            justification,
            policy_uri,
            from_state: None,
            to_state: None,
            timestamp: chrono::Utc::now(),
            session_id,
            evidence_ids: vec![],
        }
    }

    /// Mark this as a state transition request
    pub fn as_state_transition(
        mut self,
        from_state: String,
        to_state: String,
    ) -> Self {
        self.from_state = Some(from_state);
        self.to_state = Some(to_state);
        self
    }

    /// Add evidence reference
    pub fn with_evidence(mut self, evidence_id: String) -> Self {
        self.evidence_ids.push(evidence_id);
        self
    }

    /// Validate that the request has all required fields for the Watermark Test
    pub fn is_complete_for_watermark_test(&self) -> bool {
        !self.action.is_empty()
            && !self.resource.is_empty()
            && !self.justification.is_empty()
            && !self.policy_uri.is_empty()
            && (self.from_state.is_some() || !self.evidence_ids.is_empty())
    }

    /// Check if this is a state transition request
    pub fn is_state_transition(&self) -> bool {
        self.from_state.is_some() && self.to_state.is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_constitutional_request_creation() {
        let principal = Principal::new_human("Alice".to_string());
        let identity = Identity::new(principal, "realm-001".to_string());
        let actor = Actor::from_identity(identity);
        let session = Uuid::new_v4();

        let req = ConstitutionalRequest::new(
            actor,
            "read".to_string(),
            "quay:log".to_string(),
            "Need to verify state".to_string(),
            "policy:verify".to_string(),
            session,
        );

        assert_eq!(req.action, "read");
        assert_eq!(req.resource, "quay:log");
        assert!(!req.is_state_transition());
    }

    #[test]
    fn test_state_transition_request() {
        let principal = Principal::new_human("Alice".to_string());
        let identity = Identity::new(principal, "realm-001".to_string());
        let actor = Actor::from_identity(identity);
        let session = Uuid::new_v4();

        let req = ConstitutionalRequest::new(
            actor,
            "transition".to_string(),
            "citadel:state".to_string(),
            "Authorized transition".to_string(),
            "policy:state-change".to_string(),
            session,
        )
        .as_state_transition("state-001".to_string(), "state-002".to_string());

        assert!(req.is_state_transition());
        assert_eq!(req.from_state, Some("state-001".to_string()));
        assert_eq!(req.to_state, Some("state-002".to_string()));
    }

    #[test]
    fn test_watermark_test_validation() {
        let principal = Principal::new_human("Alice".to_string());
        let identity = Identity::new(principal, "realm-001".to_string());
        let actor = Actor::from_identity(identity);
        let session = Uuid::new_v4();

        let req = ConstitutionalRequest::new(
            actor,
            "read".to_string(),
            "quay:log".to_string(),
            "Need to verify state".to_string(),
            "policy:verify".to_string(),
            session,
        )
        .with_evidence("hash-001".to_string());

        assert!(req.is_complete_for_watermark_test());
    }
}
