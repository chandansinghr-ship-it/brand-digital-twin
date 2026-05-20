# syntax=docker/dockerfile:1.7

# ── builder ──────────────────────────────────────────────────────────────────
FROM node:24-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Workspace manifests first so pnpm install is cached unless lockfile changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY tsconfig.base.json tsconfig.json ./

# tanmatra depends on lib/* workspace packages — copy all manifests before
# pnpm install so workspace resolution works, then overwrite with full source.
COPY artifacts/tanmatra/package.json    artifacts/tanmatra/
COPY lib/db/package.json                lib/db/
COPY lib/api-zod/package.json           lib/api-zod/
COPY lib/api-client-react/package.json  lib/api-client-react/
COPY lib/menu-catalog/package.json      lib/menu-catalog/
COPY lib/preferences-match/package.json lib/preferences-match/
COPY lib/integrations-gemini-ai/package.json lib/integrations-gemini-ai/
COPY lib/agency-agents/package.json     lib/agency-agents/

RUN pnpm install --frozen-lockfile --ignore-scripts

# Full source for lib packages (compiled in-place by tsc or bundled by vite).
COPY lib lib
# Full source for tanmatra (includes src/, public/, vite.config.ts, etc.).
COPY artifacts/tanmatra artifacts/tanmatra

# VITE_API_BASE is baked into the JS bundle at build time. Pass it as a build
# arg so CI can set the correct wellness-foods Cloud Run URL.
ARG VITE_API_BASE
# SPA mode (ssr:false) — produces build/client/ only (no build/server/).
RUN VITE_API_BASE="${VITE_API_BASE}" pnpm --filter @workspace/tanmatra run build

# ── runner ────────────────────────────────────────────────────────────────────
# Serve the static SPA with a minimal Node http server; no SSR bundle needed.
FROM node:24-slim AS runner

ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

COPY --from=builder /app/artifacts/tanmatra/build/client ./public

# Inline static server — serves SPA fallback (index.html) for all non-asset paths.
RUN printf '%s\n' \
  "const http=require('http'),fs=require('fs'),path=require('path');" \
  "const root=path.join(__dirname,'public');" \
  "http.createServer((req,res)=>{" \
  "  const u=req.url.split('?')[0];" \
  "  let f=path.join(root,u==='/'?'/index.html':u);" \
  "  if(!fs.existsSync(f)||fs.statSync(f).isDirectory())f=path.join(root,'index.html');" \
  "  const ext=path.extname(f);" \
  "  const ct={'html':'text/html','js':'application/javascript','css':'text/css','json':'application/json','svg':'image/svg+xml','png':'image/png','ico':'image/x-icon','webmanifest':'application/manifest+json'}[ext.slice(1)]||'application/octet-stream';" \
  "  res.writeHead(200,{'Content-Type':ct,'Cache-Control':ext==='.html'?'no-cache':'public,max-age=31536000,immutable'});" \
  "  fs.createReadStream(f).pipe(res);" \
  "}).listen(process.env.PORT||8080,()=>console.log('Serving on',process.env.PORT||8080));" \
  > server.js

RUN groupadd --system --gid 1001 app \
 && useradd  --system --uid 1001 --gid app --home /app app \
 && chown -R app:app /app
USER app

EXPOSE 8080

CMD ["node", "server.js"]
