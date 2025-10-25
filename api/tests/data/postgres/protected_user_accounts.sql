DROP TABLE IF EXISTS protected_user_accounts;

create table protected_user_accounts (
    steam_id   integer not null primary key,
    created_at timestamp default now(),
    updated_at timestamp default now()
);

INSERT INTO protected_user_accounts (steam_id) VALUES (98347892);
