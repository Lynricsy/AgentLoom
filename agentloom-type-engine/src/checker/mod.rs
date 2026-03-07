mod compatibility;

pub use compatibility::{
    CandidateMapping, CompatibilityChecker, CompatibilityLevel, CompatibilityResult,
    MissingFieldInfo, TransformRule, check_compatibility, check_schema_compatibility,
};
