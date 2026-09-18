use crate::{authorization::{Authorization, AuthorizationState, ExecutionState}, event_type::EventType, provenance::Provenance, trace::TraceId};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SourceRef { pub system: String, pub connector: String, pub object_type: String, pub object_id: String }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Classification { pub domain: String, pub category: String, pub confidence: f64, pub priority: String }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Evidence { pub reference: String, pub sha256: Option<String>, pub kind: Option<String> }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProposedAction { pub action_type: String, pub destination: String, pub description: String }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EventEnvelope {
    pub event_id: String, pub event_type: EventType, pub event_version: String,
    pub source: SourceRef, pub occurred_at: String, pub received_at: String,
    pub actor: Option<String>, pub classification: Classification, pub evidence: Vec<Evidence>,
    pub context_refs: Vec<String>, pub proposed_action: Option<ProposedAction>,
    pub authorization: Authorization, pub execution: ExecutionState,
    pub provenance: Provenance, pub trace_id: TraceId, pub idempotency_key: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ExecutionState { NotStarted, Started, Completed, Failed, Blocked }

impl EventEnvelope {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.event_version != "1.0.0" { return Err("unsupported event contract version"); }
        if self.event_id.trim().is_empty() { return Err("missing event id"); }
        if self.source.object_id.trim().is_empty() { return Err("missing source object id"); }
        if !(0.0..=1.0).contains(&self.classification.confidence) { return Err("invalid confidence"); }
        if self.evidence.is_empty() { return Err("missing evidence"); }
        self.provenance.validate()
    }

    pub fn execution_gate(&self) -> Result<(), &'static str> {
        self.validate()?;
        if !self.authorization.permits_execution() { return Err("execution blocked: authorization is not GRANTED"); }
        if self.execution != ExecutionState::NotStarted { return Err("execution blocked: state is not NotStarted"); }
        Ok(())
    }

    pub fn revoke(&mut self) {
        self.authorization.state = AuthorizationState::Revoked;
        self.execution = ExecutionState::Blocked;
    }
}
