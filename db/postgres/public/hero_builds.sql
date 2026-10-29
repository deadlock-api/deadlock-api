-- Name: hero_builds; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.hero_builds (
    hero integer NOT NULL,
    build_id integer NOT NULL,
    version integer NOT NULL,
    author_id integer,
    favorites integer DEFAULT 0 NOT NULL,
    ignores integer DEFAULT 0 NOT NULL,
    reports integer DEFAULT 0 NOT NULL,
    updated_at timestamp without time zone,
    data jsonb,
    language integer,
    weekly_favorites integer DEFAULT 0 NOT NULL,
    rollup_category integer,
    published_at timestamp without time zone
);

-- Name: hero_builds hero_builds_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.hero_builds
    ADD CONSTRAINT hero_builds_pkey PRIMARY KEY (hero, build_id, version);

-- Name: hero_builds_author_id_index; Type: INDEX; Schema: public; Owner: -

CREATE INDEX hero_builds_author_id_index ON public.hero_builds USING btree (author_id);

-- Name: hero_builds_language_index; Type: INDEX; Schema: public; Owner: -

CREATE INDEX hero_builds_language_index ON public.hero_builds USING btree (language);

-- Name: hero_builds_updated_at_index; Type: INDEX; Schema: public; Owner: -

CREATE INDEX hero_builds_updated_at_index ON public.hero_builds USING btree (updated_at);

-- Name: hero_builds_weekly_favorites_index; Type: INDEX; Schema: public; Owner: -

CREATE INDEX hero_builds_weekly_favorites_index ON public.hero_builds USING btree (weekly_favorites DESC);
