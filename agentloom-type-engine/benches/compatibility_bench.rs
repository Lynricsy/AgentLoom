use agentloom_type_engine::checker::check_compatibility;
use agentloom_type_engine::types::{
    ObjectTypeSchema, PortDataType, PortDefinition, PortDirection, ScalarTypeSchema, TypeSchema,
};
use criterion::{criterion_group, criterion_main, Criterion};
use std::collections::HashMap;

fn benchmark_object_compatibility(criterion: &mut Criterion) {
    let source = build_port("source", build_object_schema("source_", 10));
    let target = build_port("target", build_object_schema("source_", 10));

    criterion.bench_function("check_compatibility_10_fields", |bench| {
        bench.iter(|| check_compatibility(&source, &target));
    });
}

fn build_port(id: &str, schema: TypeSchema) -> PortDefinition {
    PortDefinition {
        id: id.to_string(),
        label: id.to_string(),
        direction: PortDirection::Output,
        data_type: PortDataType::Json,
        description: None,
        required: true,
        multiple: false,
        max_connections: Some(1),
        schema: Some(schema),
    }
}

fn build_object_schema(prefix: &str, count: usize) -> TypeSchema {
    let mut properties = HashMap::new();
    let mut required = Vec::new();

    for index in 0..count {
        let name = format!("{prefix}{index}");
        required.push(name.clone());
        properties.insert(name, scalar_schema(PortDataType::Text));
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

criterion_group!(benches, benchmark_object_compatibility);
criterion_main!(benches);
