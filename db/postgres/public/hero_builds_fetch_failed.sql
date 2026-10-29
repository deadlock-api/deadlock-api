-- Name: hero_builds_fetch_failed; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.hero_builds_fetch_failed (
    build_id integer NOT NULL,
    hero integer,
    failed_at timestamp without time zone DEFAULT now() NOT NULL
);

-- Name: hero_builds_fetch_failed hero_builds_fetch_failed_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.hero_builds_fetch_failed
    ADD CONSTRAINT hero_builds_fetch_failed_pkey PRIMARY KEY (build_id);
