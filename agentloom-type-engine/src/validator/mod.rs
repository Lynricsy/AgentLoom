use serde::{Deserialize, Serialize};

use crate::types::{PortDataType, TypeSchema};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationError {
    pub path: String,
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<ValidationError>,
}

pub struct SchemaValidator;

impl SchemaValidator {
    pub fn validate(schema: &TypeSchema) -> ValidationResult {
        let mut errors = Vec::new();
        Self::validate_recursive(schema, "", &mut errors);
        ValidationResult {
            valid: errors.is_empty(),
            errors,
        }
    }

    fn validate_recursive(schema: &TypeSchema, path: &str, errors: &mut Vec<ValidationError>) {
        match schema {
            TypeSchema::Scalar(s) => {
                if s.kind == PortDataType::Json {
                    errors.push(ValidationError {
                        path: format!("{path}.kind"),
                        code: "INVALID_SCALAR_KIND".to_string(),
                        message: "Scalar schema cannot have kind 'json', use Object or Array shape instead".to_string(),
                    });
                }
            }
            TypeSchema::Object(o) => {
                if let Some(ref required) = o.required {
                    for field in required {
                        if !o.properties.contains_key(field) {
                            errors.push(ValidationError {
                                path: format!("{path}.required"),
                                code: "REQUIRED_FIELD_NOT_IN_PROPERTIES".to_string(),
                                message: format!(
                                    "Required field '{}' is not defined in properties",
                                    field
                                ),
                            });
                        }
                    }
                }

                for (key, prop_schema) in &o.properties {
                    let prop_path = if path.is_empty() {
                        format!("properties.{key}")
                    } else {
                        format!("{path}.properties.{key}")
                    };
                    Self::validate_recursive(prop_schema, &prop_path, errors);
                }
            }
            TypeSchema::Array(a) => {
                if let (Some(min), Some(max)) = (a.min_items, a.max_items)
                    && min > max
                {
                    errors.push(ValidationError {
                        path: format!("{path}.minItems"),
                        code: "MIN_EXCEEDS_MAX".to_string(),
                        message: format!(
                            "minItems ({}) cannot be greater than maxItems ({})",
                            min, max
                        ),
                    });
                }

                let items_path = if path.is_empty() {
                    "items".to_string()
                } else {
                    format!("{path}.items")
                };
                Self::validate_recursive(&a.items, &items_path, errors);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;
    use crate::types::{ArrayTypeSchema, ObjectTypeSchema, ScalarTypeSchema};

    fn text_schema() -> TypeSchema {
        TypeSchema::Scalar(ScalarTypeSchema {
            kind: PortDataType::Text,
            format: None,
            examples: None,
            title: None,
            description: None,
            nullable: None,
        })
    }

    #[test]
    fn test_valid_scalar_schema() {
        let schema = text_schema();
        let result = SchemaValidator::validate(&schema);
        assert!(result.valid);
        assert!(result.errors.is_empty());
    }

    #[test]
    fn test_invalid_scalar_with_json_kind() {
        let schema = TypeSchema::Scalar(ScalarTypeSchema {
            kind: PortDataType::Json,
            format: None,
            examples: None,
            title: None,
            description: None,
            nullable: None,
        });
        let result = SchemaValidator::validate(&schema);
        assert!(!result.valid);
        assert_eq!(result.errors.len(), 1);
        assert_eq!(result.errors[0].code, "INVALID_SCALAR_KIND");
    }

    #[test]
    fn test_valid_object_schema() {
        let mut properties = HashMap::new();
        properties.insert("name".to_string(), text_schema());
        properties.insert("age".to_string(), text_schema());

        let schema = TypeSchema::Object(ObjectTypeSchema {
            properties,
            required: Some(vec!["name".to_string()]),
            additional_properties: None,
            title: None,
            description: None,
            nullable: None,
        });

        let result = SchemaValidator::validate(&schema);
        assert!(result.valid);
    }

    #[test]
    fn test_invalid_object_required_not_in_properties() {
        let mut properties = HashMap::new();
        properties.insert("name".to_string(), text_schema());

        let schema = TypeSchema::Object(ObjectTypeSchema {
            properties,
            required: Some(vec!["name".to_string(), "missing_field".to_string()]),
            additional_properties: None,
            title: None,
            description: None,
            nullable: None,
        });

        let result = SchemaValidator::validate(&schema);
        assert!(!result.valid);
        assert_eq!(result.errors.len(), 1);
        assert_eq!(result.errors[0].code, "REQUIRED_FIELD_NOT_IN_PROPERTIES");
        assert!(result.errors[0].message.contains("missing_field"));
    }

    #[test]
    fn test_valid_array_schema() {
        let schema = TypeSchema::Array(ArrayTypeSchema {
            items: Box::new(text_schema()),
            min_items: Some(1),
            max_items: Some(10),
            title: None,
            description: None,
            nullable: None,
        });

        let result = SchemaValidator::validate(&schema);
        assert!(result.valid);
    }

    #[test]
    fn test_invalid_array_min_exceeds_max() {
        let schema = TypeSchema::Array(ArrayTypeSchema {
            items: Box::new(text_schema()),
            min_items: Some(10),
            max_items: Some(5),
            title: None,
            description: None,
            nullable: None,
        });

        let result = SchemaValidator::validate(&schema);
        assert!(!result.valid);
        assert_eq!(result.errors.len(), 1);
        assert_eq!(result.errors[0].code, "MIN_EXCEEDS_MAX");
    }

    #[test]
    fn test_nested_validation() {
        let mut inner_props = HashMap::new();
        inner_props.insert("value".to_string(), text_schema());

        let mut outer_props = HashMap::new();
        outer_props.insert(
            "nested".to_string(),
            TypeSchema::Object(ObjectTypeSchema {
                properties: inner_props,
                required: Some(vec!["value".to_string(), "ghost".to_string()]),
                additional_properties: None,
                title: None,
                description: None,
                nullable: None,
            }),
        );

        let schema = TypeSchema::Object(ObjectTypeSchema {
            properties: outer_props,
            required: None,
            additional_properties: None,
            title: None,
            description: None,
            nullable: None,
        });

        let result = SchemaValidator::validate(&schema);
        assert!(!result.valid);
        assert_eq!(result.errors.len(), 1);
        assert!(result.errors[0].path.contains("nested"));
        assert_eq!(result.errors[0].code, "REQUIRED_FIELD_NOT_IN_PROPERTIES");
    }

    #[test]
    fn test_array_with_invalid_items() {
        let schema = TypeSchema::Array(ArrayTypeSchema {
            items: Box::new(TypeSchema::Scalar(ScalarTypeSchema {
                kind: PortDataType::Json,
                format: None,
                examples: None,
                title: None,
                description: None,
                nullable: None,
            })),
            min_items: None,
            max_items: None,
            title: None,
            description: None,
            nullable: None,
        });

        let result = SchemaValidator::validate(&schema);
        assert!(!result.valid);
        assert_eq!(result.errors[0].code, "INVALID_SCALAR_KIND");
    }

    #[test]
    fn test_empty_object_valid() {
        let schema = TypeSchema::Object(ObjectTypeSchema {
            properties: HashMap::new(),
            required: None,
            additional_properties: None,
            title: None,
            description: None,
            nullable: None,
        });

        let result = SchemaValidator::validate(&schema);
        assert!(result.valid);
    }
}
