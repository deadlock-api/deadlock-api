-- Name: metadata_pack_sources; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.metadata_pack_sources (
    bucket text NOT NULL,
    key text NOT NULL,
    match_id bigint NOT NULL,
    kind smallint NOT NULL,
    size bigint NOT NULL,
    etag text NOT NULL,
    last_modified timestamp with time zone NOT NULL,
    state smallint DEFAULT 0 NOT NULL,
    pack_id bigint,
    packed_at timestamp with time zone,
    discovered_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: metadata_pack_sources metadata_pack_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.metadata_pack_sources
    ADD CONSTRAINT metadata_pack_sources_pkey PRIMARY KEY (bucket, key);

-- Name: metadata_pack_sources_packed; Type: INDEX; Schema: public; Owner: -

CREATE INDEX metadata_pack_sources_packed ON public.metadata_pack_sources USING btree (packed_at) WHERE (state = 1);

-- Name: metadata_pack_sources_pending; Type: INDEX; Schema: public; Owner: -

CREATE INDEX metadata_pack_sources_pending ON public.metadata_pack_sources USING btree (match_id, kind) WHERE (state = 0);
