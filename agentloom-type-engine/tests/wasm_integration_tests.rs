use agentloom_type_engine::types::{
    ObjectTypeSchema, PortDataType, PortDefinition, PortDirection, ScalarTypeSchema, TypeSchema,
};
use agentloom_type_engine::wasm::check_compatibility;
use js_sys::{Array, Reflect};
use std::collections::HashMap;
use wasm_bindgen::JsValue;
use wasm_bindgen_test::wasm_bindgen_test;

#[wasm_bindgen_test]
fn check_compatibility_accepts_json_string_input() {
    let source = serialize_json_string(&build_port("source", PortDataType::Text, None));
    let target = serialize_json_string(&build_port("target", PortDataType::Text, None));

    let result = must_ok(check_compatibility(source, target));

    assert_eq!(string_field(&result, "level"), "EXACT");
    assert!(value_field(&result, "reason").is_null());
}

#[wasm_bindgen_test]
fn check_compatibility_accepts_object_input_and_camel_case_wire_fields() {
    let source = to_js_value(&build_port("source", PortDataType::Text, None));
    let target = to_js_value(&build_port("target", PortDataType::Text, None));

    assert_eq!(string_field(&source, "dataType"), "text");
    assert!(value_field(&source, "data_type").is_undefined());
    assert!(value_field(&source, "maxConnections").as_f64().is_some());

    let result = must_ok(check_compatibility(source, target));

    assert_eq!(string_field(&result, "level"), "EXACT");
    assert!(value_field(&result, "missingFields").is_object());
    assert!(value_field(&result, "candidateMappings").is_object());
    assert!(value_field(&result, "conflictPath").is_null());
}

#[wasm_bindgen_test]
fn check_compatibility_accepts_object_input_and_returns_partial_details() {
    let source = to_js_value(&build_port(
        "source",
        PortDataType::Json,
        Some(build_object_schema(&[
            ("name", scalar_schema(PortDataType::Text)),
            ("contactEmail", scalar_schema(PortDataType::Text)),
        ])),
    ));
    let target = to_js_value(&build_port(
        "target",
        PortDataType::Json,
        Some(build_object_schema(&[
            ("name", scalar_schema(PortDataType::Text)),
            ("email", scalar_schema(PortDataType::Text)),
        ])),
    ));

    let result = must_ok(check_compatibility(source, target));
    let missing_fields = Array::from(&value_field(&result, "missingFields"));
    let candidate_mappings = Array::from(&value_field(&result, "candidateMappings"));
    let missing_field = missing_fields.get(0);

    assert_eq!(string_field(&result, "level"), "PARTIAL");
    assert_eq!(string_field(&missing_field, "path"), "email");
    assert!(bool_field(&missing_field, "required"));
    assert!(candidate_mappings.length() > 0);
    assert!(value_field(&result, "metadata").is_object());
}

#[wasm_bindgen_test]
fn check_compatibility_accepts_object_input_and_returns_incompatible_details() {
    let source = to_js_value(&build_port("source", PortDataType::Audio, None));
    let target = to_js_value(&build_port("target", PortDataType::Image, None));

    let result = must_ok(check_compatibility(source, target));

    assert_eq!(string_field(&result, "level"), "INCOMPATIBLE");
    assert_eq!(
        string_field(&result, "reason"),
        "type_mismatch_no_transform",
    );
    assert_eq!(string_field(&result, "conflictPath"), "root.kind");
}

#[wasm_bindgen_test]
fn check_compatibility_rejects_null_source_with_structured_error() {
    let target = serialize_json_string(&build_port("target", PortDataType::Text, None));
    assert_type_engine_error(
        must_err(check_compatibility(JsValue::NULL, target)),
        "NULL_INPUT",
        "source",
    );
}

#[wasm_bindgen_test]
fn check_compatibility_rejects_undefined_target_with_structured_error() {
    let source = serialize_json_string(&build_port("source", PortDataType::Text, None));
    assert_type_engine_error(
        must_err(check_compatibility(source, JsValue::UNDEFINED)),
        "EMPTY_INPUT",
        "target",
    );
}

#[wasm_bindgen_test]
fn check_compatibility_rejects_malformed_json_with_structured_error() {
    let target = serialize_json_string(&build_port("target", PortDataType::Text, None));
    assert_type_engine_error(
        must_err(check_compatibility(
            JsValue::from_str("{not-json"),
            target,
        )),
        "INVALID_PORT_DEFINITION",
        "source",
    );
}

#[wasm_bindgen_test]
fn invalid_input_raises_named_js_error_with_stable_code_and_context() {
    let target = serialize_json_string(&build_port("target", PortDataType::Text, None));
    assert_type_engine_error(
        must_err(check_compatibility(JsValue::from_f64(1.0), target)),
        "INVALID_PORT_DEFINITION",
        "source",
    );
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

fn build_object_schema(entries: &[(&str, TypeSchema)]) -> TypeSchema {
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

fn serialize_json_string<T>(value: &T) -> JsValue
where
    T: serde::Serialize,
{
    match serde_json::to_string(value) {
        Ok(text) => JsValue::from_str(&text),
        Err(error) => panic!("failed to serialize test value: {error}"),
    }
}

fn to_js_value<T>(value: &T) -> JsValue
where
    T: serde::Serialize,
{
    match serde_json::to_string(value) {
        Ok(serialized) => match js_sys::JSON::parse(&serialized) {
            Ok(js_value) => js_value,
            Err(error) => panic!("failed to parse JSON into JsValue: {error:?}"),
        },
        Err(error) => panic!("failed to convert to JsValue: {error}"),
    }
}

fn must_ok<T>(result: Result<T, wasm_bindgen::JsError>) -> T {
    match result {
        Ok(value) => value,
        Err(error) => panic!("unexpected wasm success path failure: {error:?}"),
    }
}

fn must_err<T>(result: Result<T, wasm_bindgen::JsError>) -> wasm_bindgen::JsError {
    match result {
        Ok(_) => panic!("expected wasm error"),
        Err(error) => error,
    }
}

fn value_field(value: &JsValue, key: &str) -> JsValue {
    match Reflect::get(value, &JsValue::from_str(key)) {
        Ok(field) => field,
        Err(error) => panic!("failed to read JS field {key}: {error:?}"),
    }
}

fn string_field(value: &JsValue, key: &str) -> String {
    match value_field(value, key).as_string() {
        Some(text) => text,
        None => panic!("JS field {key} is not a string"),
    }
}

fn bool_field(value: &JsValue, key: &str) -> bool {
    match value_field(value, key).as_bool() {
        Some(flag) => flag,
        None => panic!("JS field {key} is not a bool"),
    }
}

fn assert_type_engine_error(error: wasm_bindgen::JsError, code: &str, field: &str) {
    let value: JsValue = error.into();
    let context = value_field(&value, "context");

    assert_eq!(string_field(&value, "name"), "TypeEngineError");
    assert_eq!(string_field(&value, "code"), code);
    assert_eq!(string_field(&context, "field"), field);
}
