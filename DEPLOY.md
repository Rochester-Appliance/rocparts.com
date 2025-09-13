## Deployment plan for rocparts.com

This document captures the exact steps to deploy the current app using Render (backend + static frontend) and point the DreamHost domain to both services.

### Repo layout
- Backend (Node/Express): `vandv-app/backend`
- Frontend (static): `vandv-app/frontend`

### 1) Prerequisites
- GitHub repository: `https://github.com/Rochester-Appliance/rocparts.com.git`
- Stripe keys (test or live):
  - `STRIPE_PUBLISHABLE_KEY`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET` (after webhook is created)
- Chosen domain subdomains:
  - Frontend: `www.rocparts.com` (or use apex)
  - API: `api.rocparts.com`

### 2) Backend on Render (Web Service)
1. Render Dashboard → New → Web Service → Connect the GitHub repo.
2. Root Directory: `vandv-app/backend`
3. Runtime: Node; Start command: `node index.js` (no build command needed)
4. Environment variables:
   - `STRIPE_PUBLISHABLE_KEY=...`
   - `STRIPE_SECRET_KEY=...`
   - `STRIPE_WEBHOOK_SECRET=...` (add after step 5)
   - `CURRENCY=usd`
   - `PUBLIC_BASE_URL=https://api.rocparts.com`
5. Deploy; note the temporary Render URL (e.g., `https://<service>.onrender.com`).

### 3) Frontend on Render (Static Site)
1. Render → New → Static Site → Connect same repo.
2. Publish directory: `vandv-app/frontend` (no build command required)
3. Deploy; note the temporary URL (e.g., `https://<site>.onrender.com`).

### 4) DreamHost DNS (point the domain to Render)
- In DreamHost panel → DNS for `rocparts.com`:
  - CNAME `www` → `<frontend>.onrender.com`
  - CNAME `api` → `<backend>.onrender.com`
  - (Optional) Redirect apex `rocparts.com` → `www.rocparts.com` using DreamHost controls.
- In Render (each service → Settings → Custom Domains):
  - Add `www.rocparts.com` to the frontend
  - Add `api.rocparts.com` to the backend
  - Wait for Render to issue TLS certs.

### 5) Stripe URLs & webhook
- Backend already generates:
  - `success_url = PUBLIC_BASE_URL/stripe/success/{CHECKOUT_SESSION_ID}`
  - `cancel_url = PUBLIC_BASE_URL/stripe/cancel`
- Stripe Dashboard → Developers → Webhooks → Add endpoint:
  - Endpoint: `https://api.rocparts.com/api/stripe/webhook`
  - Events: `checkout.session.completed`
  - Copy the Signing secret → set `STRIPE_WEBHOOK_SECRET` in Render env → redeploy.

### 6) Frontend production API base
- `frontend/script.js` auto-selects:
  - Local dev: `http://localhost:3001`
  - Production: `https://api.rocparts.com`

### 7) CORS
- For demo we allow all; to tighten later, allow only:
  - `https://www.rocparts.com`
  - `https://rocparts.com`

### 8) Verification checklist
- Frontend loads on `www.rocparts.com`.
- Parts and diagrams calls succeed against `api.rocparts.com`.
- Checkout redirects to Stripe and back to `/stripe/success/{sessionId}` with receipt link.
- Webhook logs receipt of `checkout.session.completed` (if enabled).

### Change log
- 2025-09-13: Initial Render + DreamHost DNS guide, PUBLIC_BASE_URL, dynamic API base.


