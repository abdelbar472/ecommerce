# SQL Learning Guide (with this project)

Use the Postgres container from `docker-compose.yml`.

## 1. Start Postgres

```bash
docker compose up -d postgres
```

## 2. Open psql inside the container

```bash
docker exec -it fk-postgres-1 psql -U postgres -d users
```

## 3. Core commands inside psql

```sql
\l                  -- list databases
\dt                 -- list tables
\d users            -- describe users table
\q                  -- quit
```

## 4. Practice path (do in order)

### Level 1 – SELECT basics
```sql
SELECT * FROM users;
SELECT email, full_name FROM users;
SELECT email FROM users WHERE is_active = TRUE;
SELECT * FROM users ORDER BY created_at DESC LIMIT 5;
```

### Level 2 – Filtering & sorting
```sql
SELECT * FROM users WHERE email LIKE '%@example.com';
SELECT * FROM users WHERE created_at > NOW() - INTERVAL '7 days';
SELECT email FROM users ORDER BY email ASC;
```

### Level 3 – Aggregates
```sql
SELECT COUNT(*) AS total_users FROM users;
SELECT COUNT(*) FILTER (WHERE is_active) AS active_users FROM users;
SELECT DATE(created_at) AS day, COUNT(*) AS signups
FROM users
GROUP BY day
ORDER BY day DESC;
```

### Level 4 – INSERT / UPDATE / DELETE (careful)
```sql
-- Prefer using the Auth API for real inserts.
-- Practice only on throwaway rows if you insert manually.

UPDATE users SET full_name = 'Test User' WHERE email = 'alice@example.com';
SELECT * FROM users WHERE email = 'alice@example.com';
```

### Level 5 – Joins
The `users` and `orders` tables live in **separate databases**, so a plain
SQL join across them isn't possible without `postgres_fdw`/`dblink`.
For a combined view, use the Analytics API:

```sql
-- Run inside the `orders` db to see orders per customer:
SELECT user_email, COUNT(*) AS orders, SUM(total) AS spent
FROM orders
GROUP BY user_email
ORDER BY spent DESC
LIMIT 10;
```

Compare that with `GET /analytics/top-customers`.

## 5. Point Auth Service at Postgres

The Auth Service defaults to the `users` database, so this is optional:

```bash
# Windows PowerShell
$env:DATABASE_URL="postgresql+psycopg2://postgres:postgres@localhost:5432/users"
$env:JWT_SECRET="kafka-demo-secret"

python -m uvicorn auth:app --port 8004 --reload
```

```bash
# Linux / macOS
export DATABASE_URL="postgresql+psycopg2://postgres:postgres@localhost:5432/users"
export JWT_SECRET="kafka-demo-secret"
python -m uvicorn auth:app --port 8004 --reload
```

Then register a user via API — the row appears in the `users` table. Query it with SQL.

## 6. Useful one-liners from host

```bash
docker exec -it fk-postgres-1 psql -U postgres -d users -c "\dt"
docker exec -it fk-postgres-1 psql -U postgres -d users -c "SELECT email, created_at FROM users;"
```
