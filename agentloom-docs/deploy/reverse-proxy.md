# Nginx 配置

AgentLoom 在两个场景中使用 Nginx：**应用反向代理**（Docker Compose 内置）和 **VitePress 文档站托管**。本文档重点介绍文档站的 Nginx 配置。

## 应用反向代理

Docker Compose 中的 `reverse-proxy` 服务使用内置的 `nginx.conf`，负责将请求路由到 Studio 和 Server。详见 [Docker Compose 部署](./docker)。

核心路由规则：

```nginx
# 健康检查
location /healthz {
    return 200 'ok';
}

# WebSocket — Socket.IO
location /socket.io/ {
    proxy_pass http://server;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;    # 长连接超时
    proxy_send_timeout 3600s;
}

# REST API
location /api/ {
    proxy_pass http://server;
}

# 前端 SPA
location / {
    proxy_pass http://studio;
}
```

## VitePress 文档站托管

以下配置用于独立部署 AgentLoom VitePress 文档站。

### 基础配置

```nginx
server {
    listen 80;
    server_name docs.agentloom.example.com;

    root /var/www/agentloom-docs;
    index index.html;

    # VitePress cleanUrls 兼容
    # 按顺序尝试：精确文件 → .html 后缀 → 目录 → 404
    location / {
        try_files $uri $uri.html $uri/ =404;
    }

    # 自定义 404 页面（VitePress 生成）
    error_page 404 /404.html;
}
```

::: tip cleanUrls 兼容
AgentLoom 文档站配置了 `cleanUrls: true`，URL 不包含 `.html` 后缀。`try_files` 的 `$uri.html` 规则确保 `/zh/guide/getting-started` 能正确映射到 `getting-started.html`。
:::

### 静态资源缓存

VitePress 构建产物中，`/assets/` 目录包含带 hash 的文件（如 `style.a1b2c3.css`），可以设置不可变缓存：

```nginx
# 带 hash 的静态资源 — 不可变缓存
location /assets/ {
    expires max;
    add_header Cache-Control "public, immutable";

    # 关闭访问日志减少 I/O
    access_log off;
}

# 其他静态文件 — 短期缓存
location ~* \.(ico|svg|png|jpg|jpeg|gif|webp|woff2?)$ {
    expires 7d;
    add_header Cache-Control "public";
    access_log off;
}

# HTML 文件 — 不缓存（确保内容更新即时生效）
location ~* \.html$ {
    expires -1;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
}
```

### Gzip 压缩

```nginx
# 启用 gzip 压缩
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_min_length 256;

gzip_types
    text/plain
    text/css
    text/xml
    text/javascript
    application/json
    application/javascript
    application/xml
    application/rss+xml
    image/svg+xml
    font/woff2;
```

### SSL/TLS 配置模板

```nginx
server {
    listen 443 ssl http2;
    server_name docs.agentloom.example.com;

    # SSL 证书
    ssl_certificate     /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    # TLS 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;

    root /var/www/agentloom-docs;
    index index.html;

    location / {
        try_files $uri $uri.html $uri/ =404;
    }

    location /assets/ {
        expires max;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    error_page 404 /404.html;
}

# HTTP → HTTPS 重定向
server {
    listen 80;
    server_name docs.agentloom.example.com;
    return 301 https://$server_name$request_uri;
}
```

### 完整配置示例

将以上各部分组合，形成完整的文档站 Nginx 配置：

```nginx
# /etc/nginx/nginx.conf 或 /etc/nginx/conf.d/agentloom-docs.conf

worker_processes auto;
events {
    worker_connections 1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;

    sendfile    on;
    tcp_nopush  on;
    tcp_nodelay on;

    keepalive_timeout 65;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 256;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml
        application/rss+xml
        image/svg+xml
        font/woff2;

    # SSL 安全
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # HTTPS 站点
    server {
        listen 443 ssl http2;
        server_name docs.agentloom.example.com;

        ssl_certificate     /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;

        add_header Strict-Transport-Security
            "max-age=63072000; includeSubDomains" always;

        root /var/www/agentloom-docs;
        index index.html;

        # VitePress cleanUrls
        location / {
            try_files $uri $uri.html $uri/ =404;
        }

        # 不可变静态资源
        location /assets/ {
            expires max;
            add_header Cache-Control "public, immutable";
            access_log off;
        }

        # 其他静态资源
        location ~* \.(ico|svg|png|jpg|jpeg|gif|webp|woff2?)$ {
            expires 7d;
            add_header Cache-Control "public";
            access_log off;
        }

        # HTML 不缓存
        location ~* \.html$ {
            expires -1;
            add_header Cache-Control "no-cache, no-store, must-revalidate";
        }

        error_page 404 /404.html;
    }

    # HTTP 重定向
    server {
        listen 80;
        server_name docs.agentloom.example.com;
        return 301 https://$server_name$request_uri;
    }
}
```

## 部署步骤

```bash
# 1. 构建 VitePress 文档
cd agentloom-docs && pnpm build

# 2. 复制构建产物到 Nginx 根目录
sudo mkdir -p /var/www/agentloom-docs
sudo cp -r .vitepress/dist/* /var/www/agentloom-docs/

# 3. 复制 Nginx 配置
sudo cp agentloom-docs.conf /etc/nginx/conf.d/

# 4. 测试配置
sudo nginx -t

# 5. 重新加载 Nginx
sudo systemctl reload nginx
```

## 安全加固建议

| 配置                              | 说明               |
| --------------------------------- | ------------------ |
| `server_tokens off`               | 隐藏 Nginx 版本号  |
| `X-Content-Type-Options: nosniff` | 禁止 MIME 嗅探     |
| `X-Frame-Options: DENY`           | 禁止 iframe 嵌入   |
| `Content-Security-Policy`         | 限制资源加载来源   |
| `Referrer-Policy: strict-origin`  | 控制 Referrer 泄露 |

```nginx
# 安全头示例
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

## 与 cert-manager 集成

在 Kubernetes 环境中，建议使用 cert-manager 自动管理 TLS 证书：

```yaml
# Ingress 注解（Helm values.yaml 中配置）
ingress:
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  tls:
    - secretName: agentloom-docs-tls
      hosts:
        - docs.agentloom.example.com
```

对于 Docker Compose 部署，推荐使用 [acme.sh](https://github.com/acmesh-official/acme.sh) 或 Certbot 管理 Let's Encrypt 证书。
