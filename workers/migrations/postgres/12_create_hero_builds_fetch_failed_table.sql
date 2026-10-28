-- Build ids seen in demos that the GC returned nothing for (private or deleted
-- builds). The builds-fetcher consults this so it only tries each id once.
CREATE TABLE IF NOT EXISTS hero_builds_fetch_failed
(
    build_id  INTEGER PRIMARY KEY,
    hero      INTEGER,
    failed_at TIMESTAMP NOT NULL DEFAULT now()
);
