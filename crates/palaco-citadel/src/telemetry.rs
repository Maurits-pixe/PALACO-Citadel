//! Read-only presentation snapshot; not a decision engine.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DisplayStatus { Unknown, Incomplete, Blocked, PreviewOnly }
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TelemetrySnapshot {
    pub subject: String,
    pub status: DisplayStatus,
    pub source: Option<String>,
}
