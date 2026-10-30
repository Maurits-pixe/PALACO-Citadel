//! Strict, bounded identifiers. Identity binding is not authentication.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IdentityId(String);
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CitadelId(String);
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum IdentifierError { Empty, InvalidCharacters, BindingMismatch, TooLong }

fn validate(raw: &str) -> Result<String, IdentifierError> {
    if raw.is_empty() { return Err(IdentifierError::Empty); }
    if raw.len() > 128 { return Err(IdentifierError::TooLong); }
    let bytes = raw.as_bytes();
    if !bytes[0].is_ascii_uppercase()
        || !bytes[bytes.len() - 1].is_ascii_alphanumeric()
        || !bytes.iter().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || *b == b'-')
        || bytes.windows(2).any(|pair| pair == b"--")
    {
        return Err(IdentifierError::InvalidCharacters);
    }
    Ok(raw.to_owned())
}
impl IdentityId {
    pub fn new(raw: &str) -> Result<Self, IdentifierError> { validate(raw).map(Self) }
}
impl CitadelId {
    pub fn new(raw: &str) -> Result<Self, IdentifierError> { validate(raw).map(Self) }
}
pub struct HologramAsset { pub identity_id: IdentityId, pub citadel_id: CitadelId }
pub struct WatermerkAsset { pub identity_id: IdentityId, pub citadel_id: CitadelId }
pub struct IdentityRecord {
    pub identity_id: IdentityId,
    pub citadel_id: CitadelId,
    pub hologram: HologramAsset,
    pub watermerk: WatermerkAsset,
}
impl IdentityRecord {
    pub fn validate_binding(&self) -> Result<(), IdentifierError> {
        if self.hologram.identity_id != self.identity_id ||
           self.watermerk.identity_id != self.identity_id ||
           self.hologram.citadel_id != self.citadel_id ||
           self.watermerk.citadel_id != self.citadel_id {
            return Err(IdentifierError::BindingMismatch);
        }
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn malformed_identifiers_are_rejected() {
        for raw in ["", "-", "A-", "-A", "A--B", "a-b", "A B", "A/B", "Ä"] {
            assert!(IdentityId::new(raw).is_err(), "accepted invalid identifier: {raw}");
        }
    }
    #[test]
    fn overlong_identifiers_are_rejected() {
        assert_eq!(IdentityId::new(&"A".repeat(129)), Err(IdentifierError::TooLong));
    }
    #[test]
    fn valid_identifiers_remain_supported() {
        assert!(IdentityId::new("ID-001").is_ok());
        assert!(CitadelId::new("LA-001").is_ok());
    }
}
