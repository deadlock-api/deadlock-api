-- Website feedback / component annotations submitted anonymously from deadlock-api.com.
-- `source_*` and `component*` are resolved client-side from the build's annotation
-- manifest, so rows stay readable after the build they came from is gone.
create table if not exists website_feedback
(
    id                 uuid primary key,
    created_at         timestamptz not null default current_timestamp,
    kind               text        not null,
    comment            text        not null,
    nickname           text,
    page_path          text        not null,
    page_url           text        not null,
    build_id           text,
    source_file        text,
    source_line        integer,
    source_column      integer,
    component          text,
    component_chain    text[],
    selector           text,
    element_text       text,
    viewport_width     integer,
    viewport_height    integer,
    device_pixel_ratio real,
    user_agent         text,
    status             text        not null default 'new'
);

create index if not exists website_feedback_created_at_idx on website_feedback (created_at desc);
create index if not exists website_feedback_status_idx on website_feedback (status);
