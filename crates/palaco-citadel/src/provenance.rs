//! Minimum complete provenance record for a candidate; not a cryptographic proof.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProvenanceRecord {
    pub origin: String,
    pub issuer: String,
    pub subject: String,
    pub citadel_id: String,
    pub event_id: String,
    pub source_hash: String,
    pub version: String,
    pub recorded_at: String,
}
impl ProvenanceRecord {
    pub fn is_complete(&self) -> bool {
        [&self.origin, &self.issuer, &self.subject, &self.citadel_id,
         &self.event_id, &self.source_hash, &self.version, &self.recorded_at]
            .iter().all(|field| !field.trim().is_empty())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn missing_origin_fails_closed() {
        let record = ProvenanceRecord { origin: String::new(), issuer: "HQ".into(),
            subject: "LA-001".into(), citadel_id: "LA-001".into(),
            event_id: "EV-001".into(), source_hash: "sha256:example".into(),
            version: "0.1".into(), recorded_at: "2026-10-08".into() };
        assert!(!record.is_complete());
    }
}
