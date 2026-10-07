#![forbid(unsafe_code)]
pub mod identity;
pub mod verification;

#[cfg(test)]
mod tests {
    use crate::identity::{CitadelId, IdentityId, IdentityRecord, HologramAsset, WatermerkAsset};
    use crate::verification::{evaluate, VerificationStatus};
    #[test]
    fn identity_assets_are_bound() {
        let id = IdentityId::new("ID-001").expect("valid ID");
        let citadel = CitadelId::new("LA-001").expect("valid citadel");
        let record = IdentityRecord { identity_id: id.clone(), citadel_id: citadel.clone(),
            hologram: HologramAsset { identity_id: id.clone(), citadel_id: citadel.clone() },
            watermerk: WatermerkAsset { identity_id: id, citadel_id: citadel } };
        assert!(record.validate_binding().is_ok());
    }
    #[test]
    fn unbound_watermerk_is_rejected() {
        let id = IdentityId::new("ID-001").expect("valid ID");
        let citadel = CitadelId::new("LA-001").expect("valid citadel");
        let record = IdentityRecord { identity_id: id.clone(), citadel_id: citadel.clone(),
            hologram: HologramAsset { identity_id: id, citadel_id: citadel.clone() },
            watermerk: WatermerkAsset { identity_id: IdentityId::new("ID-002").expect("valid ID"), citadel_id: citadel } };
        assert!(record.validate_binding().is_err());
    }
    #[test]
    fn missing_seal_cannot_be_valid() {
        assert_eq!(evaluate(&[true, true, true, true, true, true, false, true, true]), VerificationStatus::Incomplete);
    }
}
