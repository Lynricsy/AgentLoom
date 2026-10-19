use agentloom_type_engine::checker::{CompatibilityLevel, check_compatibility};
use agentloom_type_engine::types::{
    ArrayTypeSchema, ObjectTypeSchema, PortDataType, PortDefinition, PortDirection,
    ScalarTypeSchema, TypeSchema,
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
fn exec_volume_and_runtime_plugin_port_data_types_round_trip_through_serde() {
    for (port_type, encoded) in [
        (PortDataType::Exec, "\"exec\""),
        (PortDataType::Volume, "\"volume\""),
        (PortDataType::RuntimePlugin, "\"runtime-plugin\""),
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

fn titled_scalar_schema(kind: PortDataType, title: &str) -> TypeSchema {
    TypeSchema::Scalar(ScalarTypeSchema {
        kind,
        format: None,
        examples: Vec::new(),
        title: Some(title.to_string()),
        description: Some(format!("{title} 端口")),
        nullable: false,
    })
}

#[test]
fn same_kind_scalars_with_different_labels_are_exact() {
    // Studio 把端口 label 写进 schema.title：Agent「回复」→ Text Output「文本」必须可连
    let source = build_port(
        "reply-out",
        PortDataType::Text,
        Some(titled_scalar_schema(PortDataType::Text, "回复")),
    );
    let target = build_port(
        "text-in",
        PortDataType::Text,
        Some(titled_scalar_schema(PortDataType::Text, "文本")),
    );

    let result = check_compatibility(&source, &target);

    assert_eq!(result.level, CompatibilityLevel::Exact);
    assert_eq!(result.reason, None);
}

#[test]
fn different_kind_scalars_with_different_labels_stay_incompatible() {
    let source = build_port(
        "reply-out",
        PortDataType::Text,
        Some(titled_scalar_schema(PortDataType::Text, "回复")),
    );
    let target = build_port(
        "image-in",
        PortDataType::Image,
        Some(titled_scalar_schema(PortDataType::Image, "图片")),
    );

    let result = check_compatibility(&source, &target);

    assert_eq!(result.level, CompatibilityLevel::Incompatible);
    assert_eq!(result.reason.as_deref(), Some("type_mismatch_no_transform"));
}

#[test]
fn scalar_format_mismatch_stays_incompatible() {
    let mut source_schema = scalar_schema(PortDataType::Text);
    let mut target_schema = scalar_schema(PortDataType::Text);
    if let (TypeSchema::Scalar(source_scalar), TypeSchema::Scalar(target_scalar)) =
        (&mut source_schema, &mut target_schema)
    {
        source_scalar.format = Some("markdown".to_string());
        target_scalar.format = Some("uri".to_string());
    }
    let source = build_port("source", PortDataType::Text, Some(source_schema));
    let target = build_port("target", PortDataType::Text, Some(target_schema));

    let result = check_compatibility(&source, &target);

    assert_eq!(result.level, CompatibilityLevel::Incompatible);
    assert_eq!(result.reason.as_deref(), Some("scalar_schema_mismatch"));
}

#[test]
fn nullable_scalar_cannot_flow_into_non_nullable_target() {
    let mut source_schema = scalar_schema(PortDataType::Text);
    if let TypeSchema::Scalar(source_scalar) = &mut source_schema {
        source_scalar.nullable = true;
    }
    let source = build_port("source", PortDataType::Text, Some(source_schema.clone()));
    let target = build_port(
        "target",
        PortDataType::Text,
        Some(scalar_schema(PortDataType::Text)),
    );

    let rejected = check_compatibility(&source, &target);
    assert_eq!(rejected.level, CompatibilityLevel::Incompatible);
    assert_eq!(rejected.reason.as_deref(), Some("scalar_schema_mismatch"));

    // 不可空源连进可空目标是安全的
    let accepted = check_compatibility(
        &target,
        &build_port("nullable", PortDataType::Text, Some(source_schema)),
    );
    assert_eq!(accepted.level, CompatibilityLevel::Exact);
}

fn open_json_object_schema() -> TypeSchema {
    TypeSchema::Object(ObjectTypeSchema {
        kind: PortDataType::Json,
        properties: HashMap::new(),
        required: Vec::new(),
        additional_properties: true,
        title: Some("结果".to_string()),
        description: None,
        nullable: false,
    })
}

fn json_array_schema() -> TypeSchema {
    TypeSchema::Array(ArrayTypeSchema {
        kind: PortDataType::Json,
        items: Box::new(open_json_object_schema()),
        min_items: None,
        max_items: None,
        title: Some("数组".to_string()),
        description: None,
        nullable: false,
    })
}

#[test]
fn json_object_port_to_array_port_is_runtime_checked_transform() {
    // Studio 的 json 端口是开放对象 schema，array 端口是 shape=array 的 json schema
    let source = build_port(
        "result-out",
        PortDataType::Json,
        Some(open_json_object_schema()),
    );
    let target = build_port("items-in", PortDataType::Array, Some(json_array_schema()));

    let result = check_compatibility(&source, &target);

    assert_eq!(result.level, CompatibilityLevel::Transform);
    assert_eq!(
        result.reason.as_deref(),
        Some("json_to_array_runtime_check")
    );
    assert_eq!(result.transform_fn.as_deref(), Some("ensure_array"));
}

#[test]
fn schemaless_json_port_to_array_port_is_runtime_checked_transform() {
    let source = build_port("source", PortDataType::Json, None);
    let target = build_port("target", PortDataType::Array, None);

    let result = check_compatibility(&source, &target);

    assert_eq!(result.level, CompatibilityLevel::Transform);
    assert_eq!(result.transform_fn.as_deref(), Some("ensure_array"));
}

#[test]
fn array_port_to_json_port_stays_incompatible() {
    let source = build_port("source", PortDataType::Array, Some(json_array_schema()));
    let target = build_port(
        "target",
        PortDataType::Json,
        Some(open_json_object_schema()),
    );

    let result = check_compatibility(&source, &target);

    assert_eq!(result.level, CompatibilityLevel::Incompatible);
    assert_eq!(result.reason.as_deref(), Some("shape_mismatch"));
}

#[test]
fn nested_object_field_to_array_field_is_not_transformed() {
    // 执行期变换只作用于整个端口值，嵌套字段的 object → array 没有运行期校验
    let source = build_port(
        "source",
        PortDataType::Json,
        Some(build_required_object_schema(&[(
            "items",
            open_json_object_schema(),
        )])),
    );
    let target = build_port(
        "target",
        PortDataType::Json,
        Some(build_required_object_schema(&[(
            "items",
            json_array_schema(),
        )])),
    );

    let result = check_compatibility(&source, &target);

    assert_eq!(result.level, CompatibilityLevel::Incompatible);
    assert_eq!(result.reason.as_deref(), Some("shape_mismatch"));
    assert_eq!(result.conflict_path.as_deref(), Some("root.items.shape"));
}
