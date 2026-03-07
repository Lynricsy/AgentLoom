mod bindings;
mod error;

pub use bindings::{check_compatibility, check_schema_compatibility, validate_schema};
pub use error::WasmError;
