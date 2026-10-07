//! Fail-closed authorization boundary; no token or visual asset grants authority.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AuthorityDecision { Deny, Hold, AllowForPreviewOnly }
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AuthorityInput {
    pub authenticated: bool,
    pub scoped: bool,
    pub revoked: bool,
    pub expired: bool,
    pub temporal_uncertain: bool,
    pub evidence_verified: bool,
    pub preview_only: bool,
}
pub fn decide(input: AuthorityInput) -> AuthorityDecision {
    if input.revoked || input.expired || !input.authenticated || !input.scoped {
        AuthorityDecision::Deny
    } else if input.temporal_uncertain || !input.evidence_verified {
        AuthorityDecision::Hold
    } else if input.preview_only {
        AuthorityDecision::AllowForPreviewOnly
    } else {
        AuthorityDecision::Hold
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn candidate() -> AuthorityInput {
        AuthorityInput { authenticated: true, scoped: true, revoked: false, expired: false,
            temporal_uncertain: false, evidence_verified: true, preview_only: true }
    }
    #[test] fn preview_only_is_explicit() { assert_eq!(decide(candidate()), AuthorityDecision::AllowForPreviewOnly); }
    #[test] fn revoke_denies() { assert_eq!(decide(AuthorityInput { revoked: true, ..candidate() }), AuthorityDecision::Deny); }
    #[test] fn expired_denies() { assert_eq!(decide(AuthorityInput { expired: true, ..candidate() }), AuthorityDecision::Deny); }
    #[test] fn rollback_holds() { assert_eq!(decide(AuthorityInput { temporal_uncertain: true, ..candidate() }), AuthorityDecision::Hold); }
    #[test] fn missing_evidence_holds() { assert_eq!(decide(AuthorityInput { evidence_verified: false, ..candidate() }), AuthorityDecision::Hold); }
    #[test] fn live_mode_not_granted() { assert_eq!(decide(AuthorityInput { preview_only: false, ..candidate() }), AuthorityDecision::Hold); }
}
