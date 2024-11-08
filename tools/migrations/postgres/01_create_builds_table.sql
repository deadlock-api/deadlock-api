CREATE TABLE IF NOT EXISTS hero_builds
(
    hero INTEGER,
    build_id INTEGER,
    version INTEGER,
    author_id INTEGER,
    favorites INTEGER,
    ignores INTEGER,
    reports INTEGER,
    updated_at TIMESTAMP,
    language INTEGER,
    data JSONB,

    PRIMARY KEY (hero, build_id, version)
);

CREATE INDEX hero_builds_author_id_index ON hero_builds (author_id);
