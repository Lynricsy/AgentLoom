use agentloom_type_engine::checker::{
    check_compatibility, check_schema_compatibility, CompatibilityLevel,
};
use agentloom_type_engine::types::{
    ObjectTypeSchema, PortDataType, PortDefinition, PortDirection, ScalarTypeSchema, TypeSchema,
};
use serde_json::Value;
use std::collections::HashMap;
use std::time::Instant;

#[test]
fn exact_match_returns_null_reason_and_empty_diagnostics() {
    let source = build_port("source", PortDataType::Text, None);
    let target = build_port("target", PortDataType::Text, None);

    let result = check_compatibility(&source, &target);

    assert_eq!(result.level, CompatibilityLevel::Exact);
    assert_eq!(result.reason, None);
    assert!(result.missing_fields.is_empty());
    assert!(result.candidate_mappings.is_empty());
    assert!(result.metadata.is_empty());
}

#[test]
fn transform_match_exposes_transform_function() {
    let source = scalar_schema(PortDataType::Text);
    let target = build_required_object_schema(&[("payload", scalar_schema(PortDataType::Text))]);

    let result = check_schema_compatibility(&source, &target);

    assert_eq!(result.level, CompatibilityLevel::Transform);
    assert_eq!(result.reason.as_deref(), Some("text_to_json_parse"));
    assert_eq!(result.transform_fn.as_deref(), Some("parse_json"));
}

#[test]
fn partial_match_includes_missing_fields_candidate_mappings_and_ratio() {
    let source = build_port(
        "source",
        PortDataType::Json,
        Some(build_required_object_schema(&[
            ("name", scalar_schema(PortDataType::Text)),
            ("contactEmail", scalar_schema(PortDataType::Text)),
        ])),
    );
    let target = build_port(
        "target",
        PortDataType::Json,
        Some(build_required_object_schema(&[
            ("name", scalar_schema(PortDataType::Text)),
            ("email", scalar_schema(PortDataType::Text)),
        ])),
    );

    let result = check_compatibility(&source, &target);

    assert_eq!(result.level, CompatibilityLevel::Partial);
    assert_eq!(result.reason.as_deref(), Some("partial_field_match"));
    assert_eq!(result.missing_fields.len(), 1);
    assert_eq!(result.missing_fields[0].path, "email");
    assert!(result.missing_fields[0].required);
    assert!(!result.candidate_mappings.is_empty());
    assert_eq!(result.candidate_mappings[0].target_path, "email");
    assert_eq!(result.metadata.get("matchedRatio"), Some(&Value::from(0.5)));
}

#[test]
fn incompatible_match_reports_conflict_path() {
    let source = build_port("source", PortDataType::Image, None);
    let target = build_port("target", PortDataType::Audio, None);

    let result = check_compatibility(&source, &target);

    assert_eq!(result.level, CompatibilityLevel::Incompatible);
    assert_eq!(result.reason.as_deref(), Some("type_mismatch_no_transform"));
    assert_eq!(result.conflict_path.as_deref(), Some("root.kind"));
}

#[test]
fn nested_missing_field_uses_dot_path() {
    let source = build_port(
        "source",
        PortDataType::Json,
        Some(build_required_object_schema(&[(
            "profile",
            build_required_object_schema(&[("name", scalar_schema(PortDataType::Text))]),
        )])),
    );
    let target = build_port(
        "target",
        PortDataType::Json,
        Some(build_required_object_schema(&[(
            "profile",
            build_required_object_schema(&[
                ("name", scalar_schema(PortDataType::Text)),
                ("email", scalar_schema(PortDataType::Text)),
            ]),
        )])),
    );

    let result = check_compatibility(&source, &target);

    assert_eq!(result.level, CompatibilityLevel::Partial);
    assert_eq!(result.missing_fields[0].path, "profile.email");
}

#[test]
fn compatibility_check_finishes_under_one_hundred_milliseconds_for_ten_fields() {
    let source = build_port(
        "source",
        PortDataType::Json,
        Some(build_generated_object_schema("field_", 10)),
    );
    let target = build_port(
        "target",
        PortDataType::Json,
        Some(build_generated_object_schema("field_", 10)),
    );

    let started_at = Instant::now();
    let result = check_compatibility(&source, &target);

    assert_eq!(result.level, CompatibilityLevel::Exact);
    assert!(started_at.elapsed().as_millis() < 100);
}

fn build_port(id: &str, data_type: PortDataType, schema: Option<TypeSchema>) -> PortDefinition {
    PortDefinition {
        id: id.to_string(),
        label: id.to_string(),
        direction: PortDirection::Output,
        data_type,
        description: None,
        required: true,
        multiple: false,
        max_connections: Some(1),
        schema,
    }
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

fn build_required_object_schema(entries: &[(&str, TypeSchema)]) -> TypeSchema {
    let mut properties = HashMap::new();
    let mut required = Vec::new();

    for (name, schema) in entries {
        required.push((*name).to_string());
        properties.insert((*name).to_string(), schema.clone());
    }

    TypeSchema::Object(ObjectTypeSchema {
        kind: PortDataType::Json,
        properties,
        required,
        additional_properties: false,
        title: None,
        description: None,
        nullable: false,
    })
}

fn build_generated_object_schema(prefix: &str, count: usize) -> TypeSchema {
    let mut properties = HashMap::new();
    let mut required = Vec::new();

    for index in 0..count {
        let name = format!("{prefix}{index}");
        required.push(name.clone());
        properties.insert(name, scalar_schema(PortDataType::Text));
    }

    TypeSchema::Object(ObjectTypeSchema {
        kind: PortDataType::Json,
        properties,
        required,
        additional_properties: false,
        title: None,
        description: None,
        nullable: false,
    })
}

#[test]
fn skill_to_skill_is_exact() {
    let source = build_port("source", PortDataType::Skill, None);
    let target = build_port("target", PortDataType::Skill, None);

    let result = check_compatibility(&source, &target);

    assert_eq!(result.level, CompatibilityLevel::Exact);
    assert_eq!(result.reason, None);
    assert!(result.missing_fields.is_empty());
    assert!(result.candidate_mappings.is_empty());
}

#[test]
fn skill_to_text_is_transform() {
    let source = build_port("source", PortDataType::Skill, None);
    let target = build_port("target", PortDataType::Text, None);

    let result = check_compatibility(&source, &target);

    assert_eq!(result.level, CompatibilityLevel::Transform);
    assert_eq!(result.reason.as_deref(), Some("skill_to_text_degrade"));
    assert_eq!(result.transform_fn.as_deref(), Some("extract_skill_text"));
}

#[test]
fn text_to_skill_is_incompatible() {
    let source = build_port("source", PortDataType::Text, None);
    let target = build_port("target", PortDataType::Skill, None);

    let result = check_compatibility(&source, &target);

    assert_eq!(result.level, CompatibilityLevel::Incompatible);
    assert_eq!(result.reason.as_deref(), Some("type_mismatch_no_transform"));
}

#[test]
fn skill_to_json_is_incompatible() {
    let source = build_port("source", PortDataType::Skill, None);
    let target = build_port("target", PortDataType::Json, None);

    let result = check_compatibility(&source, &target);

    assert_eq!(result.level, CompatibilityLevel::Incompatible);
    assert_eq!(result.reason.as_deref(), Some("type_mismatch_no_transform"));
}
