use super::TypeSchema;
use serde::{Deserialize, Serialize};
use std::fmt;

/// 端口数据类型。
///
/// canonical 定义在 `@agentloom/contracts` 的 `PORT_DATA_TYPES`；本枚举为 Rust 侧镜像，
/// 新增取值必须先加到 contracts，由 contracts 的 `port-data-type.test.ts` 做机械同步校验。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PortDataType {
    Model,
    Text,
    Json,
    Array,
    Image,
    Audio,
    Tool,
    Sandbox,
    Knowledge,
    Skill,
    Agent,
    Memory,
}

impl fmt::Display for PortDataType {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let value = match self {
            Self::Model => "model",
            Self::Text => "text",
            Self::Json => "json",
            Self::Array => "array",
            Self::Image => "image",
            Self::Audio => "audio",
            Self::Tool => "tool",
            Self::Sandbox => "sandbox",
            Self::Knowledge => "knowledge",
            Self::Skill => "skill",
            Self::Agent => "agent",
            Self::Memory => "memory",
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
