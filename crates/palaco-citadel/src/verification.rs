//! Contract-level verification. Completeness is not cryptographic verification.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum VerificationStatus {
    Valid,
    Invalid,
    Incomplete,
    Revoked,
    Expired,
    Unknown,
}

/// ORIGIN, ISSUER, CITADEL, IDENTITY, WATERMERK, HOLOGRAM, SEAL, PROVENANCE, VALIDITY.
pub fn evaluate(required_present: &[bool; 9]) -> VerificationStatus {
    if required_present.iter().all(|present| *present) {
        VerificationStatus::Unknown
    } else {
        VerificationStatus::Incomplete
    }
}

/// Denial conditions are terminal for this evaluation; completeness is never a grant.
pub fn evaluate_state(
    required_present: &[bool; 9],
    revoked: bool,
    expired: bool,
) -> VerificationStatus {
    if revoked {
        VerificationStatus::Revoked
    } else if expired {
        VerificationStatus::Expired
    } else {
        evaluate(required_present)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn complete_fields_do_not_imply_validity() {
        assert_eq!(evaluate(&[true; 9]), VerificationStatus::Unknown);
    }

    #[test]
    fn every_missing_field_is_incomplete() {
        for missing in 0..9 {
            let mut fields = [true; 9];
            fields[missing] = false;
            assert_eq!(evaluate(&fields), VerificationStatus::Incomplete);
        }
    }

    #[test]
    fn revocation_precedes_completeness() {
        assert_eq!(evaluate_state(&[true; 9], true, false), VerificationStatus::Revoked);
    }

    #[test]
    fn expiration_precedes_completeness() {
        assert_eq!(evaluate_state(&[true; 9], false, true), VerificationStatus::Expired);
    }

    #[test]
    fn revocation_precedes_expiration() {
        assert_eq!(evaluate_state(&[true; 9], true, true), VerificationStatus::Revoked);
    }
}
