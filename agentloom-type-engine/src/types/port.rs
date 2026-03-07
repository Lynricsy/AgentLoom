use super::TypeSchema;
use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PortDataType {
    Model,
    Text,
    Json,
    Image,
    Audio,
    Tool,
    Sandbox,
    Knowledge,
}

impl fmt::Display for PortDataType {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let value = match self {
            Self::Model => "model",
            Self::Text => "text",
            Self::Json => "json",
            Self::Image => "image",
            Self::Audio => "audio",
            Self::Tool => "tool",
            Self::Sandbox => "sandbox",
            Self::Knowledge => "knowledge",
        };
        formatter.write_str(value)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PortDirection {
    Input,
    Output,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortDefinition {
    pub id: String,
    pub label: String,
    pub direction: PortDirection,
    pub data_type: PortDataType,
    pub description: Option<String>,
    pub required: bool,
    pub multiple: bool,
    pub max_connections: Option<u32>,
    pub schema: Option<TypeSchema>,
}
