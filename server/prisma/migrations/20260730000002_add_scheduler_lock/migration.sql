-- Lease table that lets exactly one instance run each scheduled tick.
--
-- Why not pg_try_advisory_lock: DATABASE_URL points at the Supabase pooler, which
-- runs in transaction pooling mode. Session-scoped advisory locks are tied to a
-- backend connection that PgBouncer hands to a different client after each
-- transaction, so the lock would be held by an arbitrary process and released at an
-- arbitrary time. A lease row is claimed by a single atomic statement, so it is
-- correct regardless of pooling, and a crashed instance frees it when the lease
-- expires rather than deadlocking the scheduler forever.

CREATE TABLE IF NOT EXISTS "SchedulerLock" (
    "name"        TEXT         NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "owner"       TEXT         NOT NULL,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchedulerLock_pkey" PRIMARY KEY ("name")
);
