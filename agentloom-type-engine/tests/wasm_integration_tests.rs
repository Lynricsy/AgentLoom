//! WASM 集成测试
//!
//! 通过 `wasm-pack test --node` 运行
//! 测试 WASM 绑定层的 JsValue 输入/输出、camelCase 序列化、错误处理

use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_node_experimental);

// ── helpers ──────────────────────────────────────────────

fn json(s: &str) -> JsValue {
    js_sys::JSON::parse(s).expect("invalid JSON in test fixture")
}

fn get_str(val: &JsValue, key: &str) -> String {
    js_sys::Reflect::get(val, &JsValue::from_str(key))
        .expect("field not found")
        .as_string()
        .expect("field is not a string")
}

fn get_bool(val: &JsValue, key: &str) -> bool {
    js_sys::Reflect::get(val, &JsValue::from_str(key))
        .expect("field not found")
        .as_bool()
        .expect("field is not a bool")
}

fn has_key(val: &JsValue, key: &str) -> bool {
    js_sys::Reflect::has(val, &JsValue::from_str(key)).unwrap_or(false)
}

fn get_array_len(val: &JsValue, key: &str) -> u32 {
    let field = js_sys::Reflect::get(val, &JsValue::from_str(key)).expect("field not found");
    js_sys::Array::from(&field).length()
}

// ── port definition fixtures ─────────────────────────────

fn text_output_port() -> JsValue {
    json(
        r#"{
        "id": "out-text", "label": "Text Output", "direction": "output",
        "dataType": "text", "required": true, "multiple": false,
        "maxConnections": null,
        "schema": {"kind": "text"}
    }"#,
    )
}

fn text_input_port() -> JsValue {
    json(
        r#"{
        "id": "in-text", "label": "Text Input", "direction": "input",
        "dataType": "text", "required": true, "multiple": false,
        "maxConnections": null,
        "schema": {"kind": "text"}
    }"#,
    )
}

fn json_object_input_port() -> JsValue {
    json(
        r#"{
        "id": "in-json", "label": "JSON Input", "direction": "input",
        "dataType": "json", "required": true, "multiple": false,
        "maxConnections": null,
        "schema": {
            "kind": "json", "shape": "object",
            "properties": {"name": {"kind": "text"}, "age": {"kind": "text"}}
        }
    }"#,
    )
}

fn image_output_port() -> JsValue {
    json(
        r#"{
        "id": "out-img", "label": "Image Output", "direction": "output",
        "dataType": "image", "required": true, "multiple": false,
        "maxConnections": null,
        "schema": {"kind": "image"}
    }"#,
    )
}

fn audio_input_port() -> JsValue {
    json(
        r#"{
        "id": "in-audio", "label": "Audio Input", "direction": "input",
        "dataType": "audio", "required": true, "multiple": false,
        "maxConnections": null,
        "schema": {"kind": "audio"}
    }"#,
    )
}

fn model_output_port() -> JsValue {
    json(
        r#"{
        "id": "out-model", "label": "Model Output", "direction": "output",
        "dataType": "model", "required": true, "multiple": false,
        "maxConnections": null,
        "schema": {"kind": "model"}
    }"#,
    )
}

// ═══════════════════════════════════════════════════════════
// checkCompatibility - PortDefinition 级别兼容性检查
// ═══════════════════════════════════════════════════════════

#[wasm_bindgen_test]
fn compat_exact_match_same_scalar_kind() {
    let result =
        agentloom_type_engine::wasm::check_compatibility(text_output_port(), text_input_port())
            .expect("should succeed");

    assert_eq!(get_str(&result, "level"), "exact");
    assert_eq!(get_str(&result, "reason"), "exact_match");
}

#[wasm_bindgen_test]
fn compat_text_to_json_transform() {
    let result = agentloom_type_engine::wasm::check_compatibility(
        text_output_port(),
        json_object_input_port(),
    )
    .expect("should succeed");

    assert_eq!(get_str(&result, "level"), "transform");
    assert_eq!(get_str(&result, "reason"), "text_to_json_parse");
}

#[wasm_bindgen_test]
fn compat_json_to_text_transform() {
    // json output → text input = stringify transform
    let json_out = json(
        r#"{
        "id": "out-json", "label": "JSON Output", "direction": "output",
        "dataType": "json", "required": true, "multiple": false,
        "maxConnections": null,
        "schema": {"kind": "json", "shape": "object", "properties": {}}
    }"#,
    );

    let result = agentloom_type_engine::wasm::check_compatibility(json_out, text_input_port())
        .expect("should succeed");

    assert_eq!(get_str(&result, "level"), "transform");
    assert_eq!(get_str(&result, "reason"), "json_to_text_stringify");
}

#[wasm_bindgen_test]
fn compat_model_to_text_transform() {
    let result =
        agentloom_type_engine::wasm::check_compatibility(model_output_port(), text_input_port())
            .expect("should succeed");

    assert_eq!(get_str(&result, "level"), "transform");
    assert_eq!(get_str(&result, "reason"), "model_to_text_extract");
}

#[wasm_bindgen_test]
fn compat_incompatible_unrelated_types() {
    let result =
        agentloom_type_engine::wasm::check_compatibility(image_output_port(), audio_input_port())
            .expect("should succeed");

    assert_eq!(get_str(&result, "level"), "incompatible");
    assert_eq!(get_str(&result, "reason"), "type_mismatch_no_transform");
}

#[wasm_bindgen_test]
fn compat_invalid_source_returns_error() {
    let bad_source = json(r#"{"invalid": true}"#);
    let err = agentloom_type_engine::wasm::check_compatibility(bad_source, text_input_port())
        .unwrap_err();

    assert_eq!(get_str(&err, "code"), "INVALID_SOURCE");
    assert!(has_key(&err, "message"));
}

#[wasm_bindgen_test]
fn compat_invalid_target_returns_error() {
    let bad_target = json(r#"{"also": "invalid"}"#);
    let err = agentloom_type_engine::wasm::check_compatibility(text_output_port(), bad_target)
        .unwrap_err();

    assert_eq!(get_str(&err, "code"), "INVALID_TARGET");
}

// ═══════════════════════════════════════════════════════════
// checkSchemaCompatibility - TypeSchema 级别兼容性检查
// ═══════════════════════════════════════════════════════════

#[wasm_bindgen_test]
fn schema_compat_exact_scalar() {
    let result = agentloom_type_engine::wasm::check_schema_compatibility(
        json(r#"{"kind": "text"}"#),
        json(r#"{"kind": "text"}"#),
    )
    .expect("should succeed");

    assert_eq!(get_str(&result, "level"), "exact");
}

#[wasm_bindgen_test]
fn schema_compat_exact_object_same_fields() {
    let schema = r#"{
        "kind": "json", "shape": "object",
        "properties": {
            "name": {"kind": "text"},
            "value": {"kind": "text"}
        }
    }"#;

    let result =
        agentloom_type_engine::wasm::check_schema_compatibility(json(schema), json(schema))
            .expect("should succeed");

    assert_eq!(get_str(&result, "level"), "exact");
}

#[wasm_bindgen_test]
fn schema_compat_partial_object_overlap() {
    let source = json(
        r#"{
        "kind": "json", "shape": "object",
        "properties": {
            "name": {"kind": "text"},
            "age": {"kind": "text"}
        }
    }"#,
    );
    let target = json(
        r#"{
        "kind": "json", "shape": "object",
        "properties": {
            "name": {"kind": "text"},
            "email": {"kind": "text"}
        },
        "required": ["name", "email"]
    }"#,
    );

    let result = agentloom_type_engine::wasm::check_schema_compatibility(source, target)
        .expect("should succeed");

    assert_eq!(get_str(&result, "level"), "partial");
    assert_eq!(get_str(&result, "reason"), "partial_field_match");
    assert!(get_array_len(&result, "missingFields") > 0);
}

#[wasm_bindgen_test]
fn schema_compat_object_no_overlap_incompatible() {
    let source = json(
        r#"{
        "kind": "json", "shape": "object",
        "properties": {"x": {"kind": "text"}}
    }"#,
    );
    let target = json(
        r#"{
        "kind": "json", "shape": "object",
        "properties": {"y": {"kind": "text"}}
    }"#,
    );

    let result = agentloom_type_engine::wasm::check_schema_compatibility(source, target)
        .expect("should succeed");

    assert_eq!(get_str(&result, "level"), "incompatible");
}

#[wasm_bindgen_test]
fn schema_compat_array_exact() {
    let schema = r#"{"kind": "json", "shape": "array", "items": {"kind": "text"}}"#;

    let result =
        agentloom_type_engine::wasm::check_schema_compatibility(json(schema), json(schema))
            .expect("should succeed");

    assert_eq!(get_str(&result, "level"), "exact");
}

#[wasm_bindgen_test]
fn schema_compat_shape_mismatch() {
    let obj = json(
        r#"{
        "kind": "json", "shape": "object",
        "properties": {"a": {"kind": "text"}}
    }"#,
    );
    let arr = json(
        r#"{
        "kind": "json", "shape": "array",
        "items": {"kind": "text"}
    }"#,
    );

    let result =
        agentloom_type_engine::wasm::check_schema_compatibility(obj, arr).expect("should succeed");

    assert_eq!(get_str(&result, "level"), "incompatible");
    assert_eq!(get_str(&result, "reason"), "shape_mismatch");
}

#[wasm_bindgen_test]
fn schema_compat_invalid_source_error() {
    let err = agentloom_type_engine::wasm::check_schema_compatibility(
        json(r#"{"broken": true}"#),
        json(r#"{"kind": "text"}"#),
    )
    .unwrap_err();

    assert_eq!(get_str(&err, "code"), "INVALID_SOURCE_SCHEMA");
}

#[wasm_bindgen_test]
fn schema_compat_invalid_target_error() {
    let err = agentloom_type_engine::wasm::check_schema_compatibility(
        json(r#"{"kind": "text"}"#),
        json(r#"{"nope": 42}"#),
    )
    .unwrap_err();

    assert_eq!(get_str(&err, "code"), "INVALID_TARGET_SCHEMA");
}

// ═══════════════════════════════════════════════════════════
// validateSchema - TypeSchema 验证
// ═══════════════════════════════════════════════════════════

#[wasm_bindgen_test]
fn validate_valid_scalar() {
    let result = agentloom_type_engine::wasm::validate_schema(json(r#"{"kind": "text"}"#))
        .expect("should succeed");

    assert_eq!(get_bool(&result, "valid"), true);
    assert_eq!(get_array_len(&result, "errors"), 0);
}

#[wasm_bindgen_test]
fn validate_valid_object_with_required() {
    let schema = json(
        r#"{
        "kind": "json", "shape": "object",
        "properties": {
            "name": {"kind": "text"},
            "items": {"kind": "json", "shape": "array", "items": {"kind": "text"}}
        },
        "required": ["name"]
    }"#,
    );

    let result = agentloom_type_engine::wasm::validate_schema(schema).expect("should succeed");
    assert_eq!(get_bool(&result, "valid"), true);
    assert_eq!(get_array_len(&result, "errors"), 0);
}

#[wasm_bindgen_test]
fn validate_valid_array() {
    let schema = json(
        r#"{
        "kind": "json", "shape": "array",
        "items": {"kind": "text"},
        "minItems": 1, "maxItems": 10
    }"#,
    );

    let result = agentloom_type_engine::wasm::validate_schema(schema).expect("should succeed");
    assert_eq!(get_bool(&result, "valid"), true);
}

#[wasm_bindgen_test]
fn validate_object_required_not_in_properties() {
    let schema = json(
        r#"{
        "kind": "json", "shape": "object",
        "properties": {"name": {"kind": "text"}},
        "required": ["name", "ghost_field"]
    }"#,
    );

    let result = agentloom_type_engine::wasm::validate_schema(schema).expect("should succeed");
    assert_eq!(get_bool(&result, "valid"), false);
    assert!(get_array_len(&result, "errors") > 0);
}

#[wasm_bindgen_test]
fn validate_array_min_exceeds_max() {
    let schema = json(
        r#"{
        "kind": "json", "shape": "array",
        "items": {"kind": "text"},
        "minItems": 10, "maxItems": 3
    }"#,
    );

    let result = agentloom_type_engine::wasm::validate_schema(schema).expect("should succeed");
    assert_eq!(get_bool(&result, "valid"), false);
    assert!(get_array_len(&result, "errors") > 0);
}

#[wasm_bindgen_test]
fn validate_invalid_input_returns_error() {
    let err =
        agentloom_type_engine::wasm::validate_schema(json(r#"{"not": "a schema"}"#)).unwrap_err();

    assert_eq!(get_str(&err, "code"), "INVALID_SCHEMA");
    assert!(has_key(&err, "message"));
}

#[wasm_bindgen_test]
fn validate_json_kind_without_shape_returns_error() {
    // kind=json requires shape field; missing shape → deserialization failure
    let err =
        agentloom_type_engine::wasm::validate_schema(json(r#"{"kind": "json"}"#)).unwrap_err();
    assert_eq!(get_str(&err, "code"), "INVALID_SCHEMA");
}

// ═══════════════════════════════════════════════════════════
// camelCase 输出格式验证
// ═══════════════════════════════════════════════════════════

#[wasm_bindgen_test]
fn output_keys_are_camel_case() {
    // 使用会产生 partial 结果的 object schemas 来验证所有 output 字段的命名
    let source = json(
        r#"{
        "id": "o1", "label": "Out", "direction": "output",
        "dataType": "json", "required": true, "multiple": false,
        "maxConnections": null,
        "schema": {
            "kind": "json", "shape": "object",
            "properties": {"a": {"kind": "text"}, "b": {"kind": "text"}}
        }
    }"#,
    );
    let target = json(
        r#"{
        "id": "i1", "label": "In", "direction": "input",
        "dataType": "json", "required": true, "multiple": false,
        "maxConnections": null,
        "schema": {
            "kind": "json", "shape": "object",
            "properties": {"a": {"kind": "text"}, "c": {"kind": "text"}}
        }
    }"#,
    );

    let result =
        agentloom_type_engine::wasm::check_compatibility(source, target).expect("should succeed");

    // camelCase 字段必须存在
    assert!(has_key(&result, "level"));
    assert!(has_key(&result, "reason"));
    assert!(has_key(&result, "missingFields"));
    assert!(has_key(&result, "candidateMappings"));
    assert!(has_key(&result, "conflictPath"));

    // snake_case 字段不应存在
    assert!(!has_key(&result, "missing_fields"));
    assert!(!has_key(&result, "candidate_mappings"));
    assert!(!has_key(&result, "conflict_path"));
}

#[wasm_bindgen_test]
fn error_output_keys_are_camel_case() {
    let err = agentloom_type_engine::wasm::validate_schema(json(r#"{}"#)).unwrap_err();

    // WasmError 字段是 camelCase
    assert!(has_key(&err, "code"));
    assert!(has_key(&err, "message"));
}

#[wasm_bindgen_test]
fn validation_error_keys_are_camel_case() {
    let schema = json(
        r#"{
        "kind": "json", "shape": "object",
        "properties": {"a": {"kind": "text"}},
        "required": ["a", "missing"]
    }"#,
    );

    let result = agentloom_type_engine::wasm::validate_schema(schema).expect("should succeed");
    assert_eq!(get_bool(&result, "valid"), false);

    let errors = js_sys::Reflect::get(&result, &JsValue::from_str("errors")).unwrap();
    let arr = js_sys::Array::from(&errors);
    let first_err = arr.get(0);

    assert!(has_key(&first_err, "path"));
    assert!(has_key(&first_err, "code"));
    assert!(has_key(&first_err, "message"));
}
