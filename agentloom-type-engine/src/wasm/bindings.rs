use crate::checker;
use crate::types::PortDefinition;
use crate::wasm::error::WasmError;
use serde::Serialize;
use serde_json::json;
use wasm_bindgen::{JsError, JsValue, prelude::wasm_bindgen};

#[wasm_bindgen(js_name = checkCompatibility)]
pub fn check_compatibility(source: JsValue, target: JsValue) -> Result<JsValue, JsError> {
    let source_definition = parse_port_definition(&source, "source")?;
    let target_definition = parse_port_definition(&target, "target")?;
    serialize_response(&checker::check_compatibility(
        &source_definition,
        &target_definition,
    ))
}

fn parse_port_definition(input: &JsValue, field: &str) -> Result<PortDefinition, JsError> {
    parse_json_input(input, field, "INVALID_PORT_DEFINITION")
}

fn parse_json_input<T>(input: &JsValue, field: &str, code: &str) -> Result<T, JsError>
where
    T: serde::de::DeserializeOwned,
{
    let raw_json = js_value_to_json_string(input, field)?;
    serde_json::from_str(&raw_json).map_err(|error| {
        WasmError::new(
            code,
            format!("'{field}' is not valid JSON for the expected contract."),
        )
        .with_context(json!({
            "field": field,
            "error": error.to_string(),
        }))
        .into()
    })
}

fn js_value_to_json_string(input: &JsValue, field: &str) -> Result<String, JsError> {
    if input.is_null() {
        return Err(
            WasmError::new("NULL_INPUT", format!("'{field}' cannot be null."))
                .with_context(json!({ "field": field }))
                .into(),
        );
    }
    if input.is_undefined() {
        return Err(
            WasmError::new("EMPTY_INPUT", format!("'{field}' is required."))
                .with_context(json!({ "field": field }))
                .into(),
        );
    }
    if let Some(raw_json) = input.as_string() {
        if raw_json.trim().is_empty() {
            return Err(
                WasmError::new("EMPTY_INPUT", format!("'{field}' is empty."))
                    .with_context(json!({ "field": field }))
                    .into(),
            );
        }
        return Ok(raw_json);
    }

    js_sys::JSON::stringify(input)
        .map(String::from)
        .map_err(|_| {
            WasmError::new(
                "STRINGIFY_FAILED",
                format!("'{field}' could not be converted to a JSON string."),
            )
            .with_context(json!({ "field": field, "valueType": describe_js_value(input) }))
            .into()
        })
}

fn serialize_response<T>(value: &T) -> Result<JsValue, JsError>
where
    T: Serialize,
{
    let serialized = serde_json::to_string(value).map_err(|error| {
        WasmError::new(
            "SERIALIZATION_FAILED",
            "Result could not be serialized for JavaScript.",
        )
        .with_context(json!({ "error": error.to_string() }))
    })?;

    js_sys::JSON::parse(&serialized).map_err(|_| {
        WasmError::new(
            "SERIALIZATION_FAILED",
            "Result JSON could not be parsed by JavaScript.",
        )
        .with_context(json!({ "payload": serialized }))
        .into()
    })
}

fn describe_js_value(value: &JsValue) -> &'static str {
    if value.is_null() {
        "null"
    } else if value.is_undefined() {
        "undefined"
    } else if value.as_string().is_some() {
        "string"
    } else if value.is_object() {
        "object"
    } else if value.as_f64().is_some() {
        "number"
    } else if value.as_bool().is_some() {
        "boolean"
    } else {
        "unknown"
    }
}
