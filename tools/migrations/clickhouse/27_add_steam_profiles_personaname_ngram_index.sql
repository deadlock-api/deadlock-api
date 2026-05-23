ALTER TABLE steam_profiles
    ADD INDEX IF NOT EXISTS idx_personaname_ngram personaname_lc
        TYPE ngrambf_v1(3, 8192, 3, 0) GRANULARITY 4;

ALTER TABLE steam_profiles MATERIALIZE INDEX idx_personaname_ngram;
