use std::collections::HashMap;

use serde::de::Deserializer;
use serde::ser::Serializer;
use serde::{Deserialize, Serialize};

use super::port_data_type::PortDataType;

/// Two-level tagged union: kind + shape discriminators
///
/// Scalar: kind != "json"
/// Object: kind == "json", shape == "object"
/// Array:  kind == "json", shape == "array"
#[derive(Debug, Clone, PartialEq)]
pub enum TypeSchema {
    /// 标量类型 (kind != "json")
    Scalar(ScalarTypeSchema),
    /// 对象类型 (kind == "json", shape == "object")
    Object(ObjectTypeSchema),
    /// 数组类型 (kind == "json", shape == "array")
    Array(ArrayTypeSchema),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScalarTypeSchema {
    pub kind: PortDataType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub examples: Option<Vec<serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nullable: Option<bool>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ObjectTypeSchema {
    pub properties: HashMap<String, TypeSchema>,
    pub required: Option<Vec<String>>,
    pub additional_properties: Option<bool>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub nullable: Option<bool>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ArrayTypeSchema {
    pub items: Box<TypeSchema>,
    pub min_items: Option<u32>,
    pub max_items: Option<u32>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub nullable: Option<bool>,
}

impl TypeSchema {
    pub fn kind(&self) -> PortDataType {
        match self {
            TypeSchema::Scalar(s) => s.kind,
            TypeSchema::Object(_) | TypeSchema::Array(_) => PortDataType::Json,
        }
    }

    pub fn title(&self) -> Option<&str> {
        match self {
            TypeSchema::Scalar(s) => s.title.as_deref(),
            TypeSchema::Object(o) => o.title.as_deref(),
            TypeSchema::Array(a) => a.title.as_deref(),
        }
    }

    pub fn description(&self) -> Option<&str> {
        match self {
            TypeSchema::Scalar(s) => s.description.as_deref(),
            TypeSchema::Object(o) => o.description.as_deref(),
            TypeSchema::Array(a) => a.description.as_deref(),
        }
    }

    pub fn nullable(&self) -> bool {
        match self {
            TypeSchema::Scalar(s) => s.nullable.unwrap_or(false),
            TypeSchema::Object(o) => o.nullable.unwrap_or(false),
            TypeSchema::Array(a) => a.nullable.unwrap_or(false),
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TypeSchemaHelper {
    kind: PortDataType,
    #[serde(skip_serializing_if = "Option::is_none")]
    shape: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    examples: Option<Vec<serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    properties: Option<HashMap<String, TypeSchema>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    required: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    additional_properties: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    items: Option<Box<TypeSchema>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    min_items: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_items: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    nullable: Option<bool>,
}

impl Serialize for TypeSchema {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let helper = match self {
            TypeSchema::Scalar(s) => TypeSchemaHelper {
                kind: s.kind,
                shape: None,
                format: s.format.clone(),
                examples: s.examples.clone(),
                properties: None,
                required: None,
                additional_properties: None,
                items: None,
                min_items: None,
                max_items: None,
                title: s.title.clone(),
                description: s.description.clone(),
                nullable: s.nullable,
            },
            TypeSchema::Object(o) => TypeSchemaHelper {
                kind: PortDataType::Json,
                shape: Some("object".to_string()),
                format: None,
                examples: None,
                properties: Some(o.properties.clone()),
                required: o.required.clone(),
                additional_properties: o.additional_properties,
                items: None,
                min_items: None,
                max_items: None,
                title: o.title.clone(),
                description: o.description.clone(),
                nullable: o.nullable,
            },
            TypeSchema::Array(a) => TypeSchemaHelper {
                kind: PortDataType::Json,
                shape: Some("array".to_string()),
                format: None,
                examples: None,
                properties: None,
                required: None,
                additional_properties: None,
                items: Some(a.items.clone()),
                min_items: a.min_items,
                max_items: a.max_items,
                title: a.title.clone(),
                description: a.description.clone(),
                nullable: a.nullable,
            },
        };
        helper.serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for TypeSchema {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let helper = TypeSchemaHelper::deserialize(deserializer)?;

        match helper.kind {
            PortDataType::Json => match helper.shape.as_deref() {
                Some("object") => Ok(TypeSchema::Object(ObjectTypeSchema {
                    properties: helper.properties.unwrap_or_default(),
                    required: helper.required,
                    additional_properties: helper.additional_properties,
                    title: helper.title,
                    description: helper.description,
                    nullable: helper.nullable,
                })),
                Some("array") => {
                    let items = helper.items.ok_or_else(|| {
                        serde::de::Error::custom(
                            "TypeSchema with kind='json' and shape='array' requires 'items' field",
                        )
                    })?;
                    Ok(TypeSchema::Array(ArrayTypeSchema {
                        items,
                        min_items: helper.min_items,
                        max_items: helper.max_items,
                        title: helper.title,
                        description: helper.description,
                        nullable: helper.nullable,
                    }))
                }
                Some(other) => Err(serde::de::Error::custom(format!(
                    "unknown shape '{}' for kind='json', expected 'object' or 'array'",
                    other
                ))),
                None => Err(serde::de::Error::custom(
                    "TypeSchema with kind='json' requires 'shape' field ('object' or 'array')",
                )),
            },
            kind => Ok(TypeSchema::Scalar(ScalarTypeSchema {
                kind,
                format: helper.format,
                examples: helper.examples,
                title: helper.title,
                description: helper.description,
                nullable: helper.nullable,
            })),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scalar_roundtrip() {
        let schema = TypeSchema::Scalar(ScalarTypeSchema {
            kind: PortDataType::Text,
            format: Some("markdown".to_string()),
            examples: None,
            title: Some("Test".to_string()),
            description: None,
            nullable: None,
        });

        let json = serde_json::to_string(&schema).expect("serialize");
        let parsed: TypeSchema = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(schema, parsed);
    }

    #[test]
    fn test_object_roundtrip() {
        let mut properties = HashMap::new();
        properties.insert(
            "name".to_string(),
            TypeSchema::Scalar(ScalarTypeSchema {
                kind: PortDataType::Text,
                format: None,
                examples: None,
                title: None,
                description: None,
                nullable: None,
            }),
        );

        let schema = TypeSchema::Object(ObjectTypeSchema {
            properties,
            required: Some(vec!["name".to_string()]),
            additional_properties: Some(false),
            title: None,
            description: None,
            nullable: None,
        });

        let json = serde_json::to_string(&schema).expect("serialize");
        let parsed: TypeSchema = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(schema, parsed);
    }

    #[test]
    fn test_array_roundtrip() {
        let schema = TypeSchema::Array(ArrayTypeSchema {
            items: Box::new(TypeSchema::Scalar(ScalarTypeSchema {
                kind: PortDataType::Text,
                format: None,
                examples: None,
                title: None,
                description: None,
                nullable: None,
            })),
            min_items: Some(1),
            max_items: Some(10),
            title: None,
            description: None,
            nullable: None,
        });

        let json = serde_json::to_string(&schema).expect("serialize");
        let parsed: TypeSchema = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(schema, parsed);
    }

    #[test]
    fn test_object_json_format() {
        let schema = TypeSchema::Object(ObjectTypeSchema {
            properties: HashMap::new(),
            required: None,
            additional_properties: None,
            title: None,
            description: None,
            nullable: None,
        });

        let json = serde_json::to_string(&schema).expect("serialize");
        let value: serde_json::Value = serde_json::from_str(&json).expect("parse");
        assert_eq!(value["kind"], "json");
        assert_eq!(value["shape"], "object");
    }

    #[test]
    fn test_json_without_shape_fails() {
        let json = r#"{"kind":"json"}"#;
        let result: Result<TypeSchema, _> = serde_json::from_str(json);
        assert!(result.is_err());
    }

    #[test]
    fn test_nested_object_roundtrip() {
        let mut inner_props = HashMap::new();
        inner_props.insert(
            "city".to_string(),
            TypeSchema::Scalar(ScalarTypeSchema {
                kind: PortDataType::Text,
                format: None,
                examples: None,
                title: None,
                description: None,
                nullable: None,
            }),
        );

        let mut outer_props = HashMap::new();
        outer_props.insert(
            "address".to_string(),
            TypeSchema::Object(ObjectTypeSchema {
                properties: inner_props,
                required: Some(vec!["city".to_string()]),
                additional_properties: None,
                title: None,
                description: None,
                nullable: None,
            }),
        );

        let schema = TypeSchema::Object(ObjectTypeSchema {
            properties: outer_props,
            required: Some(vec!["address".to_string()]),
            additional_properties: None,
            title: None,
            description: None,
            nullable: None,
        });

        let json = serde_json::to_string(&schema).expect("serialize");
        let parsed: TypeSchema = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(schema, parsed);
    }
}
