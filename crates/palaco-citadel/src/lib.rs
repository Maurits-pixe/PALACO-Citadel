#![forbid(unsafe_code)]
pub mod authority;
pub mod evidence;
pub mod identity;
pub mod ledger;
pub mod provenance;
pub mod telemetry;
pub mod verification;

#[cfg(test)]
mod tests {
    use crate::identity::{CitadelId, IdentityId, IdentityRecord, HologramAsset, WatermerkAsset};
    use crate::verification::{evaluate, VerificationStatus};
    #[test]
    fn identity_assets_are_bound() -> Result<(), crate::identity::IdentifierError> {
        let id = IdentityId::new("ID-001")?;
        let citadel = CitadelId::new("LA-001")?;
        let record = IdentityRecord { identity_id: id.clone(), citadel_id: citadel.clone(),
            hologram: HologramAsset { identity_id: id.clone(), citadel_id: citadel.clone() },
            watermerk: WatermerkAsset { identity_id: id, citadel_id: citadel } };
        assert!(record.validate_binding().is_ok());
        Ok(())
    }
    #[test]
    fn unbound_watermerk_is_rejected() -> Result<(), crate::identity::IdentifierError> {
        let id = IdentityId::new("ID-001")?;
        let citadel = CitadelId::new("LA-001")?;
        let record = IdentityRecord { identity_id: id.clone(), citadel_id: citadel.clone(),
            hologram: HologramAsset { identity_id: id, citadel_id: citadel.clone() },
            watermerk: WatermerkAsset { identity_id: IdentityId::new("ID-002")?, citadel_id: citadel } };
        assert!(record.validate_binding().is_err());
        Ok(())
    }
    #[test]
    fn missing_seal_cannot_be_valid() {
        assert_eq!(evaluate(&[true, true, true, true, true, true, false, true, true]), VerificationStatus::Incomplete);
    }
}
