#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IdentityId(String);
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CitadelId(String);
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum IdentifierError { Empty, InvalidCharacters, BindingMismatch }

fn validate(raw: &str) -> Result<String, IdentifierError> {
    if raw.is_empty() { return Err(IdentifierError::Empty); }
    if !raw.bytes().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'-') {
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
