create table api_keys
(
    key            uuid      default gen_random_uuid() not null primary key,
    created_at     timestamp default current_timestamp,
    comment        text
        constraint api_keys_pk unique,
    data_access    boolean   default false             not null,
    disabled       boolean   default false             not null,
    esports_ingest boolean   default false             not null
);

insert into api_keys (key, comment, data_access, disabled, esports_ingest)
values ('fffd6bfd-2be9-4b7e-ab76-a9d1dca19b64', 'Test Key', true, false, false);

create table api_key_limits
(
    key         uuid                                  not null
        constraint limits_key_fkey references public.api_keys,
    path        text                                  not null,
    rate_limit  integer  default 10                   not null,
    rate_period interval default '00:00:01'::interval not null,
    constraint limits_pkey primary key (key, path)
);

insert into api_key_limits (key, path, rate_limit, rate_period)
values ('fffd6bfd-2be9-4b7e-ab76-a9d1dca19b64', 'sql', 100, '00:00:01'::interval);
