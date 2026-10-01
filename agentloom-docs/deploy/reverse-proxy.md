---
docType: reference
---

# 反向代理

Compose 拓扑中 `reverse-proxy` 服务（镜像 `openresty/openresty:alpine`）是唯一对外的 Web 入口。配置文件是 `agentloom-deploy/nginx.conf`，以只读方式挂载到容器的 `/usr/local/openresty/nginx/conf/nginx.conf`；容器监听 80，宿主端口由 `NGINX_HTTP_PORT` 决定（默认 8080）。本页条目全部取自该文件。

## 路由

| location | 上游 | 超时 / 缓冲 | 附加行为 |
| --- | --- | --- | --- |
| `= /healthz` | 无（直接返回） | — | 返回 `200 ok`，`Content-Type: text/plain`；Compose 健康检查访问此路径 |
| `/socket.io/` | `server:3000` | `proxy_read_timeout` / `proxy_send_timeout` 3600s | HTTP/1.1，透传 `Upgrade` 与 `Connection`（WebSocket） |
| `/api/` | `server:3000` | 300s | `proxy_buffering off`、`proxy_cache off`、清空 `Accept-Encoding`，保证 SSE 流即时推送 |
| `/documentation/` | `docs:8081` | 默认 | 文档站，构建时 base 为 `/documentation/` |
| `/auth/` | `supabase-kong:8000` | 默认 | 透传 `apikey` 与 `Authorization` 头；Studio 未配置 `VITE_SUPABASE_URL` 时经此访问 GoTrue |
| `/docs` | `server:3000` | 默认 | server 的 Swagger UI |
| `/` | `studio:8080` | 默认 | `Cache-Control: no-cache, no-store, must-revalidate`，保证容器启动时注入的运行时变量生效 |
| `/assets/` | `studio:8080` | 默认 | `Cache-Control: public, max-age=31536000, immutable`（Vite 产物文件名带 hash） |

每个代理 location 都设置 `Host`、`X-Real-IP`、`X-Forwarded-For`、`X-Forwarded-Proto` 请求头。

## 全局设置

| 设置 | 值 |
| --- | --- |
| `client_max_body_size` | `50m` |
| `keepalive_timeout` | `65` |
| `resolver` | `127.0.0.11 ipv6=off valid=10s`（Docker 内置 DNS） |
| 安全响应头 | `X-Content-Type-Options: nosniff`、`X-Frame-Options: SAMEORIGIN`、`X-XSS-Protection: 1; mode=block`、`Referrer-Policy: strict-origin-when-cross-origin`、`Permissions-Policy: camera=(), microphone=(), geolocation=()` |

## 上游写法

所有上游都先赋值给变量，再用变量拼 `proxy_pass`：

```nginx
location /api/ {
    set $server_upstream server:3000;
    proxy_pass http://$server_upstream$request_uri;
}
```

`proxy_pass` 中含变量时，nginx 在每次请求时经 `resolver` 解析主机名，而不是只在启动时解析一次。容器重建后 IP 变化，入口不需要重启；某个上游（例如未启动 Supabase 时的 `supabase-kong`）不存在时，入口也能启动，只有访问对应路径时返回错误。新增上游时沿用这种写法。

## 外层 TLS

`agentloom-deploy/nginx.conf` 只监听 HTTP 80，不处理证书。公网部署在宿主上另起一层终止 TLS 的代理，把流量转给 `127.0.0.1:8080`。下面是外层 nginx 的最小 server 块，域名与证书路径换成你的值：

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name agentloom.example.com;

    ssl_certificate     /etc/ssl/agentloom/fullchain.pem;
    ssl_certificate_key /etc/ssl/agentloom/privkey.pem;

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

`proxy_buffering off` 与长超时让 SSE 和 Socket.IO 长连接穿过外层代理。启用公网域名后，同时把 `APP_FRONTEND_URL`、`APP_OAUTH_REDIRECT_URL`、`SUPABASE_SITE_URL`、`SUPABASE_GOTRUE_EXTERNAL_URL` 改成 HTTPS 域名，见 [配置参考](/deploy/configuration)。

外层代理用 `$proxy_add_x_forwarded_for` 追加了一层地址，因此在 `.env` 中把 `APP_TRUST_PROXY_HOPS` 改为 `2`，server 才能取到真实的客户端地址，见 [配置参考](/deploy/configuration) 中「来源 IP 与可信代理」。

## 相关

- [部署拓扑](/deploy/)：端口与网络
- [自托管 Supabase](/deploy/supabase)：`/auth/` 后面的服务
- Helm 部署不使用本文件，路由由 Ingress 提供，见 [Helm 部署](/deploy/helm)
