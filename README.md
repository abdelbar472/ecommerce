# Kafka Demo - Microservices E-commerce

A Kafka + FastAPI + Next.js demo with **separate services per role** — `client`, `merchant`, `admin` — plus the core event services (`auth`, `order`, `notification`, `analytics`).

## Services

| Service | Port | Database | Responsibility |
|---|---|---|---|
| Auth | 8004 | `users` | Register/login (cx or seller), issues JWT with `role`, RBAC, admin user management |
| Order | 8001 | `orders` | Core order API + publishes `order.created` to Kafka |
| Notification | 8002 | `notifications` | Consumes `order.created` → notification inbox |
| Analytics | 8003 | `analytics` | Consumes `order.created` → revenue / top products / top customers |
| Client | 8006 | `market_db` | Customer (cx) dashboard: browse catalog by category/sub-category, buy, purchase history |
| Merchant | 8007 | `market_db` | Seller dashboard: add products with price + category/sub-category, own sales analytics, orders |
| Admin | 8008 | `admin_db` (+ catalog tables in `market_db`) | Admin dashboard: marketplace analytics, users/roles, categories & sub-categories, audit, metrics |
| Frontend | 3000 | — | Next.js UI with role-based navigation and dashboards |

Kafka: `localhost:9092` · PostgreSQL: `localhost:5432`

> **Why do Client and Merchant share `market_db`?** They are separate services with separate APIs, ports and dashboards, but they operate on the same marketplace data: a merchant creates a product and a client must immediately see and buy it. Sharing the catalog + order tables is the simplest correct way to model that. Admin keeps its own `admin_db` (audit, metrics) but reads **and writes** the shared catalog tables so the categories/sub-categories it creates are live for everyone. All other services keep their own databases.

## Folder Structure

```text
fk/
├── services/
│   ├── auth/           # main.py + security.py (shared JWT helpers + require_role)
│   ├── order/          # main.py
│   ├── notification/   # main.py
│   ├── analytics/      # main.py
│   ├── client/         # main.py  (client dashboard API)
│   ├── merchant/       # main.py  (merchant dashboard API)
│   └── admin/          # main.py  (admin dashboard API)
├── frontend/           # Next.js 16 app (App Router, plain CSS)
├── init-db/init.sql    # creates the PostgreSQL databases
├── start_services.bat / start_services.sh
├── start_frontend.bat / start_frontend.sh
├── start_all.bat      / start_all.sh
└── requirements.txt
```

## How Admin, Merchant and Client Connect

All three roles authenticate through the **Auth service**, which returns a JWT containing
`{ sub, email, role }`. Every service verifies that token locally with the shared
`JWT_SECRET` (`services/auth/security.py`) and enforces access with
`require_role(["..."])`.

```text
                 ┌──────────────────────┐
                 │  Auth Service :8004  │  issues JWT { sub, email, role }
                 └──────────┬───────────┘
        login / register    │    same JWT_SECRET shared by all services
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
 ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
 │ Client :8006│     │Merchant:8007│     │ Admin :8008 │
 │ role=client │     │role=merchant│     │ role=admin  │
 └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
        │  read/write        │  read/write        │ admin_db
        └─────────┬──────────┘                   │ (audit, global,
                  ▼                              │  metrics)
          ┌───────────────┐                      │
          │  market_db    │◄─────────────────────┘ reads global view
          │ categories    │
          │ products      │
          │ orders        │
          │ order_items   │
          └───────┬───────┘
                  │ order events
                  ▼
     Kafka ──► Notification :8002   (inbox per order)
           └─► Analytics   :8003   (revenue, top products/customers)
```

- **Client** (`role=client`, the "cx"): browses active products from `market_db` filtered by
  category / sub-category, places orders (validates stock and decrements it), and sees only
  their **own** purchase history.
- **Merchant** (`role=merchant`, the "seller"): adds products with a price and picks a
  category + optional sub-category in `market_db`, scoped by `merchant_id = token.sub`.
  Own analytics dashboard (revenue, items sold, top products, orders by status). Sees only
  orders containing their products and updates their status
  (`pending → confirmed → shipped → delivered → cancelled`).
- **Admin** (`role=admin`): creates users with any role and changes roles via Auth,
  manages the shared **categories / sub-categories** (written to `market_db` so sellers and
  customers see them immediately), and reviews marketplace analytics for every customer and
  seller (`/admin/dashboard`); audit logs and system metrics stay in `admin_db`.
- **Orders / Notifications / Analytics** (`8001–8003`): the Kafka event backbone. An order
  created through the Order API emits `order.created`; the Notification and Analytics
  services consume it independently to build the inbox and the aggregates.

Categories form a 2-level tree: a top-level category may have any number of sub-categories
(`categories.parent_id`), and a product optionally points at one sub-category
(`products.subcategory_id`). Admins create both kinds; sellers may add their own too.

RBAC summary:

| Action | Client (cx) | Merchant (seller) | Admin |
|---|---|---|---|
| Browse catalog | yes | yes | yes |
| Place order | yes | no (403) | no (403) |
| Manage own products | no | yes | yes |
| Manage categories / sub-categories | no | yes | yes |
| See merchant orders | no | own only | own only (scoped) |
| Manage users / roles | no | no | yes |
| Marketplace analytics | no | own sales only | everyone |
| Audit / metrics | no | no | yes |

Public self-registration creates a **cx** (customer) or a **seller** (merchant) — pick the
account type on the login page. Admin accounts are only ever created by an existing admin
in **Admin → Users** (`/admin/users`), which also promotes users via
`PATCH /auth/users/{id}/role`.

## Default Accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@example.com` | `admin123` |
| Seller (merchant) | self-register on the login page (account type = Seller) | — |
| Customer (cx) | self-register on the login page (account type = Customer) | — |

The admin is created automatically on Auth startup if no admin exists
(configurable with `ADMIN_EMAIL` / `ADMIN_PASSWORD`).

## Quick Start

Prerequisites: Docker (Kafka + PostgreSQL), Python 3.13+, Node 24+.

```powershell
# 1. Start infrastructure
docker compose up -d

# 2. First time only: create databases (tables are auto-created by services)
Get-Content .\init-db\init.sql | docker exec -i fk-postgres-1 psql -U postgres

# 3. Python deps
pip install -r requirements.txt
```

### Run everything

Windows:
```powershell
.\start_all.bat
```

Linux / macOS:
```bash
chmod +x start_*.sh
./start_all.sh
```

Or start back end and front end separately:
```powershell
.\start_services.bat     # all 7 FastAPI services
.\start_frontend.bat     # Next.js on http://localhost:3000
```

The scripts set `PYTHONIOENCODING=utf-8` and `PYTHONPATH=<root>;<root>/services`
so `python -m uvicorn services.<name>.main:app` resolves correctly.

### Run a single service

```powershell
$env:PYTHONIOENCODING="utf-8"
$env:PYTHONPATH="E:\codes\fk;E:\codes\fk\services"

python -m uvicorn services.auth.main:app         --port 8004 --reload
python -m uvicorn services.order.main:app        --port 8001
python -m uvicorn services.notification.main:app --port 8002 --reload
python -m uvicorn services.analytics.main:app    --port 8003 --reload
python -m uvicorn services.client.main:app       --port 8006 --reload
python -m uvicorn services.merchant.main:app     --port 8007 --reload
python -m uvicorn services.admin.main:app        --port 8008 --reload
```

## Using the App

1. Open [http://localhost:3000](http://localhost:3000) → redirected to `/login`.
2. Sign in as **admin** and open **Admin → Users** to create a merchant
   (or promote a registered client).
3. Sign in as the **merchant** → **My Products**: create a category + product.
4. Register/sign in as a **client** → **Shop**: the merchant's product is visible.
   Add it to the cart and place an order.
5. Back as the **merchant** → **My Orders**: the order is listed; update its status.
6. **Client** → **Orders** (client dashboard) shows the order and its status.
7. The Nav bar shows colored dots for every service's `/health`.

Frontend proxies `/api/*` to the services via `frontend/next.config.mjs`, so there is no CORS.

## API Docs (Swagger)

Auth http://localhost:8004/docs · Order http://localhost:8001/docs ·
Notification http://localhost:8002/docs · Analytics http://localhost:8003/docs ·
Client http://localhost:8006/docs · Merchant http://localhost:8007/docs ·
Admin http://localhost:8008/docs

## Configuration

- `JWT_SECRET` — shared by all services (must match).
- `DATABASE_URL` — Auth DB (default `.../users`).
- `DATABASE_URL_MARKET` — Client + Merchant DB (default `.../market_db`).
- `DATABASE_URL_ADMIN` — Admin DB (default `.../admin_db`).
- Order/Notification/Analytics use `DATABASE_URL` with their own defaults.
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — seed admin account.
