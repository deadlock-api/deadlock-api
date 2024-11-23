create table webhooks
(
    subscription_id uuid not null primary key,
    api_key         uuid not null unique references api_keys (key),
    webhook_url     text not null,
    created_at      timestamp default current_timestamp
);
