use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TypeConstraint {
    MinLength { min: usize },
    MaxLength { max: usize },
    Pattern { regex: String },
    Enum { values: Vec<String> },
    Range { min: Option<f64>, max: Option<f64> },
    Custom { name: String, config: Value },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstraintViolation {
    pub constraint: TypeConstraint,
    pub path: String,
    pub message: String,
}
