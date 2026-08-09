FROM golang:1.25.5-alpine3.23 AS manager-build
WORKDIR /src
COPY agentloom-firecracker-runtime/go.mod agentloom-firecracker-runtime/go.sum ./
RUN go mod download
COPY agentloom-firecracker-runtime/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o /out/runtime-manager ./cmd/runtime-manager \
    && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o /out/jailer-wrapper ./cmd/jailer-wrapper \
    && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o /out/preflight ./cmd/preflight
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o /out/sandbox-cutover ./cmd/sandbox-cutover
ARG TC_REDIRECT_TAP_VERSION=v0.0.0-20250516183331-34bf829e9a5c
RUN GOBIN=/out go install github.com/awslabs/tc-redirect-tap/cmd/tc-redirect-tap@${TC_REDIRECT_TAP_VERSION}

FROM alpine:3.23
RUN apk add --no-cache ca-certificates cni-plugins curl e2fsprogs iproute2 nftables util-linux \
    && addgroup -g 1000 -S firecracker \
    && adduser -u 1000 -S -D -H -G firecracker firecracker
COPY --from=manager-build /out/runtime-manager /usr/local/bin/runtime-manager
COPY --from=manager-build /out/jailer-wrapper /usr/local/bin/jailer-wrapper
COPY --from=manager-build /out/preflight /usr/local/bin/preflight
COPY --from=manager-build /out/sandbox-cutover /usr/local/bin/sandbox-cutover
COPY --from=manager-build /out/tc-redirect-tap /opt/cni/bin/tc-redirect-tap
COPY agentloom-deploy/firecracker/artifacts/ /opt/agentloom-firecracker/artifacts/
COPY agentloom-deploy/firecracker/network/ /etc/agentloom-firecracker/network/
RUN ln -s /opt/agentloom-firecracker/artifacts/firecracker /usr/local/bin/firecracker \
    && ln -s /opt/agentloom-firecracker/artifacts/jailer /usr/local/bin/jailer \
    && ln -s /var/lib/agentloom-firecracker/jailer /fc \
    && mkdir -p /var/lib/agentloom-firecracker /run/netns \
    && chmod 0755 /opt/cni/bin/tc-redirect-tap \
    && chmod 0700 /var/lib/agentloom-firecracker

ENTRYPOINT ["/usr/local/bin/runtime-manager"]
