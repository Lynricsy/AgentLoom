use crate::types::{PortDataType, PortDefinition, PortDirection, ScalarTypeSchema, TypeSchema};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CompatibilityLevel {
    Exact,
    Transform,
    Partial,
    Incompatible,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissingFieldInfo {
    pub path: String,
    pub expected_type: TypeSchema,
    pub required: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateMapping {
    pub source_path: String,
    pub target_path: String,
    pub confidence: f64,
    pub auto_recommended: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityResult {
    pub level: CompatibilityLevel,
    pub reason: Option<String>,
    pub missing_fields: Vec<MissingFieldInfo>,
    pub candidate_mappings: Vec<CandidateMapping>,
    pub conflict_path: Option<String>,
    pub transform_fn: Option<String>,
    pub metadata: HashMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TransformRule {
    pub source_kind: PortDataType,
    pub target_kind: PortDataType,
    pub reason_key: &'static str,
    pub transform_fn: &'static str,
}

#[derive(Debug, Clone)]
pub struct CompatibilityChecker {
    transform_rules: Vec<TransformRule>,
}

#[derive(Debug, Clone)]
struct ComparisonState {
    matched_units: usize,
    total_units: usize,
    missing_fields: Vec<MissingFieldInfo>,
    candidate_mappings: Vec<CandidateMapping>,
    conflict_path: Option<String>,
    reason: Option<String>,
    transform_fn: Option<String>,
    transform_used: bool,
}

pub fn check_compatibility(
    source: &PortDefinition,
    target: &PortDefinition,
) -> CompatibilityResult {
    CompatibilityChecker::default().check(source, target)
}
pub fn check_port_connection(
    source: &PortDefinition,
    target: &PortDefinition,
    source_connection_count: u32,
    target_connection_count: u32,
) -> CompatibilityResult {
    CompatibilityChecker::default().check_port_connection(
        source,
        target,
        source_connection_count,
        target_connection_count,
    )
}

pub fn check_schema_compatibility(source: &TypeSchema, target: &TypeSchema) -> CompatibilityResult {
    CompatibilityChecker::default().check_schemas(source, target)
}

impl Default for CompatibilityChecker {
    fn default() -> Self {
        Self {
            transform_rules: vec![
                TransformRule {
                    source_kind: PortDataType::Text,
                    target_kind: PortDataType::Json,
                    reason_key: "text_to_json_parse",
                    transform_fn: "parse_json",
                },
                TransformRule {
                    source_kind: PortDataType::Json,
                    target_kind: PortDataType::Text,
                    reason_key: "json_to_text_stringify",
                    transform_fn: "stringify_json",
                },
                TransformRule {
                    source_kind: PortDataType::Skill,
                    target_kind: PortDataType::Text,
                    reason_key: "skill_to_text_degrade",
                    transform_fn: "extract_skill_text",
                },
            ],
        }
    }
}

impl CompatibilityChecker {
    pub fn check(&self, source: &PortDefinition, target: &PortDefinition) -> CompatibilityResult {
        let source_schema = source.schema.clone().unwrap_or_else(|| {
            scalar_schema(
                source.data_type,
                source.description.clone(),
                !source.required,
            )
        });
        let target_schema = target.schema.clone().unwrap_or_else(|| {
            scalar_schema(
                target.data_type,
                target.description.clone(),
                !target.required,
            )
        });

        self.check_schemas(&source_schema, &target_schema)
    }
    pub fn check_port_connection(
        &self,
        source: &PortDefinition,
        target: &PortDefinition,
        source_connection_count: u32,
        target_connection_count: u32,
    ) -> CompatibilityResult {
        if source.direction != PortDirection::Output {
            return connection_incompatible("source_direction_must_be_output");
        }
        if target.direction != PortDirection::Input {
            return connection_incompatible("target_direction_must_be_input");
        }
        if !source.required && target.required {
            return connection_incompatible("optional_source_to_required_target");
        }
        if connection_limit(source).is_some_and(|limit| source_connection_count >= limit) {
            return connection_incompatible("source_connection_limit_reached");
        }
        if connection_limit(target).is_some_and(|limit| target_connection_count >= limit) {
            return connection_incompatible("target_connection_limit_reached");
        }

        self.check(source, target)
    }

    pub fn check_schemas(&self, source: &TypeSchema, target: &TypeSchema) -> CompatibilityResult {
        self.compare_schema(source, target, "").into_result()
    }

    fn compare_schema(
        &self,
        source: &TypeSchema,
        target: &TypeSchema,
        path: &str,
    ) -> ComparisonState {
        if source.kind() != target.kind() {
            if let Some(rule) = self.find_transform_rule(source.kind(), target.kind()) {
                return ComparisonState::transform(
                    rule.reason_key,
                    rule.transform_fn,
                    count_units(target),
                );
            }

            return ComparisonState::incompatible(
                "type_mismatch_no_transform",
                Some(kind_conflict_path(path)),
                count_units(target),
            );
        }

        match (source, target) {
            (TypeSchema::Scalar(source_scalar), TypeSchema::Scalar(target_scalar)) => {
                self.compare_scalar(source_scalar, target_scalar, path)
            }
            (TypeSchema::Object(source_object), TypeSchema::Object(target_object)) => {
                self.compare_object(source_object, target_object, path)
            }
            (TypeSchema::Array(source_array), TypeSchema::Array(target_array)) => {
                self.compare_array(source_array, target_array, path)
            }
            _ => ComparisonState::incompatible(
                "shape_mismatch",
                Some(shape_conflict_path(path)),
                count_units(target),
            ),
        }
    }

    fn compare_scalar(
        &self,
        source: &ScalarTypeSchema,
        target: &ScalarTypeSchema,
        path: &str,
    ) -> ComparisonState {
        if source == target {
            return ComparisonState::exact(1);
        }

        ComparisonState::incompatible("scalar_schema_mismatch", Some(conflict_path(path)), 1)
    }

    fn compare_object(
        &self,
        source: &crate::types::ObjectTypeSchema,
        target: &crate::types::ObjectTypeSchema,
        path: &str,
    ) -> ComparisonState {
        let mut state = ComparisonState::new(count_units(&TypeSchema::Object(target.clone())));

        for (field_name, target_schema) in &target.properties {
            let child_path = join_path(path, field_name);
            let is_required = target.required.iter().any(|entry| entry == field_name);

            if let Some(source_schema) = source.properties.get(field_name) {
                state.merge(self.compare_schema(source_schema, target_schema, &child_path));
            } else {
                state.missing_fields.push(MissingFieldInfo {
                    path: child_path.clone(),
                    expected_type: target_schema.clone(),
                    required: is_required,
                });
            }
        }

        if !state.missing_fields.is_empty() {
            let source_paths = collect_source_paths(&TypeSchema::Object(source.clone()), path);
            state.candidate_mappings =
                self.build_candidate_mappings(&source_paths, &state.missing_fields);
        }

        state
    }

    fn compare_array(
        &self,
        source: &crate::types::ArrayTypeSchema,
        target: &crate::types::ArrayTypeSchema,
        path: &str,
    ) -> ComparisonState {
        if let (Some(source_min), Some(target_min)) = (source.min_items, target.min_items)
            && source_min < target_min
        {
            return ComparisonState::incompatible(
                "array_cardinality_mismatch",
                Some(format!("{}.minItems", conflict_path(path))),
                count_units(&TypeSchema::Array(target.clone())),
            );
        }

        if let (Some(source_max), Some(target_max)) = (source.max_items, target.max_items)
            && source_max > target_max
        {
            return ComparisonState::incompatible(
                "array_cardinality_mismatch",
                Some(format!("{}.maxItems", conflict_path(path))),
                count_units(&TypeSchema::Array(target.clone())),
            );
        }

        self.compare_schema(
            source.items.as_ref(),
            target.items.as_ref(),
            &join_array_path(path),
        )
    }

    fn build_candidate_mappings(
        &self,
        source_paths: &[String],
        missing_fields: &[MissingFieldInfo],
    ) -> Vec<CandidateMapping> {
        let mut candidates = Vec::new();

        for missing in missing_fields {
            for source_path in source_paths {
                let confidence = field_similarity(source_path, &missing.path);
                if confidence < 0.55 {
                    continue;
                }

                candidates.push(CandidateMapping {
                    source_path: source_path.clone(),
                    target_path: missing.path.clone(),
                    confidence,
                    auto_recommended: confidence >= 0.85,
                });
            }
        }

        candidates.sort_by(|left, right| {
            right
                .confidence
                .total_cmp(&left.confidence)
                .then_with(|| left.target_path.cmp(&right.target_path))
                .then_with(|| left.source_path.cmp(&right.source_path))
        });
        candidates.truncate(6);
        candidates
    }

    fn find_transform_rule(
        &self,
        source_kind: PortDataType,
        target_kind: PortDataType,
    ) -> Option<&TransformRule> {
        self.transform_rules
            .iter()
            .find(|rule| rule.source_kind == source_kind && rule.target_kind == target_kind)
    }
}

impl ComparisonState {
    fn new(total_units: usize) -> Self {
        Self {
            matched_units: 0,
            total_units,
            missing_fields: Vec::new(),
            candidate_mappings: Vec::new(),
            conflict_path: None,
            reason: None,
            transform_fn: None,
            transform_used: false,
        }
    }

    fn exact(total_units: usize) -> Self {
        Self {
            matched_units: total_units,
            total_units,
            missing_fields: Vec::new(),
            candidate_mappings: Vec::new(),
            conflict_path: None,
            reason: None,
            transform_fn: None,
            transform_used: false,
        }
    }

    fn transform(reason: &str, transform_fn: &str, total_units: usize) -> Self {
        Self {
            matched_units: total_units,
            total_units,
            missing_fields: Vec::new(),
            candidate_mappings: Vec::new(),
            conflict_path: None,
            reason: Some(reason.to_string()),
            transform_fn: Some(transform_fn.to_string()),
            transform_used: true,
        }
    }

    fn incompatible(reason: &str, conflict_path: Option<String>, total_units: usize) -> Self {
        Self {
            matched_units: 0,
            total_units,
            missing_fields: Vec::new(),
            candidate_mappings: Vec::new(),
            conflict_path,
            reason: Some(reason.to_string()),
            transform_fn: None,
            transform_used: false,
        }
    }

    fn merge(&mut self, child: Self) {
        self.matched_units += child.matched_units;
        self.missing_fields.extend(child.missing_fields);
        self.candidate_mappings.extend(child.candidate_mappings);

        if self.conflict_path.is_none() {
            self.conflict_path = child.conflict_path;
        }
        if self.reason.is_none() {
            self.reason = child.reason;
        }
        if self.transform_fn.is_none() {
            self.transform_fn = child.transform_fn;
        }
        self.transform_used |= child.transform_used;
    }

    fn into_result(mut self) -> CompatibilityResult {
        let mut metadata = HashMap::new();
        let total_units = self.total_units.max(1);
        let unmatched_units = total_units.saturating_sub(self.matched_units);
        let matched_ratio = (self.matched_units as f64) / (total_units as f64);

        if self.missing_fields.is_empty() && unmatched_units == 0 {
            if self.transform_used {
                metadata.insert("matchedRatio".to_string(), json!(1.0));
                return CompatibilityResult {
                    level: CompatibilityLevel::Transform,
                    reason: self.reason,
                    missing_fields: Vec::new(),
                    candidate_mappings: Vec::new(),
                    conflict_path: None,
                    transform_fn: self.transform_fn,
                    metadata,
                };
            }

            return CompatibilityResult {
                level: CompatibilityLevel::Exact,
                reason: None,
                missing_fields: Vec::new(),
                candidate_mappings: Vec::new(),
                conflict_path: None,
                transform_fn: None,
                metadata,
            };
        }

        if self.matched_units == 0 && self.missing_fields.is_empty() {
            return CompatibilityResult {
                level: CompatibilityLevel::Incompatible,
                reason: self
                    .reason
                    .or_else(|| Some("type_mismatch_no_transform".to_string())),
                missing_fields: Vec::new(),
                candidate_mappings: Vec::new(),
                conflict_path: self.conflict_path,
                transform_fn: None,
                metadata,
            };
        }

        metadata.insert("matchedRatio".to_string(), json!(matched_ratio));
        metadata.insert(
            "matchedRequiredCount".to_string(),
            json!(self.matched_units),
        );
        metadata.insert("totalRequiredCount".to_string(), json!(total_units));
        metadata.insert("unmappedRequiredCount".to_string(), json!(unmatched_units));

        self.candidate_mappings.sort_by(|left, right| {
            right
                .confidence
                .total_cmp(&left.confidence)
                .then_with(|| left.target_path.cmp(&right.target_path))
        });
        self.candidate_mappings.dedup_by(|left, right| {
            left.source_path == right.source_path && left.target_path == right.target_path
        });

        CompatibilityResult {
            level: CompatibilityLevel::Partial,
            reason: Some("partial_field_match".to_string()),
            missing_fields: self.missing_fields,
            candidate_mappings: self.candidate_mappings,
            conflict_path: None,
            transform_fn: None,
            metadata,
        }
    }
}

fn connection_limit(port: &PortDefinition) -> Option<u32> {
    if port.multiple {
        port.max_connections
    } else {
        Some(1)
    }
}

fn connection_incompatible(reason: &str) -> CompatibilityResult {
    ComparisonState::incompatible(reason, None, 1).into_result()
}

fn scalar_schema(kind: PortDataType, description: Option<String>, nullable: bool) -> TypeSchema {
    TypeSchema::Scalar(ScalarTypeSchema {
        kind,
        format: None,
        examples: Vec::new(),
        title: None,
        description,
        nullable,
    })
}

fn count_units(schema: &TypeSchema) -> usize {
    match schema {
        TypeSchema::Scalar(_) => 1,
        TypeSchema::Object(object_schema) => {
            if object_schema.properties.is_empty() {
                1
            } else {
                object_schema
                    .properties
                    .values()
                    .map(count_units)
                    .sum::<usize>()
                    .max(1)
            }
        }
        TypeSchema::Array(array_schema) => count_units(array_schema.items.as_ref()).max(1),
    }
}

fn collect_source_paths(schema: &TypeSchema, path: &str) -> Vec<String> {
    let mut paths = Vec::new();
    collect_source_paths_inner(schema, path, &mut paths);
    paths
}

fn collect_source_paths_inner(schema: &TypeSchema, path: &str, paths: &mut Vec<String>) {
    match schema {
        TypeSchema::Scalar(_) => {
            if !path.is_empty() {
                paths.push(path.to_string());
            }
        }
        TypeSchema::Object(object_schema) => {
            for (field_name, child) in &object_schema.properties {
                let child_path = join_path(path, field_name);
                paths.push(child_path.clone());
                collect_source_paths_inner(child, &child_path, paths);
            }
        }
        TypeSchema::Array(array_schema) => {
            let child_path = join_array_path(path);
            if !child_path.is_empty() {
                paths.push(child_path.clone());
            }
            collect_source_paths_inner(array_schema.items.as_ref(), &child_path, paths);
        }
    }
}

fn field_similarity(source_path: &str, target_path: &str) -> f64 {
    let source_segment = last_segment(source_path);
    let target_segment = last_segment(target_path);
    let normalized_source = normalize_segment(source_segment);
    let normalized_target = normalize_segment(target_segment);

    if normalized_source.is_empty() || normalized_target.is_empty() {
        return 0.0;
    }
    if source_path == target_path {
        return 1.0;
    }
    if normalized_source == normalized_target {
        return 0.95;
    }
    if normalized_source.contains(&normalized_target)
        || normalized_target.contains(&normalized_source)
    {
        return 0.8;
    }

    let overlap = token_overlap(&normalized_source, &normalized_target);
    if overlap > 0.0 {
        return overlap;
    }

    0.0
}

fn token_overlap(left: &str, right: &str) -> f64 {
    let left_tokens = split_tokens(left);
    let right_tokens = split_tokens(right);
    let matches = left_tokens
        .iter()
        .filter(|token| right_tokens.iter().any(|candidate| candidate == *token))
        .count();

    if matches == 0 {
        return 0.0;
    }

    (matches as f64) / (left_tokens.len().max(right_tokens.len()) as f64)
}

fn split_tokens(value: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();

    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            current.push(character);
        } else if !current.is_empty() {
            tokens.push(current.clone());
            current.clear();
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }

    if tokens.is_empty() {
        tokens.push(value.to_string());
    }

    tokens
}

fn normalize_segment(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(|character| character.to_lowercase())
        .collect()
}

fn last_segment(path: &str) -> &str {
    path.rsplit('.').next().unwrap_or(path)
}

fn join_path(base: &str, segment: &str) -> String {
    if base.is_empty() {
        segment.to_string()
    } else {
        format!("{base}.{segment}")
    }
}

fn join_array_path(base: &str) -> String {
    if base.is_empty() {
        "[]".to_string()
    } else {
        format!("{base}[]")
    }
}

fn conflict_path(path: &str) -> String {
    if path.is_empty() {
        "root".to_string()
    } else {
        format!("root.{path}")
    }
}

fn kind_conflict_path(path: &str) -> String {
    format!("{}.kind", conflict_path(path))
}

fn shape_conflict_path(path: &str) -> String {
    format!("{}.shape", conflict_path(path))
}
