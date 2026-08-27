use agentloom_type_engine::checker::{CompatibilityLevel, check_compatibility};
use agentloom_type_engine::types::{
    ObjectTypeSchema, PortDataType, PortDefinition, PortDirection, ScalarTypeSchema, TypeSchema,
};
use serde_json::Value;
use std::collections::HashMap;

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
    let source = build_port(
        "source",
        PortDataType::Text,
        Some(scalar_schema(PortDataType::Text)),
    );
    let target = build_port(
        "target",
        PortDataType::Json,
        Some(build_required_object_schema(&[(
            "payload",
            scalar_schema(PortDataType::Text),
        )])),
    );

    let result = check_compatibility(&source, &target);

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
}

#[test]
fn agent_to_agent_is_exact() {
    let source = build_port("source", PortDataType::Agent, None);
    let target = build_port("target", PortDataType::Agent, None);

    let result = check_compatibility(&source, &target);

    assert_eq!(result.level, CompatibilityLevel::Exact);
    assert_eq!(result.reason, None);
    assert!(result.missing_fields.is_empty());
    assert!(result.candidate_mappings.is_empty());
}

#[test]
fn agent_to_text_is_incompatible() {
    let source = build_port("source", PortDataType::Agent, None);
    let target = build_port("target", PortDataType::Text, None);

    let result = check_compatibility(&source, &target);

    assert_eq!(result.level, CompatibilityLevel::Incompatible);
    assert_eq!(result.reason.as_deref(), Some("type_mismatch_no_transform"));
}

#[test]
fn agent_to_model_is_incompatible() {
    let source = build_port("source", PortDataType::Agent, None);
    let target = build_port("target", PortDataType::Model, None);

    let result = check_compatibility(&source, &target);

    assert_eq!(result.level, CompatibilityLevel::Incompatible);
    assert_eq!(result.reason.as_deref(), Some("type_mismatch_no_transform"));
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
fn exec_and_volume_port_data_types_round_trip_through_serde() {
    for (port_type, encoded) in [
        (PortDataType::Exec, "\"exec\""),
        (PortDataType::Volume, "\"volume\""),
    ] {
        let serialized = serde_json::to_string(&port_type).expect("port type should serialize");
        let deserialized: PortDataType =
            serde_json::from_str(&serialized).expect("port type should deserialize");

        assert_eq!(serialized, encoded);
        assert_eq!(deserialized, port_type);
        assert_eq!(port_type.to_string(), encoded.trim_matches('"'));
    }
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
