import { assertNever, PORT_DATA_TYPES } from "./typeSchema";
import type {
  ObjectTypeSchema,
  PortDataType,
  ScalarTypeSchema,
  TypeSchema,
} from "./typeSchema";
import type {
  HydratablePortDefinition,
  NodeConfigFieldSchema,
  PortDefinition,
  PortDirection,
} from "./nodeTypeRegistry";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isPortDataType(value: unknown): value is PortDataType {
  return (
    typeof value === "string" &&
    (PORT_DATA_TYPES as readonly string[]).includes(value)
  );
}

export function isPortDirection(value: unknown): value is PortDirection {
  return value === "input" || value === "output";
}

export function isValidTypeSchema(schema: unknown): schema is TypeSchema {
  if (!isPlainRecord(schema) || !isPortDataType(schema.kind)) {
    return false;
  }

  if (schema.kind !== "json") {
    return true;
  }

  if (schema.shape === "object") {
    if (!isPlainRecord(schema.properties)) {
      return false;
    }

    return Object.values(schema.properties).every((property) =>
      isValidTypeSchema(property),
    );
  }

  if (schema.shape === "array") {
    return isValidTypeSchema(schema.items);
  }

  return false;
}

export function inferDataTypeFromSchema(schema: unknown): PortDataType | null {
  if (!isPlainRecord(schema) || !isPortDataType(schema.kind)) {
    return null;
  }

  if (schema.kind !== "json") {
    return schema.kind;
  }

  return schema.shape === "array"
    ? "array"
    : schema.shape === "object"
      ? "json"
      : null;
}

export function cloneTypeSchema(schema: TypeSchema): TypeSchema {
  switch (schema.kind) {
    case "json": {
      if (schema.shape === "object") {
        return {
          ...schema,
          properties: Object.fromEntries(
            Object.entries(schema.properties).map(([key, value]) => [
              key,
              cloneTypeSchema(value),
            ]),
          ),
          required: schema.required ? [...schema.required] : undefined,
        };
      }

      if (schema.shape === "array") {
        return {
          ...schema,
          items: cloneTypeSchema(schema.items),
        };
      }

      return assertNever(schema);
    }
    case "model":
    case "text":
    case "array":
    case "image":
    case "audio":
    case "tool":
    case "sandbox":
    case "knowledge":
    case "skill":
    case "agent":
    case "memory":
    case "exec":
    case "volume":
      return {
        ...schema,
        examples: schema.examples ? [...schema.examples] : undefined,
      };
    default:
      return assertNever(schema);
  }
}

type NonJsonPortDataType = Exclude<PortDataType, "json">;

export function createScalarSchema(
  kind: NonJsonPortDataType,
  title: string,
  description?: string,
): ScalarTypeSchema {
  return {
    kind,
    title,
    description,
  };
}

export function createJsonSchema(
  title: string,
  description?: string,
): ObjectTypeSchema {
  return {
    kind: "json",
    shape: "object",
    title,
    description,
    properties: {},
    additionalProperties: true,
  };
}

export function createArraySchema(
  title: string,
  description?: string,
): TypeSchema {
  return {
    kind: "json",
    shape: "array",
    title,
    description,
    items: createJsonSchema(`${title} Item`),
  };
}

export function createDefaultSchemaForDataType(
  dataType: PortDataType,
  title: string,
  description?: string,
): TypeSchema {
  if (dataType === "json") {
    return createJsonSchema(title, description);
  }

  if (dataType === "array") {
    return createArraySchema(title, description);
  }

  return createScalarSchema(dataType, title, description);
}

export interface CreatePortOptions {
  required?: boolean;
  multiple?: boolean;
  maxConnections?: number | null;
  acceptsAnyDataType?: boolean;
  description?: string;
  schema?: TypeSchema;
}

export function createPort(
  id: string,
  label: string,
  direction: PortDirection,
  dataType: PortDataType,
  options?: CreatePortOptions,
): PortDefinition {
  const schema =
    options?.schema ?? createDefaultSchemaForDataType(dataType, label);

  return {
    id,
    label,
    direction,
    dataType,
    acceptsAnyDataType: options?.acceptsAnyDataType,
    description: options?.description,
    required: options?.required ?? false,
    multiple: options?.multiple ?? false,
    maxConnections:
      options?.maxConnections !== undefined ? options.maxConnections : 1,
    schema,
  };
}

export function createExecInPort(description: string): PortDefinition {
  return createPort("exec-in", "", "input", "exec", {
    description,
  });
}

export function createExecOutPort(description: string): PortDefinition {
  return createPort("exec-out", "", "output", "exec", {
    description,
  });
}

export function createConfigField(
  type: NodeConfigFieldSchema["type"],
  title: string,
  options: Omit<NodeConfigFieldSchema, "type" | "title"> = {},
): NodeConfigFieldSchema {
  return {
    type,
    title,
    ...options,
  };
}

export function clonePortDefinitions(
  ports: PortDefinition[],
): PortDefinition[] {
  return ports.map((port) => ({
    ...port,
    schema: cloneTypeSchema(port.schema),
  }));
}

export function hydratePortDefinitions(
  ports: HydratablePortDefinition[],
  defaultPorts: readonly PortDefinition[] = [],
): PortDefinition[] {
  const defaultPortsById = new Map(defaultPorts.map((port) => [port.id, port]));

  return ports.map((port) => {
    const defaultPort = defaultPortsById.get(port.id);
    const label =
      typeof port.label === "string" && port.label.trim().length > 0
        ? port.label
        : (defaultPort?.label ?? port.id);
    const description =
      typeof port.description === "string"
        ? port.description
        : defaultPort?.description;
    const dataType =
      defaultPort?.dataType ??
      (isPortDataType(port.dataType)
        ? port.dataType
        : (inferDataTypeFromSchema(port.schema) ?? "json"));
    const direction =
      defaultPort?.direction ??
      (isPortDirection(port.direction) ? port.direction : "input");

    return {
      id: port.id,
      label,
      direction,
      dataType,
      acceptsAnyDataType:
        typeof port.acceptsAnyDataType === "boolean"
          ? port.acceptsAnyDataType
          : defaultPort?.acceptsAnyDataType,
      description,
      required:
        typeof port.required === "boolean"
          ? port.required
          : (defaultPort?.required ?? false),
      multiple:
        typeof port.multiple === "boolean"
          ? port.multiple
          : (defaultPort?.multiple ?? false),
      maxConnections:
        port.maxConnections === null || typeof port.maxConnections === "number"
          ? port.maxConnections
          : (defaultPort?.maxConnections ?? 1),
      schema: defaultPort
        ? cloneTypeSchema(defaultPort.schema)
        : isValidTypeSchema(port.schema)
          ? cloneTypeSchema(port.schema)
          : createDefaultSchemaForDataType(dataType, label, description),
    };
  });
}
