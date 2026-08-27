mod compatibility;

pub use compatibility::{
    CandidateMapping, CompatibilityChecker, CompatibilityLevel, CompatibilityResult,
    MissingFieldInfo, TransformRule, check_compatibility,
};
