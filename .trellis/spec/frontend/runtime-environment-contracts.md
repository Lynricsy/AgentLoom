# Runtime Environment Contracts

> Executable contracts for browser-facing runtime env resolution in private deployments.

---

## Scope

This guide covers the auth bootstrap path that spans:

- `agentloom-studio/src/shared/lib/supabase.ts`
- `agentloom-deploy/docker-compose.yml`
- `agentloom-deploy/docker-compose.supabase.yml`
- `agentloom-deploy/nginx.conf`
- `agentloom-deploy/.env.template`

Use this guide when changing any browser-facing auth base URL, reverse-proxy auth routing, or private deployment domain variables.

---

## Canonical Contract

### 1. Studio Supabase URL Resolution

File: `agentloom-studio/src/shared/lib/supabase.ts`

Contract:

- `VITE_SUPABASE_URL` may be an empty string in private deployments.
- In the browser, an empty `VITE_SUPABASE_URL` must resolve to `window.location.origin`.
- In the browser, if `VITE_SUPABASE_URL` points to a loopback host (`localhost`, `127.0.0.1`, `::1`) but `window.location.origin` is not loopback, Studio must ignore the configured loopback URL and use `window.location.origin`.
- Outside the browser (`typeof window === 'undefined'`), Studio must keep the configured value as-is and fail fast when the final URL or anon key is missing.

Why:

- A browser hitting `http://localhost:*` from a public page will call the visitor's own machine, not the deployment host.

### 2. Reverse-Proxy Auth Routing

File: `agentloom-deploy/nginx.conf`

Contract:

- `location /auth/` must proxy to `supabase-kong:8000`.
- Studio must therefore use the site origin, not the internal Supabase container URL, for browser auth requests.
- Internal server-to-Supabase traffic still uses `APP_SUPABASE_URL=http://supabase-kong:8000`.

### 3. Public-Domain Deployment Variables

Files:

- `agentloom-deploy/.env`
- `agentloom-deploy/.env.template`
- `agentloom-deploy/docker-compose.supabase.yml`

Public deployment requirements:

- `APP_FRONTEND_URL=https://<public-domain>`
- `APP_OAUTH_REDIRECT_URL=https://<public-domain>/api/v1/auth/oauth/callback`
- `SUPABASE_GOTRUE_EXTERNAL_URL=https://<public-domain>`
- `SUPABASE_SITE_URL=https://<public-domain>`
- `VITE_SUPABASE_URL=` (blank, so browser falls back to current origin)

Do not set browser-facing `VITE_SUPABASE_URL` to `http://localhost:8080` or `http://localhost:8000` on a public deployment.

---

## Validation Matrix

### Good

- Page origin: `https://agentloom.ling.plus`
- `VITE_SUPABASE_URL=`
- Browser request: `POST https://agentloom.ling.plus/auth/v1/token?grant_type=password`

### Also Valid

- Page origin: `http://localhost:5173`
- `VITE_SUPABASE_URL=http://localhost:8000`
- Local development browser request may still target `http://localhost:8000/auth/v1/*`

### Bad

- Page origin: `https://agentloom.ling.plus`
- `VITE_SUPABASE_URL=http://localhost:8080`
- Browser request becomes `http://localhost:8080/auth/v1/*`
- Result: login/signup/OAuth bootstrap fails from public clients

---

## Required Tests

### Unit

```bash
cd agentloom-studio
pnpm vitest run src/shared/lib/__tests__/supabase.test.ts
```

Must cover:

- Missing `VITE_SUPABASE_URL` in browser falls back to current origin
- Loopback `VITE_SUPABASE_URL` on a public origin falls back to current origin
- Missing URL outside browser still throws

### Build

```bash
cd agentloom-studio
pnpm typecheck
pnpm build
```

### Manual Browser Check

1. Open the public login page, for example `https://agentloom.ling.plus/login`.
2. Submit a valid email/password login.
3. Verify the auth request is `POST https://<public-domain>/auth/v1/token?grant_type=password`.
4. Verify no network request targets `localhost:8080` or `localhost:8000`.

### Runtime Container Checks

```bash
docker inspect agentloom-private-studio-1 --format '{{json .Config.Env}}'
docker inspect agentloom-private-server-1 --format '{{json .Config.Env}}'
docker inspect agentloom-private-supabase-auth-1 --format '{{json .Config.Env}}'
```

Expected assertions:

- Studio container shows `VITE_SUPABASE_URL=`
- Server container shows public `APP_FRONTEND_URL` and `APP_OAUTH_REDIRECT_URL`
- Supabase auth container shows public `API_EXTERNAL_URL` and `GOTRUE_SITE_URL`

---

## Change Checklist

- [ ] Updated `supabase.ts` and its unit tests together
- [ ] Updated deploy templates/docs together with runtime behavior
- [ ] Rebuilt Studio after changing runtime env resolution
- [ ] Recreated services whose env changed (`studio`, `server`, `worker`, `supabase-auth`)
