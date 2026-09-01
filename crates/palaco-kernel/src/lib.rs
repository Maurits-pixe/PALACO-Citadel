//! Kernel Contracts: Constitutional Operational Interfaces
//!
//! The Kernel layer defines the interfaces and contracts that all higher layers
//! must implement to remain constitutional.
//!
//! These contracts answer the fundamental question:
//! > "How do we operationalize the constitutional principles?"
//!
//! The four cornerstones of the Kernel:
//!
//! 1. **IdentityContract** — How do we verify WHO?
//! 2. **AuthorizationContract** — How do we verify WITH WHICH AUTHORITY?
//! 3. **EvidenceContract** — How do we satisfy WITH WHICH EVIDENCE?
//! 4. **ProvenanceContract** — How do we verify FROM/TO WHICH STATE?

pub mod contracts;
pub mod request;
pub mod response;

pub use contracts::{
    AuthorizationContract, EvidenceContract, IdentityContract, ProvenanceContract,
};
pub use request::ConstitutionalRequest;
pub use response::ConstitutionalResponse;
