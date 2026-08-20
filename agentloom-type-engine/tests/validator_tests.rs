use agentloom_type_engine::types::{
    ArrayTypeSchema, ObjectTypeSchema, PortDataType, ScalarTypeSchema, TypeSchema,
};
use agentloom_type_engine::validator::{validate_raw_json, validate_schema};
use std::collections::HashMap;

#[test]
fn valid_schema_passes_validation() {
    let schema = build_object_schema(&[("title", scalar_schema(PortDataType::Text))], &["title"]);
    let result = validate_schema(&schema);

    assert!(result.valid);
    assert!(result.errors.is_empty());
}

#[test]
fn missing_required_field_is_reported() {
    let mut properties = HashMap::new();
    properties.insert("title".to_string(), scalar_schema(PortDataType::Text));
    let schema = TypeSchema::Object(ObjectTypeSchema {
        kind: PortDataType::Json,
        properties,
        required: vec!["summary".to_string()],
        additional_properties: false,
        title: None,
        description: None,
        nullable: false,
    });

    let result = validate_schema(&schema);

    assert!(!result.valid);
    assert_eq!(result.errors[0].code, "REQUIRED_FIELD_NOT_DEFINED");
}

#[test]
fn array_bounds_are_validated() {
    let schema = TypeSchema::Array(ArrayTypeSchema {
        kind: PortDataType::Json,
        items: Box::new(scalar_schema(PortDataType::Text)),
        min_items: Some(3),
        max_items: Some(1),
        title: None,
        description: None,
        nullable: false,
    });

    let result = validate_schema(&schema);

    assert!(!result.valid);
    assert_eq!(result.errors[0].code, "MIN_EXCEEDS_MAX");
}

#[test]
fn validate_raw_json_rejects_empty_input() {
    let result = validate_raw_json("");

    assert!(!result.valid);
    assert_eq!(result.errors[0].code, "EMPTY_INPUT");
}

#[test]
fn validate_raw_json_rejects_malformed_json() {
    let result = validate_raw_json("{");

    assert!(!result.valid);
    assert_eq!(result.errors[0].code, "MALFORMED_JSON");
}

#[test]
fn validate_raw_json_rejects_null_schema() {
    let result = validate_raw_json("null");

    assert!(!result.valid);
    assert_eq!(result.errors[0].code, "NULL_SCHEMA");
}

#[test]
fn nested_schema_depth_limit_is_enforced() {
    let schema = build_nested_array_schema(14);
    let result = validate_schema(&schema);

    assert!(!result.valid);
    assert!(
        result
            .errors
            .iter()
            .any(|error| error.code == "MAX_DEPTH_EXCEEDED")
    );
}

fn scalar_schema(kind: PortDataType) -> TypeSchema {
    TypeSchema::Scalar(ScalarTypeSchema {
        kind,
        format: None,
        examples: Vec::new(),
        title: None,
        description: None,
        nullable: false,
    })
}

fn build_object_schema(entries: &[(&str, TypeSchema)], required_fields: &[&str]) -> TypeSchema {
    let mut properties = HashMap::new();
    for (name, schema) in entries {
        properties.insert((*name).to_string(), schema.clone());
    }

    TypeSchema::Object(ObjectTypeSchema {
        kind: PortDataType::Json,
        properties,
        required: required_fields
            .iter()
            .map(|field| (*field).to_string())
            .collect(),
        additional_properties: false,
        title: None,
        description: None,
        nullable: false,
    })
}

fn build_nested_array_schema(depth: usize) -> TypeSchema {
    let mut schema = scalar_schema(PortDataType::Text);
    for _ in 0..depth {
        schema = TypeSchema::Array(ArrayTypeSchema {
            kind: PortDataType::Json,
            items: Box::new(schema),
            min_items: None,
            max_items: None,
            title: None,
            description: None,
            nullable: false,
        });
    }
    schema
}
