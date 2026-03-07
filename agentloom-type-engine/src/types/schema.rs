use super::PortDataType;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub enum TypeSchema {
    Scalar(ScalarTypeSchema),
    Object(ObjectTypeSchema),
    Array(ArrayTypeSchema),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScalarTypeSchema {
    pub kind: PortDataType,
    pub format: Option<String>,
    #[serde(default)]
    pub examples: Vec<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    #[serde(default)]
    pub nullable: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectTypeSchema {
    pub kind: PortDataType,
    #[serde(default)]
    pub properties: HashMap<String, TypeSchema>,
    #[serde(default)]
    pub required: Vec<String>,
    #[serde(default)]
    pub additional_properties: bool,
    pub title: Option<String>,
    pub description: Option<String>,
    #[serde(default)]
    pub nullable: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArrayTypeSchema {
    pub kind: PortDataType,
    pub items: Box<TypeSchema>,
    pub min_items: Option<usize>,
    pub max_items: Option<usize>,
    pub title: Option<String>,
    pub description: Option<String>,
    #[serde(default)]
    pub nullable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TypeSchemaHelper {
    pub kind: PortDataType,
    pub shape: Option<String>,
    pub properties: Option<HashMap<String, TypeSchema>>,
    pub required: Option<Vec<String>>,
    pub additional_properties: Option<bool>,
    pub items: Option<Box<TypeSchema>>,
    pub min_items: Option<usize>,
    pub max_items: Option<usize>,
    pub format: Option<String>,
    pub examples: Option<Vec<String>>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub nullable: Option<bool>,
}

impl TypeSchema {
    pub fn kind(&self) -> PortDataType {
        match self {
            Self::Scalar(schema) => schema.kind,
            Self::Object(schema) => schema.kind,
            Self::Array(schema) => schema.kind,
        }
    }
}

impl Serialize for TypeSchema {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let helper = match self {
            Self::Scalar(schema) => TypeSchemaHelper {
                kind: schema.kind,
                shape: None,
                properties: None,
                required: None,
                additional_properties: None,
                items: None,
                min_items: None,
                max_items: None,
                format: schema.format.clone(),
                examples: Some(schema.examples.clone()),
                title: schema.title.clone(),
                description: schema.description.clone(),
                nullable: Some(schema.nullable),
            },
            Self::Object(schema) => TypeSchemaHelper {
                kind: schema.kind,
                shape: Some("object".to_string()),
                properties: Some(schema.properties.clone()),
                required: Some(schema.required.clone()),
                additional_properties: Some(schema.additional_properties),
                items: None,
                min_items: None,
                max_items: None,
                format: None,
                examples: None,
                title: schema.title.clone(),
                description: schema.description.clone(),
                nullable: Some(schema.nullable),
            },
            Self::Array(schema) => TypeSchemaHelper {
                kind: schema.kind,
                shape: Some("array".to_string()),
                properties: None,
                required: None,
                additional_properties: None,
                items: Some(schema.items.clone()),
                min_items: schema.min_items,
                max_items: schema.max_items,
                format: None,
                examples: None,
                title: schema.title.clone(),
                description: schema.description.clone(),
                nullable: Some(schema.nullable),
            },
        };

        helper.serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for TypeSchema {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let helper = TypeSchemaHelper::deserialize(deserializer)?;

        if helper.kind == PortDataType::Json {
            match helper.shape.as_deref() {
                Some("object") => {
                    return Ok(Self::Object(ObjectTypeSchema {
                        kind: helper.kind,
                        properties: helper.properties.unwrap_or_default(),
                        required: helper.required.unwrap_or_default(),
                        additional_properties: helper.additional_properties.unwrap_or(false),
                        title: helper.title,
                        description: helper.description,
                        nullable: helper.nullable.unwrap_or(false),
                    }));
                }
                Some("array") => {
                    return Ok(Self::Array(ArrayTypeSchema {
                        kind: helper.kind,
                        items: helper
                            .items
                            .ok_or_else(|| serde::de::Error::missing_field("items"))?,
                        min_items: helper.min_items,
                        max_items: helper.max_items,
                        title: helper.title,
                        description: helper.description,
                        nullable: helper.nullable.unwrap_or(false),
                    }));
                }
                _ => {}
            }
        }

        Ok(Self::Scalar(ScalarTypeSchema {
            kind: helper.kind,
            format: helper.format,
            examples: helper.examples.unwrap_or_default(),
            title: helper.title,
            description: helper.description,
            nullable: helper.nullable.unwrap_or(false),
        }))
    }
}
