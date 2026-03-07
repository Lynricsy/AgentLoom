use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::types::{ObjectTypeSchema, PortDataType, PortDefinition, TypeSchema};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CompatibilityLevel {
    Exact,
    Transform,
    Partial,
    Incompatible,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateMapping {
    pub source_field: String,
    pub target_field: String,
    pub confidence: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityResult {
    pub level: CompatibilityLevel,
    pub reason: String,
    pub missing_fields: Vec<String>,
    pub candidate_mappings: Vec<CandidateMapping>,
    pub conflict_path: Option<String>,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TransformRule {
    pub source_kind: PortDataType,
    pub target_kind: PortDataType,
    pub reason_key: &'static str,
}

const TRANSFORM_RULES: &[TransformRule] = &[
    TransformRule {
        source_kind: PortDataType::Text,
        target_kind: PortDataType::Json,
        reason_key: "text_to_json_parse",
    },
    TransformRule {
        source_kind: PortDataType::Json,
        target_kind: PortDataType::Text,
        reason_key: "json_to_text_stringify",
    },
    TransformRule {
        source_kind: PortDataType::Model,
        target_kind: PortDataType::Text,
        reason_key: "model_to_text_extract",
    },
];

pub struct CompatibilityChecker;

impl CompatibilityChecker {
    pub fn check(source: &PortDefinition, target: &PortDefinition) -> CompatibilityResult {
        Self::check_schemas(&source.schema, &target.schema)
    }

    pub fn check_schemas(source: &TypeSchema, target: &TypeSchema) -> CompatibilityResult {
        // Phase 1: kind check
        let source_kind = source.kind();
        let target_kind = target.kind();

        if source_kind != target_kind {
            return Self::phase1_kind_mismatch(source_kind, target_kind);
        }

        // Phase 2: structure compare
        Self::phase2_structure_compare(source, target)
    }

    fn phase1_kind_mismatch(
        source_kind: PortDataType,
        target_kind: PortDataType,
    ) -> CompatibilityResult {
        for rule in TRANSFORM_RULES {
            if rule.source_kind == source_kind && rule.target_kind == target_kind {
                return CompatibilityResult {
                    level: CompatibilityLevel::Transform,
                    reason: rule.reason_key.to_string(),
                    missing_fields: vec![],
                    candidate_mappings: vec![],
                    conflict_path: None,
                    metadata: HashMap::from([(
                        "transform".to_string(),
                        format!("{} -> {}", source_kind, target_kind),
                    )]),
                };
            }
        }

        CompatibilityResult {
            level: CompatibilityLevel::Incompatible,
            reason: "type_mismatch_no_transform".to_string(),
            missing_fields: vec![],
            candidate_mappings: vec![],
            conflict_path: None,
            metadata: HashMap::from([
                ("source_kind".to_string(), source_kind.to_string()),
                ("target_kind".to_string(), target_kind.to_string()),
            ]),
        }
    }

    fn phase2_structure_compare(source: &TypeSchema, target: &TypeSchema) -> CompatibilityResult {
        match (source, target) {
            (TypeSchema::Scalar(_), TypeSchema::Scalar(_)) => CompatibilityResult {
                level: CompatibilityLevel::Exact,
                reason: "exact_match".to_string(),
                missing_fields: vec![],
                candidate_mappings: vec![],
                conflict_path: None,
                metadata: HashMap::new(),
            },

            (TypeSchema::Object(source_obj), TypeSchema::Object(target_obj)) => {
                Self::compare_objects(source_obj, target_obj)
            }

            (TypeSchema::Array(source_arr), TypeSchema::Array(target_arr)) => {
                Self::compare_arrays(source_arr, target_arr)
            }

            (TypeSchema::Object(_), TypeSchema::Array(_))
            | (TypeSchema::Array(_), TypeSchema::Object(_)) => CompatibilityResult {
                level: CompatibilityLevel::Incompatible,
                reason: "shape_mismatch".to_string(),
                missing_fields: vec![],
                candidate_mappings: vec![],
                conflict_path: None,
                metadata: HashMap::from([(
                    "detail".to_string(),
                    "object and array shapes are incompatible".to_string(),
                )]),
            },

            (TypeSchema::Scalar(_), TypeSchema::Object(_) | TypeSchema::Array(_))
            | (TypeSchema::Object(_) | TypeSchema::Array(_), TypeSchema::Scalar(_)) => {
                CompatibilityResult {
                    level: CompatibilityLevel::Incompatible,
                    reason: "schema_variant_mismatch".to_string(),
                    missing_fields: vec![],
                    candidate_mappings: vec![],
                    conflict_path: None,
                    metadata: HashMap::new(),
                }
            }
        }
    }

    fn compare_objects(
        source: &ObjectTypeSchema,
        target: &ObjectTypeSchema,
    ) -> CompatibilityResult {
        let target_required: Vec<&str> = target
            .required
            .as_ref()
            .map(|r| r.iter().map(|s| s.as_str()).collect())
            .unwrap_or_default();

        let mut missing_fields = Vec::new();
        let mut all_match = true;
        let mut any_match = false;

        for (target_key, target_schema) in &target.properties {
            match source.properties.get(target_key) {
                Some(source_schema) => {
                    let sub_result = Self::check_schemas(source_schema, target_schema);
                    if sub_result.level == CompatibilityLevel::Exact
                        || sub_result.level == CompatibilityLevel::Transform
                    {
                        any_match = true;
                    } else {
                        all_match = false;
                        if target_required.contains(&target_key.as_str()) {
                            missing_fields.push(target_key.clone());
                        }
                    }
                }
                None => {
                    all_match = false;
                    if target_required.contains(&target_key.as_str()) {
                        missing_fields.push(target_key.clone());
                    }
                }
            }
        }

        if target.properties.is_empty() {
            return CompatibilityResult {
                level: CompatibilityLevel::Exact,
                reason: "exact_match".to_string(),
                missing_fields: vec![],
                candidate_mappings: vec![],
                conflict_path: None,
                metadata: HashMap::new(),
            };
        }

        if all_match {
            CompatibilityResult {
                level: CompatibilityLevel::Exact,
                reason: "exact_match".to_string(),
                missing_fields: vec![],
                candidate_mappings: vec![],
                conflict_path: None,
                metadata: HashMap::new(),
            }
        } else if any_match {
            // Phase 3: 缺失字段分析
            let candidate_mappings = Self::phase3_find_candidates(source, &missing_fields);

            CompatibilityResult {
                level: CompatibilityLevel::Partial,
                reason: "partial_field_match".to_string(),
                missing_fields,
                candidate_mappings,
                conflict_path: None,
                metadata: HashMap::new(),
            }
        } else {
            CompatibilityResult {
                level: CompatibilityLevel::Incompatible,
                reason: "no_field_match".to_string(),
                missing_fields,
                candidate_mappings: vec![],
                conflict_path: None,
                metadata: HashMap::new(),
            }
        }
    }

    fn compare_arrays(
        source: &crate::types::ArrayTypeSchema,
        target: &crate::types::ArrayTypeSchema,
    ) -> CompatibilityResult {
        Self::check_schemas(&source.items, &target.items)
    }

    fn phase3_find_candidates(
        source: &ObjectTypeSchema,
        missing_fields: &[String],
    ) -> Vec<CandidateMapping> {
        let mut mappings = Vec::new();

        for missing in missing_fields {
            let missing_lower = missing.to_lowercase();
            for source_key in source.properties.keys() {
                let source_lower = source_key.to_lowercase();

                let confidence = Self::field_similarity(&source_lower, &missing_lower);
                if confidence > 0.5 {
                    mappings.push(CandidateMapping {
                        source_field: source_key.clone(),
                        target_field: missing.clone(),
                        confidence,
                    });
                }
            }
        }

        mappings.sort_by(|a, b| {
            b.confidence
                .partial_cmp(&a.confidence)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        mappings
    }

    // Jaccard similarity (char-set based, range 0.0 ~ 1.0)
    fn field_similarity(a: &str, b: &str) -> f64 {
        if a == b {
            return 1.0;
        }

        if a.contains(b) || b.contains(a) {
            return 0.8;
        }

        let a_chars: std::collections::HashSet<char> = a.chars().collect();
        let b_chars: std::collections::HashSet<char> = b.chars().collect();
        let intersection = a_chars.intersection(&b_chars).count();
        let union = a_chars.union(&b_chars).count();

        if union == 0 {
            0.0
        } else {
            intersection as f64 / union as f64
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ScalarTypeSchema;

    fn text_schema() -> TypeSchema {
        TypeSchema::Scalar(ScalarTypeSchema {
            kind: PortDataType::Text,
            format: None,
            examples: None,
            title: None,
            description: None,
            nullable: None,
        })
    }

    fn model_schema() -> TypeSchema {
        TypeSchema::Scalar(ScalarTypeSchema {
            kind: PortDataType::Model,
            format: None,
            examples: None,
            title: None,
            description: None,
            nullable: None,
        })
    }

    fn image_schema() -> TypeSchema {
        TypeSchema::Scalar(ScalarTypeSchema {
            kind: PortDataType::Image,
            format: None,
            examples: None,
            title: None,
            description: None,
            nullable: None,
        })
    }

    fn object_schema(fields: Vec<(&str, TypeSchema)>, required: Option<Vec<&str>>) -> TypeSchema {
        let properties = fields
            .into_iter()
            .map(|(k, v)| (k.to_string(), v))
            .collect();
        let required = required.map(|r| r.into_iter().map(|s| s.to_string()).collect());
        TypeSchema::Object(ObjectTypeSchema {
            properties,
            required,
            additional_properties: None,
            title: None,
            description: None,
            nullable: None,
        })
    }

    fn array_schema(items: TypeSchema) -> TypeSchema {
        TypeSchema::Array(crate::types::ArrayTypeSchema {
            items: Box::new(items),
            min_items: None,
            max_items: None,
            title: None,
            description: None,
            nullable: None,
        })
    }

    // Phase 1 テスト

    #[test]
    fn test_exact_match_scalar() {
        let result = CompatibilityChecker::check_schemas(&text_schema(), &text_schema());
        assert_eq!(result.level, CompatibilityLevel::Exact);
        assert_eq!(result.reason, "exact_match");
    }

    #[test]
    fn test_text_to_json_transform() {
        let json_obj = object_schema(vec![], None);
        let result = CompatibilityChecker::check_schemas(&text_schema(), &json_obj);
        assert_eq!(result.level, CompatibilityLevel::Transform);
        assert_eq!(result.reason, "text_to_json_parse");
    }

    #[test]
    fn test_json_to_text_transform() {
        let json_obj = object_schema(vec![], None);
        let result = CompatibilityChecker::check_schemas(&json_obj, &text_schema());
        assert_eq!(result.level, CompatibilityLevel::Transform);
        assert_eq!(result.reason, "json_to_text_stringify");
    }

    #[test]
    fn test_model_to_text_transform() {
        let result = CompatibilityChecker::check_schemas(&model_schema(), &text_schema());
        assert_eq!(result.level, CompatibilityLevel::Transform);
        assert_eq!(result.reason, "model_to_text_extract");
    }

    #[test]
    fn test_incompatible_types() {
        let result = CompatibilityChecker::check_schemas(&image_schema(), &text_schema());
        assert_eq!(result.level, CompatibilityLevel::Incompatible);
        assert_eq!(result.reason, "type_mismatch_no_transform");
    }

    // Phase 2 テスト

    #[test]
    fn test_exact_match_object() {
        let source = object_schema(
            vec![("name", text_schema()), ("age", text_schema())],
            Some(vec!["name"]),
        );
        let target = object_schema(
            vec![("name", text_schema()), ("age", text_schema())],
            Some(vec!["name"]),
        );

        let result = CompatibilityChecker::check_schemas(&source, &target);
        assert_eq!(result.level, CompatibilityLevel::Exact);
    }

    #[test]
    fn test_partial_match_object() {
        let source = object_schema(vec![("name", text_schema())], Some(vec!["name"]));
        let target = object_schema(
            vec![("name", text_schema()), ("email", text_schema())],
            Some(vec!["name", "email"]),
        );

        let result = CompatibilityChecker::check_schemas(&source, &target);
        assert_eq!(result.level, CompatibilityLevel::Partial);
        assert_eq!(result.reason, "partial_field_match");
        assert!(result.missing_fields.contains(&"email".to_string()));
    }

    #[test]
    fn test_incompatible_object_no_match() {
        let source = object_schema(vec![("foo", text_schema())], Some(vec!["foo"]));
        let target = object_schema(vec![("bar", text_schema())], Some(vec!["bar"]));

        let result = CompatibilityChecker::check_schemas(&source, &target);
        assert_eq!(result.level, CompatibilityLevel::Incompatible);
        assert_eq!(result.reason, "no_field_match");
    }

    #[test]
    fn test_exact_match_array() {
        let source = array_schema(text_schema());
        let target = array_schema(text_schema());

        let result = CompatibilityChecker::check_schemas(&source, &target);
        assert_eq!(result.level, CompatibilityLevel::Exact);
    }

    #[test]
    fn test_shape_mismatch_object_vs_array() {
        let obj = object_schema(vec![], None);
        let arr = array_schema(text_schema());

        let result = CompatibilityChecker::check_schemas(&obj, &arr);
        assert_eq!(result.level, CompatibilityLevel::Incompatible);
        assert_eq!(result.reason, "shape_mismatch");
    }

    // Phase 3 テスト

    #[test]
    fn test_candidate_mapping_similar_fields() {
        let source = object_schema(
            vec![("userName", text_schema()), ("email", text_schema())],
            None,
        );
        let target = object_schema(
            vec![("userName", text_schema()), ("userEmail", text_schema())],
            Some(vec!["userName", "userEmail"]),
        );

        let result = CompatibilityChecker::check_schemas(&source, &target);
        assert_eq!(result.level, CompatibilityLevel::Partial);
        // "email" should have some similarity with "userEmail"
        assert!(!result.candidate_mappings.is_empty());
    }

    #[test]
    fn test_empty_target_properties() {
        let source = object_schema(vec![("name", text_schema())], None);
        let target = object_schema(vec![], None);

        let result = CompatibilityChecker::check_schemas(&source, &target);
        assert_eq!(result.level, CompatibilityLevel::Exact);
    }

    // CompatibilityLevel ordering テスト

    #[test]
    fn test_compatibility_level_ordering() {
        assert!(CompatibilityLevel::Exact < CompatibilityLevel::Transform);
        assert!(CompatibilityLevel::Transform < CompatibilityLevel::Partial);
        assert!(CompatibilityLevel::Partial < CompatibilityLevel::Incompatible);
    }
}
