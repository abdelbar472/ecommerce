-- Kafka Demo - PostgreSQL initialization
-- Each service owns its own database. Client + Merchant share `market_db`
-- (shared catalog + orders) so merchant products are visible to clients and
-- client orders are visible to merchants.
--
-- Tables are created automatically by the services (SQLAlchemy create_all),
-- so this script only needs to create the databases.

CREATE DATABASE orders;
CREATE DATABASE notifications;
CREATE DATABASE analytics;
CREATE DATABASE users;
CREATE DATABASE market_db;   -- shared by Client (8006) + Merchant (8007)
CREATE DATABASE admin_db;    -- Admin service (8008)

-- Existing installs: make sure the users table has a role column.
\c users;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS role VARCHAR NOT NULL DEFAULT 'client';
