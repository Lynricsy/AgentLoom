use crate::types::{PortDataType, TypeSchema};
use serde::{Deserialize, Serialize};
use serde_json::Value;

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

#[derive(Debug, Clone)]
pub struct SchemaValidator {
    max_depth: usize,
}

pub fn validate_schema(schema: &TypeSchema) -> ValidationResult {
    SchemaValidator::default().validate(schema)
}

pub fn validate_raw_json(input: &str) -> ValidationResult {
    SchemaValidator::default().validate_raw_json(input)
}

impl Default for SchemaValidator {
    fn default() -> Self {
        Self { max_depth: 12 }
    }
}

impl ValidationResult {
    pub fn valid() -> Self {
        Self {
            valid: true,
            errors: Vec::new(),
        }
    }

    pub fn invalid(errors: Vec<ValidationError>) -> Self {
        Self {
            valid: false,
            errors,
        }
    }

    pub fn single_error(path: &str, code: &str, message: impl Into<String>) -> Self {
        Self::invalid(vec![ValidationError {
            path: path.to_string(),
            code: code.to_string(),
            message: message.into(),
        }])
    }
}

impl SchemaValidator {
    pub fn validate(&self, schema: &TypeSchema) -> ValidationResult {
        let mut errors = Vec::new();
        self.validate_recursive(schema, "$", 0, &mut errors);

        if errors.is_empty() {
            ValidationResult::valid()
        } else {
            ValidationResult::invalid(errors)
        }
    }

    pub fn validate_raw_json(&self, input: &str) -> ValidationResult {
        if input.trim().is_empty() {
            return ValidationResult::single_error("$", "EMPTY_INPUT", "Schema input is empty.");
        }

        let raw_value: Value = match serde_json::from_str(input) {
            Ok(value) => value,
            Err(error) => {
                return ValidationResult::single_error(
                    "$",
                    "MALFORMED_JSON",
                    format!("Schema JSON could not be parsed: {error}"),
                );
            }
        };

        if raw_value.is_null() {
            return ValidationResult::single_error(
                "$",
                "NULL_SCHEMA",
                "Schema input cannot be null.",
            );
        }

        let schema: TypeSchema = match serde_json::from_value(raw_value) {
            Ok(schema) => schema,
            Err(error) => {
                return ValidationResult::single_error(
                    "$",
                    "INVALID_SCHEMA",
                    format!("Schema does not match the TypeSchema contract: {error}"),
                );
            }
        };

        self.validate(&schema)
    }

    fn validate_recursive(
        &self,
        schema: &TypeSchema,
        path: &str,
        depth: usize,
        errors: &mut Vec<ValidationError>,
    ) {
        if depth > self.max_depth {
            errors.push(ValidationError {
                path: path.to_string(),
                code: "MAX_DEPTH_EXCEEDED".to_string(),
                message: format!(
                    "Schema nesting exceeds the supported depth limit of {}.",
                    self.max_depth
                ),
            });
            return;
        }

        match schema {
            TypeSchema::Scalar(scalar_schema) => {
                if scalar_schema.kind == PortDataType::Json {
                    errors.push(ValidationError {
                        path: path.to_string(),
                        code: "INVALID_SCALAR_KIND".to_string(),
                        message: "Scalar schemas cannot use the json data kind.".to_string(),
                    });
                }
            }
            TypeSchema::Object(object_schema) => {
                if object_schema.kind != PortDataType::Json {
                    errors.push(ValidationError {
                        path: path.to_string(),
                        code: "INVALID_OBJECT_KIND".to_string(),
                        message: "Object schemas must use the json data kind.".to_string(),
                    });
                }

                for required_field in &object_schema.required {
                    if !object_schema.properties.contains_key(required_field) {
                        errors.push(ValidationError {
                            path: format!("{path}.required.{required_field}"),
                            code: "REQUIRED_FIELD_NOT_DEFINED".to_string(),
                            message: format!(
                                "Required field '{required_field}' is missing from properties."
                            ),
                        });
                    }
                }

                for (field_name, field_schema) in &object_schema.properties {
                    self.validate_recursive(
                        field_schema,
                        &format!("{path}.properties.{field_name}"),
                        depth + 1,
                        errors,
                    );
                }
            }
            TypeSchema::Array(array_schema) => {
                if array_schema.kind != PortDataType::Json {
                    errors.push(ValidationError {
                        path: path.to_string(),
                        code: "INVALID_ARRAY_KIND".to_string(),
                        message: "Array schemas must use the json data kind.".to_string(),
                    });
                }

                if let (Some(min_items), Some(max_items)) =
                    (array_schema.min_items, array_schema.max_items)
                    && min_items > max_items
                {
                    errors.push(ValidationError {
                        path: format!("{path}.minItems"),
                        code: "MIN_EXCEEDS_MAX".to_string(),
                        message: format!(
                            "minItems ({min_items}) cannot be greater than maxItems ({max_items})."
                        ),
                    });
                }

                self.validate_recursive(
                    array_schema.items.as_ref(),
                    &format!("{path}.items"),
                    depth + 1,
                    errors,
                );
            }
        }
    }
}
