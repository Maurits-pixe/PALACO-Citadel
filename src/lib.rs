#![forbid(unsafe_code)]
#![deny(unused_unsafe, todo)]

//! PALACO Citadel — Constitutional Engineering Infrastructure for the Autonomous Era
//!
//! This is the root library re-exporting core types from Foundation and Kernel layers.

pub use palaco_foundation;
pub use palaco_kernel;

// Re-export key Foundation types
pub use palaco_foundation::{
    authority::{Authority, AuthorityScope, Permission},
    common::errors::{FoundationError, Result},
    evidence::{Claim, Evidence, Proof},
    identity::{Actor, Agent, Identity, Principal},
    provenance::{History, StateTransition},
};

// Re-export key Kernel types
pub use palaco_kernel::{
    contracts::{
        AuthorizationContract, ConstitutionalDecision, ConstitutionalValidator,
        EvidenceContract, IdentityContract, ProvenanceContract,
    },
    request::ConstitutionalRequest,
    response::{ConstitutionalResponse, WatermarkResults},
};

/// PALACO Citadel Version
pub const CITADEL_VERSION: &str = "0.1.0-alpha";

/// Core constitutional invariants
pub const INVARIANTS: &[&str] = &[
    "CAPABILITY ≠ AUTHORITY",
    "AUTONOMY ≠ SOVEREIGNTY",
    "ALLOW WITHOUT EVIDENCE = INVALID",
    "CONSENSUS ≠ TRUTH",
    "CANONICAL ≠ INFALLIBLE",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_versions_match() {
        assert_eq!(palaco_foundation::FOUNDATION_VERSION, "0.1.0-alpha");
        assert_eq!(CITADEL_VERSION, "0.1.0-alpha");
    }

    #[test]
    fn test_invariants_defined() {
        assert_eq!(INVARIANTS.len(), 5);
        assert!(INVARIANTS.contains(&"CAPABILITY ≠ AUTHORITY"));
    }
}
