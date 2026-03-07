use serde::{Deserialize, Serialize};

use super::port_data_type::PortDataType;
use super::type_schema::TypeSchema;

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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub required: bool,
    pub multiple: bool,
    pub max_connections: Option<u32>,
    pub schema: TypeSchema,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ScalarTypeSchema;

    #[test]
    fn test_port_definition_roundtrip() {
        let port = PortDefinition {
            id: "output-text".to_string(),
            label: "Output Text".to_string(),
            direction: PortDirection::Output,
            data_type: PortDataType::Text,
            description: Some("Generated text output".to_string()),
            required: true,
            multiple: false,
            max_connections: Some(1),
            schema: TypeSchema::Scalar(ScalarTypeSchema {
                kind: PortDataType::Text,
                format: None,
                examples: None,
                title: None,
                description: None,
                nullable: None,
            }),
        };

        let json = serde_json::to_string(&port).expect("serialize");
        let parsed: PortDefinition = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(port, parsed);
    }

    #[test]
    fn test_port_definition_camel_case() {
        let port = PortDefinition {
            id: "test".to_string(),
            label: "Test".to_string(),
            direction: PortDirection::Input,
            data_type: PortDataType::Json,
            description: None,
            required: false,
            multiple: true,
            max_connections: None,
            schema: TypeSchema::Scalar(ScalarTypeSchema {
                kind: PortDataType::Json,
                format: None,
                examples: None,
                title: None,
                description: None,
                nullable: None,
            }),
        };

        let json = serde_json::to_string(&port).expect("serialize");
        assert!(json.contains("\"dataType\""));
        assert!(json.contains("\"maxConnections\""));
        assert!(!json.contains("\"data_type\""));
        assert!(!json.contains("\"max_connections\""));
    }
}
