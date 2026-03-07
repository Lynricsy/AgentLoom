use js_sys::{Reflect, JSON};
use serde_json::Value;
use wasm_bindgen::{JsError, JsValue};

#[derive(Debug, Clone)]
pub struct WasmError {
    pub code: String,
    pub message: String,
    pub context: Option<Value>,
}

impl WasmError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            context: None,
        }
    }

    pub fn with_context(mut self, context: Value) -> Self {
        self.context = Some(context);
        self
    }

    pub fn into_js_error(self) -> JsError {
        let error = JsError::new(&self.message);
        let value: JsValue = error.clone().into();

        let _ = Reflect::set(
            &value,
            &JsValue::from_str("name"),
            &JsValue::from_str("TypeEngineError"),
        );
        let _ = Reflect::set(
            &value,
            &JsValue::from_str("code"),
            &JsValue::from_str(&self.code),
        );

        if let Some(context) = self.context {
            match serde_json::to_string(&context) {
                Ok(serialized) => match JSON::parse(&serialized) {
                    Ok(js_context) => {
                        let _ = Reflect::set(&value, &JsValue::from_str("context"), &js_context);
                    }
                    Err(_) => {
                        let _ = Reflect::set(
                            &value,
                            &JsValue::from_str("context"),
                            &JsValue::from_str("context_parse_failed"),
                        );
                    }
                },
                Err(_) => {
                    let _ = Reflect::set(
                        &value,
                        &JsValue::from_str("context"),
                        &JsValue::from_str("context_serialization_failed"),
                    );
                }
            }
        }

        error
    }
}

impl From<WasmError> for JsError {
    fn from(error: WasmError) -> Self {
        error.into_js_error()
    }
}
