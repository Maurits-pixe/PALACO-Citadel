#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum VerificationStatus { Valid, Invalid, Incomplete, Revoked, Expired, Unknown }

// Contract-only completeness check. Completeness never implies validity.
// ORIGIN, ISSUER, CITADEL, IDENTITY, WATERMERK, HOLOGRAM, SEAL, PROVENANCE, VALIDITY.
pub fn evaluate(required_present: &[bool; 9]) -> VerificationStatus {
    if required_present.iter().any(|present| !present) {
        VerificationStatus::Incomplete
    } else {
        VerificationStatus::Unknown
    }
}
