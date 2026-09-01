//! Provenance Types: Canonical definitions for FROM/TO WHICH STATE?
//!
//! PALACO enforces that:
//! 1. Every state is traceable to a source state
//! 2. Every transition is justified
//! 3. History is immutable
//! 4. Replays verify transitions

use crate::evidence::Proof;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// StateTransition: A verifiable change from one state to another
///
/// Represents:
/// - FROM_STATE: Source configuration
/// - ACTION: What caused the change
/// - TO_STATE: Result configuration
/// - EVIDENCE: Justification via Proof
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StateTransition {
    /// Unique identifier
    pub id: Uuid,

    /// State before the transition (hash or ID)
    pub from_state: String,

    /// State after the transition (hash or ID)
    pub to_state: String,

    /// What action caused this transition
    pub action: String,

    /// Who initiated this transition
    pub actor: String,

    /// When the transition occurred
    pub timestamp: chrono::DateTime<chrono::Utc>,

    /// Constitutional justification
    pub justification: String,

    /// Proof backing this transition
    pub proof: Option<Proof>,

    /// Replay trace to reconstruct the transition
    pub replay_steps: Vec<String>,

    /// Is this transition verified?
    pub is_verified: bool,
}

impl StateTransition {
    /// Create a new StateTransition
    pub fn new(
        from_state: String,
        to_state: String,
        action: String,
        actor: String,
        justification: String,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            from_state,
            to_state,
            action,
            actor,
            timestamp: chrono::Utc::now(),
            justification,
            proof: None,
            replay_steps: vec![],
            is_verified: false,
        }
    }

    /// Attach a Proof to this transition
    pub fn with_proof(mut self, proof: Proof) -> Self {
        self.proof = Some(proof);
        self
    }

    /// Add a replay step
    pub fn add_replay_step(mut self, step: String) -> Self {
        self.replay_steps.push(step);
        self
    }

    /// Mark this transition as verified
    pub fn mark_verified(mut self) -> Self {
        self.is_verified = true;
        self
    }

    /// Check if this transition is fully evidenced
    pub fn is_evidenced(&self) -> bool {
        self.proof.is_some() && !self.replay_steps.is_empty()
    }

    /// Check if this transition can be safely applied
    pub fn is_safe_to_apply(&self) -> bool {
        self.is_evidenced() && self.is_verified
    }
}

/// History: An immutable chain of StateTransitions
///
/// History is the ledger of all state changes.
/// It is:
/// - Append-only (no rewrites)
/// - Fully traceable
/// - Replayable
/// - Verifiable
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct History {
    /// Unique identifier
    pub id: Uuid,

    /// Name of this history (e.g., "citadel-001-ledger")
    pub name: String,

    /// The chain of transitions
    pub transitions: Vec<StateTransition>,

    /// Current canonical state
    pub current_state: String,

    /// When this History was created
    pub created_at: chrono::DateTime<chrono::Utc>,

    /// Number of verified transitions
    pub verified_count: usize,

    /// Overall integrity status
    pub is_valid: bool,
}

impl History {
    /// Create a new History starting from an initial state
    pub fn new(name: String, initial_state: String) -> Self {
        Self {
            id: Uuid::new_v4(),
            name,
            transitions: vec![],
            current_state: initial_state,
            created_at: chrono::Utc::now(),
            verified_count: 0,
            is_valid: true,
        }
    }

    /// Append a StateTransition to this History
    ///
    /// Returns an error if the transition's `from_state` doesn't match the current state
    pub fn append(&mut self, transition: StateTransition) -> Result<(), String> {
        if transition.from_state != self.current_state {
            return Err(format!(
                "Transition from_state {} does not match current state {}",
                transition.from_state, self.current_state
            ));
        }

        if transition.is_verified {
            self.verified_count += 1;
        }

        self.current_state = transition.to_state.clone();
        self.transitions.push(transition);
        Ok(())
    }

    /// Get all transitions since a certain point
    pub fn transitions_since(&self, state_hash: &str) -> Vec<StateTransition> {
        let start_idx = self
            .transitions
            .iter()
            .position(|t| t.from_state == state_hash)
            .unwrap_or(0);

        self.transitions[start_idx..].to_vec()
    }

    /// Replay the entire history to verify integrity
    pub fn verify_replay(&self) -> Result<String, String> {
        let mut current = self.current_state.clone();

        for transition in &self.transitions {
            if transition.from_state != current {
                return Err(format!(
                    "Replay failed at transition {}: expected from_state {}, got {}",
                    transition.id, current, transition.from_state
                ));
            }

            if !transition.is_evidenced() {
                return Err(format!(
                    "Replay failed: transition {} lacks evidence",
                    transition.id
                ));
            }

            current = transition.to_state.clone();
        }

        if current != self.current_state {
            return Err(format!(
                "Replay failed: final state {} doesn't match current state {}",
                current, self.current_state
            ));
        }

        Ok(current)
    }

    /// Get the length of this History
    pub fn len(&self) -> usize {
        self.transitions.len()
    }

    /// Check if this History is empty
    pub fn is_empty(&self) -> bool {
        self.transitions.is_empty()
    }

    /// Get the verification ratio
    pub fn verification_ratio(&self) -> f64 {
        if self.transitions.is_empty() {
            return 1.0;
        }
        self.verified_count as f64 / self.transitions.len() as f64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_state_transition_creation() {
        let trans = StateTransition::new(
            "state-001".to_string(),
            "state-002".to_string(),
            "execute_action".to_string(),
            "agent-alice".to_string(),
            "Authorized under policy P1".to_string(),
        );

        assert_eq!(trans.from_state, "state-001");
        assert_eq!(trans.to_state, "state-002");
        assert!(!trans.is_verified);
    }

    #[test]
    fn test_history_append() {
        let mut history = History::new("ledger-001".to_string(), "state-001".to_string());

        let trans1 = StateTransition::new(
            "state-001".to_string(),
            "state-002".to_string(),
            "action-1".to_string(),
            "agent-a".to_string(),
            "Justified by policy".to_string(),
        );

        assert!(history.append(trans1).is_ok());
        assert_eq!(history.current_state, "state-002");
        assert_eq!(history.len(), 1);
    }

    #[test]
    fn test_history_append_mismatch() {
        let mut history = History::new("ledger-001".to_string(), "state-001".to_string());

        let trans_bad = StateTransition::new(
            "state-999".to_string(), // Wrong from_state
            "state-002".to_string(),
            "action-1".to_string(),
            "agent-a".to_string(),
            "Justified by policy".to_string(),
        );

        assert!(history.append(trans_bad).is_err());
        assert_eq!(history.current_state, "state-001"); // Unchanged
    }

    #[test]
    fn test_verification_ratio() {
        let mut history = History::new("ledger-001".to_string(), "state-001".to_string());

        let trans1 = StateTransition::new(
            "state-001".to_string(),
            "state-002".to_string(),
            "action-1".to_string(),
            "agent-a".to_string(),
            "Justified".to_string(),
        )
        .mark_verified();

        let trans2 = StateTransition::new(
            "state-002".to_string(),
            "state-003".to_string(),
            "action-2".to_string(),
            "agent-b".to_string(),
            "Justified".to_string(),
        );

        let _ = history.append(trans1);
        let _ = history.append(trans2);

        assert_eq!(history.verification_ratio(), 0.5);
    }
}
