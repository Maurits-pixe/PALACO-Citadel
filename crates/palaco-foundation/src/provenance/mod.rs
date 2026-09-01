//! Provenance Module: FROM/TO WHICH STATE?
//!
//! The Provenance layer answers the constitutional question:
//! > "FROM WHICH STATE? TO WHICH STATE?"
//!
//! It traces the lineage of actions, state changes, and their justifications.

pub mod types;

pub use types::{History, StateTransition};
