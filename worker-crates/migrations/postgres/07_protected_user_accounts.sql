DROP TABLE IF EXISTS protected_user_accounts;

CREATE TABLE IF NOT EXISTS protected_user_accounts
(
    steam_id   INTEGER PRIMARY KEY,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);
