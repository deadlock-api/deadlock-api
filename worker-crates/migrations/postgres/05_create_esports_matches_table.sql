DROP TABLE IF EXISTS esports_matches;
DROP TYPE esports_match_status;

CREATE TYPE public.esports_match_status AS ENUM ('live', 'completed', 'scheduled', 'cancelled');

CREATE TABLE esports_matches
(
 update_id        uuid                     default gen_random_uuid() not null,
 provider         text                                               not null,
 match_id         bigint,
 team0_name       text,
 team1_name       text,
 tournament_name  text,
 tournament_stage text,
 scheduled_date   timestamp with time zone,
 status           esports_match_status,
 created_at       timestamp with time zone default now()             not null,
 updated_at       timestamp with time zone default now()             not null,

 PRIMARY KEY (update_id)
);

