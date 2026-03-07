use serde::{Deserialize, Serialize};

use super::port_data_type::PortDataType;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum TypeConstraint {
    #[serde(rename_all = "camelCase")]
    RequiredKind { kind: PortDataType },
    #[serde(rename_all = "camelCase")]
    RequiredField { field_name: String },
    #[serde(rename_all = "camelCase")]
    RequiredShape { shape: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstraintViolation {
    pub constraint: TypeConstraint,
    pub path: String,
    pub message: String,
}
