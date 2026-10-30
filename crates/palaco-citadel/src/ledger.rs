//! In-memory candidate ledger: append-only API and replay continuity.
//! Not durable storage, cryptographic integrity, or a constitutional authority.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Transition {
    pub event_id: String,
    pub from_state: String,
    pub to_state: String,
    pub evidence_ref: String,
}
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LedgerError { MissingEvidence, EmptyField, WrongParent, DuplicateEvent, ReplayMismatch }
pub struct Ledger {
    genesis: String,
    current: String,
    events: Vec<Transition>,
}
impl Ledger {
    pub fn new(genesis: String) -> Result<Self, LedgerError> {
        if genesis.trim().is_empty() { return Err(LedgerError::EmptyField); }
        Ok(Self { current: genesis.clone(), genesis, events: Vec::new() })
    }
    pub fn append(&mut self, event: Transition) -> Result<(), LedgerError> {
        if event.event_id.trim().is_empty() || event.from_state.trim().is_empty()
            || event.to_state.trim().is_empty() { return Err(LedgerError::EmptyField); }
        if event.evidence_ref.trim().is_empty() { return Err(LedgerError::MissingEvidence); }
        if event.from_state != self.current { return Err(LedgerError::WrongParent); }
        if self.events.iter().any(|previous| previous.event_id == event.event_id) {
            return Err(LedgerError::DuplicateEvent);
        }
        self.current = event.to_state.clone();
        self.events.push(event);
        Ok(())
    }
    pub fn replay(&self) -> Result<&str, LedgerError> {
        let mut state = self.genesis.as_str();
        let mut seen = std::collections::HashSet::new();
        for event in &self.events {
            if event.from_state != state || !seen.insert(&event.event_id) {
                return Err(LedgerError::ReplayMismatch);
            }
            if event.evidence_ref.trim().is_empty() { return Err(LedgerError::MissingEvidence); }
            state = &event.to_state;
        }
        if state != self.current { return Err(LedgerError::ReplayMismatch); }
        Ok(state)
    }
    pub fn current_state(&self) -> &str { &self.current }
    pub fn len(&self) -> usize { self.events.len() }
    pub fn is_empty(&self) -> bool { self.events.is_empty() }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn event(id: &str, from: &str, to: &str) -> Transition {
        Transition { event_id: id.into(), from_state: from.into(),
            to_state: to.into(), evidence_ref: "proof-reference-not-verified".into() }
    }
    #[test] fn empty_genesis_is_rejected() {
        assert!(matches!(Ledger::new(" ".into()), Err(LedgerError::EmptyField)));
    }
    #[test] fn replay_begins_at_genesis_not_current_state() {
        let mut ledger = Ledger::new("A".into()).expect("valid genesis");
        ledger.append(event("1", "A", "B")).expect("first");
        ledger.append(event("2", "B", "C")).expect("second");
        assert_eq!(ledger.replay(), Ok("C"));
    }
    #[test] fn wrong_parent_cannot_change_state() {
        let mut ledger = Ledger::new("A".into()).expect("valid genesis");
        assert_eq!(ledger.append(event("1", "X", "B")), Err(LedgerError::WrongParent));
        assert_eq!(ledger.current_state(), "A");
        assert!(ledger.is_empty());
    }
    #[test] fn duplicate_event_is_rejected() {
        let mut ledger = Ledger::new("A".into()).expect("valid genesis");
        ledger.append(event("1", "A", "B")).expect("first");
        assert_eq!(ledger.append(event("1", "B", "C")), Err(LedgerError::DuplicateEvent));
        assert_eq!(ledger.current_state(), "B");
    }
    #[test] fn missing_evidence_cannot_be_appended() {
        let mut ledger = Ledger::new("A".into()).expect("valid genesis");
        let mut candidate = event("1", "A", "B");
        candidate.evidence_ref.clear();
        assert_eq!(ledger.append(candidate), Err(LedgerError::MissingEvidence));
        assert_eq!(ledger.current_state(), "A");
    }
}
