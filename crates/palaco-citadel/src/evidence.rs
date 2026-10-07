//! Evidence references are claims until independently checked.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvidenceReference {
    pub source_id: String,
    pub digest: String,
    pub issuer: String,
}
impl EvidenceReference {
    pub fn is_well_formed(&self) -> bool {
        !self.source_id.trim().is_empty() && !self.digest.trim().is_empty()
            && !self.issuer.trim().is_empty()
    }
}
