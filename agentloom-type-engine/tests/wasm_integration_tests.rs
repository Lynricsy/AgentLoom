use agentloom_type_engine::types::{
    ObjectTypeSchema, PortDataType, PortDefinition, PortDirection, ScalarTypeSchema, TypeSchema,
};
use agentloom_type_engine::wasm::{
    check_compatibility, check_schema_compatibility, validate_schema,
};
use js_sys::{Array, Reflect};
use std::collections::HashMap;
use wasm_bindgen::JsValue;
use wasm_bindgen_test::{wasm_bindgen_test, wasm_bindgen_test_configure};

wasm_bindgen_test_configure!(run_in_browser);

#[wasm_bindgen_test]
fn check_compatibility_accepts_json_string_input() {
    let source = serialize_json_string(&build_port("source", PortDataType::Text, None));
    let target = serialize_json_string(&build_port("target", PortDataType::Text, None));

    let result = must_ok(check_compatibility(source, target));

    assert_eq!(string_field(&result, "level"), "EXACT");
    assert!(value_field(&result, "reason").is_null());
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
fn validate_schema_returns_structured_error_for_empty_input() {
    let result = must_ok(validate_schema(JsValue::from_str("")));
    let errors = Array::from(&value_field(&result, "errors"));
    let first_error = errors.get(0);

    assert!(!bool_field(&result, "valid"));
    assert_eq!(string_field(&first_error, "code"), "EMPTY_INPUT");
}

#[wasm_bindgen_test]
fn check_schema_compatibility_returns_transform_result() {
    let source = serialize_json_string(&scalar_schema(PortDataType::Text));
    let target = serialize_json_string(&build_object_schema(&[(
        "payload",
        scalar_schema(PortDataType::Text),
    )]));

    let result = must_ok(check_schema_compatibility(source, target));

    assert_eq!(string_field(&result, "level"), "TRANSFORM");
    assert_eq!(string_field(&result, "transformFn"), "parse_json");
}

#[wasm_bindgen_test]
fn invalid_input_raises_js_error_with_code_and_context() {
    let target = serialize_json_string(&build_port("target", PortDataType::Text, None));
    let error = must_err(check_compatibility(JsValue::from_f64(1.0), target));
    let value: JsValue = error.into();
    let context = value_field(&value, "context");

    assert_eq!(string_field(&value, "code"), "INVALID_PORT_DEFINITION");
    assert_eq!(string_field(&context, "field"), "source");
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
