use serde::{Deserialize, Serialize};

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

impl std::fmt::Display for PortDataType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PortDataType::Model => write!(f, "model"),
            PortDataType::Text => write!(f, "text"),
            PortDataType::Json => write!(f, "json"),
            PortDataType::Image => write!(f, "image"),
            PortDataType::Audio => write!(f, "audio"),
            PortDataType::Tool => write!(f, "tool"),
            PortDataType::Sandbox => write!(f, "sandbox"),
            PortDataType::Knowledge => write!(f, "knowledge"),
        }
    }
}
