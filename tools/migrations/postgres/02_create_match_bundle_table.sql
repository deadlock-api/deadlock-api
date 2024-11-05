DROP TABLE IF EXISTS match_bundle;

CREATE TABLE IF NOT EXISTS match_bundle
(
    path TEXT PRIMARY KEY,
    match_ids BIGINT [],
    manifest_path TEXT,
    created_at TIMESTAMP DEFAULT now()
);
