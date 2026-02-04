-- Patrons table for storing Patreon OAuth data and subscription info
create table if not exists patrons
(
    id
                        uuid
                                    default
                                        gen_random_uuid
                                        (
                                        )                     not null primary key,
    patreon_user_id     text                                  not null
        constraint patrons_patreon_user_id_unique unique,
    email               text,
    tier_id             text,
    pledge_amount_cents integer,
    is_active           boolean     default false             not null,
    access_token        text,
    refresh_token       text,
    token_expires_at    timestamptz,
    last_verified_at    timestamptz,
    created_at          timestamptz default current_timestamp not null,
    updated_at          timestamptz default current_timestamp not null
);

-- Prioritized Steam accounts linked to patrons
create table if not exists prioritized_steam_accounts
(
    id
               uuid
                           default
                               gen_random_uuid
                               (
                               )                     not null primary key,
    patron_id  uuid                                  null
        constraint prioritized_steam_accounts_patron_fkey references patrons
            (
             id
                ) on delete cascade,
    steam_id3  bigint                                not null,
    created_at timestamptz default current_timestamp not null,
    deleted_at timestamptz
);

-- Unique index on (patron_id, steam_id3) where deleted_at IS NULL
-- Prevents duplicate active accounts for the same patron
create unique index if not exists prioritized_steam_accounts_active_unique
    on prioritized_steam_accounts (patron_id, steam_id3)
    where deleted_at is null;

-- Index on steam_id3 where deleted_at IS NULL for quick prioritization lookups
create index if not exists prioritized_steam_accounts_steam_id3_active
    on prioritized_steam_accounts (steam_id3)
    where deleted_at is null;

-- Index on deleted_at where deleted_at IS NOT NULL for cleanup queries
create index if not exists prioritized_steam_accounts_deleted_at_cleanup
    on prioritized_steam_accounts (deleted_at)
    where deleted_at is not null;
