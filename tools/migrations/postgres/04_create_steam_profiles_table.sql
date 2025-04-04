DROP TABLE IF EXISTS steam_profiles;
DROP TYPE IF EXISTS steam_personastate;

CREATE TABLE IF NOT EXISTS steam_profiles
(
    account_id INTEGER PRIMARY KEY,
    personaname VARCHAR(255),
    profileurl TEXT,
    avatar TEXT,
    avatarmedium TEXT,
    avatarfull TEXT,
    personastate INTEGER,
    communityvisibilitystate INTEGER,
    realname VARCHAR(255),
    loccountrycode VARCHAR(8) NULL,
    last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION update_steam_profiles_last_updated()
    RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_steam_profiles_last_updated
    BEFORE UPDATE ON steam_profiles
    FOR EACH ROW
EXECUTE FUNCTION update_steam_profiles_last_updated();

