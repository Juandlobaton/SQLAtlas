-- SQLAtlas initial database setup
-- Note: POSTGRES_USER is automatically the superuser and DB owner.
-- This script only creates extensions needed by the application.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
