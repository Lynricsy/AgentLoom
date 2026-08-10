# AgentLoom

AgentLoom is a multi-agent workflow orchestration platform for designing, running, governing, and sharing AI agents, workflows, generated applications, plugins, skills, and knowledge-powered automations.

The project combines a visual DAG workflow canvas, standalone agent conversations, sandboxed and in-process runtimes, signed plugin execution, generated apps from natural language, enterprise governance surfaces, and both web and mobile clients.

## Capabilities

- Visual workflow canvas for composing AI agents, tools, knowledge, memory, conditions, loops, triggers, and typed connections into DAG workflows.
- Workflow execution with BullMQ-backed scheduling, resumable state, intervention handling, evidence capture, and real-time Socket.IO monitoring.
- Standalone agents with versioned definitions, conversations, sandbox or no-sandbox runtime modes, Skills, memory, knowledge, MCP tools, and self-evolution approval boundaries.
- Natural-language generated apps that produce AppSpecs, acceptance scenarios, controlled source artifacts, gate evidence, previews, public runtime links, submissions, and publish-readiness checks.
- Sandboxed coding/runtime surfaces through `agentloom/sandbox:latest`, plus in-process agent execution for `no_sandbox` agents.
- Signed `.alp` plugin ecosystem with SDK, CLI, marketplace flows, RSA-PSS archive verification, and Extism WASM sandbox execution.
- `SKILL.md` based Skills that can be injected into sandbox and no-sandbox agent runtimes.
- Knowledge and RAG features backed by document parsing, vector indexing, retrieval, reranking, and query orchestration.
- Agent memory, MCP integrations, marketplace/discover/share workflows, public share links, and private generated-app runtime links.
- Evidence, audit logs, resource governance, optimization suggestions, monitoring dashboards, private deployment settings, and operational controls.
- Web Studio and Flutter mobile clients for cross-device creation, execution, monitoring, and resource management.

## Repository Layout

This is a non-standard monorepo. There is no `pnpm-workspace.yaml`; each package owns its own dependency lockfile and commands.

```text
AgentLoom/
├── agentloom-server/          # NestJS 11 + Fastify 5 backend
├── agentloom-studio/          # React 19 + Vite 7 web Studio
├── agentloom-docs/            # VitePress 2 documentation site
├── agentloom-deploy/          # Docker Compose, Helm, env templates, ops scripts
├── agentloom-type-engine/     # Rust/WASM port compatibility engine
├── agentloom-plugin-sdk/      # TypeScript plugin SDK
├── agentloom-plugin-cli/      # Plugin scaffolding/build/publish CLI
├── agentloom-plugin-template/ # Example plugin template
├── agentloom_mobile/          # Flutter mobile application
├── Logo/                      # Source brand assets
├── docker-compose.dev.yml     # Development Qdrant only
└── package.json               # Root utility dependency only
```

## Architecture Overview

Studio and Mobile call the server through REST under `/api/v1` and through Socket.IO namespaces for real-time execution, notifications, knowledge, memory, and agent conversation updates.

```text
agentloom-studio  ─┐
                   ├─ REST /api/v1 + Socket.IO ─► agentloom-server
agentloom_mobile  ─┘

agentloom-server ─► PostgreSQL/Supabase  # tenancy, definitions, execution records
                 ├► Redis/BullMQ         # queues, schedulers, workers
                 ├► Qdrant               # vector search
                 ├► MinIO                # artifacts, documents, plugin archives
                 ├► agentloom/sandbox    # sandbox agent/runtime workspaces
                 └► Extism WASM sandbox  # plugin execution
```

At runtime, the server is the authority for authentication, tenancy, workflow and agent definitions, execution orchestration, plugin registration, generated-app readiness gates, public runtime boundaries, evidence, audit, and governance. Studio and Mobile are clients over those contracts rather than separate backend runtimes.

Within the server, side-effectful orchestration remains in NestJS services and workers. Generated-app gate plans, workflow node value/condition/runtime-input handling, and agent-conversation metadata/config/prompt normalization live in sibling pure helper modules so they can evolve independently of database, queue, and runtime coordination.

## Tech Stack

| Package | Stack |
| --- | --- |
| `agentloom-server` | NestJS 11, Fastify 5, TypeScript, Drizzle ORM, PostgreSQL/Supabase, Redis, BullMQ, Socket.IO, Qdrant, MinIO, Vercel AI SDK, Extism, Vitest |
| `agentloom-studio` | React 19, Vite 7, TypeScript 5.9, TanStack Router, TanStack Query, Zustand, Tailwind CSS v4, Radix UI, React Flow, ky, Socket.IO client, Vitest |
| `agentloom-docs` | VitePress 2, OpenAPI rendering, Mermaid, bilingual documentation content |
| `agentloom-deploy` | Docker Compose, Nginx, Helm, environment templates, PostgreSQL and MinIO backup/restore scripts |
| `agentloom-type-engine` | Rust 2024, wasm-bindgen, serde, Criterion, WASM package artifacts |
| `agentloom-plugin-sdk` | TypeScript, Zod 3, tsup dual ESM/CJS output, RSA-PSS signing helpers, Vitest |
| `agentloom-plugin-cli` | TypeScript, Commander, prompts, archiver, Express dev server, tsup, Vitest |
| `agentloom-plugin-template` | Example text transform plugin using the SDK |
| `agentloom_mobile` | Flutter 3.41.2, Riverpod, GoRouter, Dio, Socket.IO client, Firebase Messaging |

## Development Quick Start

Use the package directory that matches the surface you are changing. The repository root is not a workspace orchestrator.

### Shared Services

`docker-compose.dev.yml` starts only Qdrant. PostgreSQL/Supabase, Redis, and MinIO must be provided separately for full server development, or started through the private deployment assets.

```bash
docker compose -f docker-compose.dev.yml up -d
```

### Server

```bash
cd agentloom-server
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm db:seed
pnpm start:dev
```

Useful checks:

```bash
pnpm test
pnpm test:e2e
pnpm test:cov
pnpm openapi:export
pnpm sdk:generate
```

### Studio

```bash
cd agentloom-studio
pnpm install
cp .env.example .env
pnpm dev
```

Useful checks:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

### Documentation Site

```bash
cd agentloom-docs
pnpm install
pnpm dev
pnpm build
```

### Type Engine

```bash
cd agentloom-type-engine
cargo test
wasm-pack build --target bundler --release
```

### Plugin SDK

```bash
cd agentloom-plugin-sdk
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

### Plugin CLI

```bash
cd agentloom-plugin-cli
pnpm install
pnpm test
pnpm build
```

### Plugin Template

```bash
cd agentloom-plugin-template
pnpm install
pnpm test
pnpm build
```

### Mobile

The mobile app is pinned to Flutter 3.41.2. Use `fvm` if that is how your local machine selects Flutter versions.

```bash
cd agentloom_mobile
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter analyze
flutter test
```

## Deployment

Private deployment assets live in `agentloom-deploy/`.

Start with [`agentloom-deploy/README.md`](agentloom-deploy/README.md) for Docker Compose, Helm, environment templates, backup/restore scripts, and the current deployment topology. The production Compose entrypoint exposes Studio, API, Socket.IO, Supabase Auth proxying, PostgreSQL, Redis, MinIO, Qdrant, and server/worker deployment units behind Nginx.

## Documentation

- Product and platform docs: `agentloom-docs/`
- Backend details and API generation: `agentloom-server/README.md`
- Web Studio details: `agentloom-studio/README.md`
- Mobile app details: `agentloom_mobile/README.md`
- Deployment operations: `agentloom-deploy/README.md`
- Package-level architecture notes: each package's `AGENTS.md`

## License

AgentLoom is licensed under the GNU General Public License v3.0 only. See [`LICENSE`](LICENSE).
