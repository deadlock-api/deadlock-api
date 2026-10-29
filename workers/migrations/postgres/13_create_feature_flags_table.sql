-- Runtime feature flags of the api (api/src/services/feature_flags.rs). The api runs this file
-- itself on startup and registers every documented route and every flag declared in code, and an
-- undocumented route on its first request, so a new endpoint or flag gets its row on its first
-- deploy. Rows only need editing; every replica picks a change up within 10 s:
--   UPDATE feature_flags SET enabled = false, disabled_reason = 'Steam is down' WHERE key = '/v1/matches/{match_id}/salts';
-- Route flags are keyed by the axum route path, other flags by their snake_case name.
CREATE TABLE IF NOT EXISTS feature_flags
(
    key             TEXT PRIMARY KEY,
    -- route | feature | job
    kind            TEXT        NOT NULL,
    enabled         BOOLEAN     NOT NULL,
    -- Owned by the code: rewritten on every registration.
    description     TEXT,
    -- Shown to clients of a disabled route.
    disabled_reason TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Last change of enabled or disabled_reason.
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Last registration by a running api; flags of removed routes and code stop advancing.
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION feature_flags_touch_updated_at() RETURNS TRIGGER AS
$$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER feature_flags_touch_updated_at
    BEFORE UPDATE
    ON feature_flags
    FOR EACH ROW
    WHEN (OLD.enabled IS DISTINCT FROM NEW.enabled OR OLD.disabled_reason IS DISTINCT FROM NEW.disabled_reason)
EXECUTE FUNCTION feature_flags_touch_updated_at();
