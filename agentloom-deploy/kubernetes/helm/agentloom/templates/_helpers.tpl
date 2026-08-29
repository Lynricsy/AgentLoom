{{- define "agentloom.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "agentloom.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "agentloom.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "agentloom.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "agentloom.labels" -}}
helm.sh/chart: {{ include "agentloom.chart" . }}
app.kubernetes.io/name: {{ include "agentloom.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "agentloom.selectorLabels" -}}
app.kubernetes.io/name: {{ include "agentloom.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "agentloom.serverFullname" -}}
{{- printf "%s-server" (include "agentloom.fullname" .) -}}
{{- end -}}

{{- define "agentloom.workerFullname" -}}
{{- printf "%s-worker" (include "agentloom.fullname" .) -}}
{{- end -}}

{{- define "agentloom.studioFullname" -}}
{{- printf "%s-studio" (include "agentloom.fullname" .) -}}
{{- end -}}

{{- define "agentloom.firecrackerRuntimeFullname" -}}
{{- printf "%s-firecracker-runtime" (include "agentloom.fullname" .) -}}
{{- end -}}

{{- define "agentloom.firecrackerRuntimeHeadlessFullname" -}}
{{- printf "%s-firecracker-runtime-headless" (include "agentloom.fullname" .) -}}
{{- end -}}

{{- define "agentloom.postgresFullname" -}}
{{- printf "%s-postgres" (include "agentloom.fullname" .) -}}
{{- end -}}

{{- define "agentloom.redisFullname" -}}
{{- printf "%s-redis" (include "agentloom.fullname" .) -}}
{{- end -}}

{{- define "agentloom.minioFullname" -}}
{{- printf "%s-minio" (include "agentloom.fullname" .) -}}
{{- end -}}

{{- define "agentloom.qdrantFullname" -}}
{{- printf "%s-qdrant" (include "agentloom.fullname" .) -}}
{{- end -}}

{{- define "agentloom.serverImage" -}}
{{- printf "%s:%s" .Values.server.image.repository .Values.server.image.tag -}}
{{- end -}}

{{- define "agentloom.studioImage" -}}
{{- printf "%s:%s" .Values.studio.image.repository .Values.studio.image.tag -}}
{{- end -}}

{{- define "agentloom.runtimeCommand" -}}
{{- toYaml .Values.server.command -}}
{{- end -}}

{{- define "agentloom.databaseUrl" -}}
{{- if .Values.env.shared.APP_DATABASE_URL -}}
{{- .Values.env.shared.APP_DATABASE_URL -}}
{{- else if .Values.postgres.enabled -}}
{{- printf "postgresql://%s:%s@%s:%v/%s" .Values.postgres.auth.user .Values.postgres.auth.password (include "agentloom.postgresFullname" .) .Values.postgres.service.port .Values.postgres.auth.database -}}
{{- else -}}
{{- fail "env.shared.APP_DATABASE_URL must be set when postgres.enabled=false" -}}
{{- end -}}
{{- end -}}

{{- define "agentloom.redisUrl" -}}
{{- if .Values.env.shared.APP_REDIS_URL -}}
{{- .Values.env.shared.APP_REDIS_URL -}}
{{- else if .Values.redis.enabled -}}
{{- printf "redis://:%s@%s:%v/0" .Values.redis.auth.password (include "agentloom.redisFullname" .) .Values.redis.service.port -}}
{{- else -}}
{{- fail "env.shared.APP_REDIS_URL must be set when redis.enabled=false" -}}
{{- end -}}
{{- end -}}

{{- define "agentloom.minioEndpoint" -}}
{{- if .Values.env.shared.APP_MINIO_ENDPOINT -}}
{{- .Values.env.shared.APP_MINIO_ENDPOINT -}}
{{- else if .Values.minio.enabled -}}
{{- include "agentloom.minioFullname" . -}}
{{- else -}}
{{- fail "env.shared.APP_MINIO_ENDPOINT must be set when minio.enabled=false" -}}
{{- end -}}
{{- end -}}

{{- define "agentloom.minioPort" -}}
{{- if .Values.env.shared.APP_MINIO_PORT -}}
{{- .Values.env.shared.APP_MINIO_PORT -}}
{{- else if .Values.minio.enabled -}}
{{- printf "%v" .Values.minio.service.apiPort -}}
{{- else -}}
{{- fail "env.shared.APP_MINIO_PORT must be set when minio.enabled=false" -}}
{{- end -}}
{{- end -}}

{{- define "agentloom.minioAccessKey" -}}
{{- if .Values.env.shared.APP_MINIO_ACCESS_KEY -}}
{{- .Values.env.shared.APP_MINIO_ACCESS_KEY -}}
{{- else if .Values.minio.enabled -}}
{{- .Values.minio.auth.rootUser -}}
{{- else -}}
{{- fail "env.shared.APP_MINIO_ACCESS_KEY must be set when minio.enabled=false" -}}
{{- end -}}
{{- end -}}

{{- define "agentloom.minioSecretKey" -}}
{{- if .Values.env.shared.APP_MINIO_SECRET_KEY -}}
{{- .Values.env.shared.APP_MINIO_SECRET_KEY -}}
{{- else if .Values.minio.enabled -}}
{{- .Values.minio.auth.rootPassword -}}
{{- else -}}
{{- fail "env.shared.APP_MINIO_SECRET_KEY must be set when minio.enabled=false" -}}
{{- end -}}
{{- end -}}

{{- define "agentloom.qdrantUrl" -}}
{{- if .Values.env.shared.APP_QDRANT_URL -}}
{{- .Values.env.shared.APP_QDRANT_URL -}}
{{- else if .Values.qdrant.enabled -}}
{{- printf "http://%s:%v" (include "agentloom.qdrantFullname" .) .Values.qdrant.service.httpPort -}}
{{- else -}}
{{- fail "env.shared.APP_QDRANT_URL must be set when qdrant.enabled=false" -}}
{{- end -}}
{{- end -}}
