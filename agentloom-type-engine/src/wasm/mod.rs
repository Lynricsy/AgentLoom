use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::checker::CompatibilityChecker;
use crate::types::PortDefinition;
use crate::types::TypeSchema;
use crate::validator::SchemaValidator;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<String>,
}

impl WasmError {
    fn to_js_value(&self) -> JsValue {
        serde_wasm_bindgen::to_value(self).unwrap_or_else(|_| {
            JsValue::from_str(&format!("Error: {} - {}", self.code, self.message))
        })
    }
}

#[wasm_bindgen(js_name = "checkCompatibility")]
pub fn check_compatibility(source: JsValue, target: JsValue) -> Result<JsValue, JsValue> {
    let source: PortDefinition = serde_wasm_bindgen::from_value(source).map_err(|e| {
        WasmError {
            code: "INVALID_SOURCE".to_string(),
            message: format!("Failed to deserialize source PortDefinition: {e}"),
            context: Some("source".to_string()),
        }
        .to_js_value()
    })?;

    let target: PortDefinition = serde_wasm_bindgen::from_value(target).map_err(|e| {
        WasmError {
            code: "INVALID_TARGET".to_string(),
            message: format!("Failed to deserialize target PortDefinition: {e}"),
            context: Some("target".to_string()),
        }
        .to_js_value()
    })?;

    let result = CompatibilityChecker::check(&source, &target);

    serde_wasm_bindgen::to_value(&result).map_err(|e| {
        WasmError {
            code: "SERIALIZATION_ERROR".to_string(),
            message: format!("Failed to serialize CompatibilityResult: {e}"),
            context: None,
        }
        .to_js_value()
    })
}

#[wasm_bindgen(js_name = "checkSchemaCompatibility")]
pub fn check_schema_compatibility(source: JsValue, target: JsValue) -> Result<JsValue, JsValue> {
    let source: TypeSchema = serde_wasm_bindgen::from_value(source).map_err(|e| {
        WasmError {
            code: "INVALID_SOURCE_SCHEMA".to_string(),
            message: format!("Failed to deserialize source TypeSchema: {e}"),
            context: Some("source".to_string()),
        }
        .to_js_value()
    })?;

    let target: TypeSchema = serde_wasm_bindgen::from_value(target).map_err(|e| {
        WasmError {
            code: "INVALID_TARGET_SCHEMA".to_string(),
            message: format!("Failed to deserialize target TypeSchema: {e}"),
            context: Some("target".to_string()),
        }
        .to_js_value()
    })?;

    let result = CompatibilityChecker::check_schemas(&source, &target);

    serde_wasm_bindgen::to_value(&result).map_err(|e| {
        WasmError {
            code: "SERIALIZATION_ERROR".to_string(),
            message: format!("Failed to serialize CompatibilityResult: {e}"),
            context: None,
        }
        .to_js_value()
    })
}

#[wasm_bindgen(js_name = "validateSchema")]
pub fn validate_schema(schema: JsValue) -> Result<JsValue, JsValue> {
    let schema: TypeSchema = serde_wasm_bindgen::from_value(schema).map_err(|e| {
        WasmError {
            code: "INVALID_SCHEMA".to_string(),
            message: format!("Failed to deserialize TypeSchema: {e}"),
            context: None,
        }
        .to_js_value()
    })?;

    let result = SchemaValidator::validate(&schema);

    serde_wasm_bindgen::to_value(&result).map_err(|e| {
        WasmError {
            code: "SERIALIZATION_ERROR".to_string(),
            message: format!("Failed to serialize ValidationResult: {e}"),
            context: None,
        }
        .to_js_value()
    })
}
