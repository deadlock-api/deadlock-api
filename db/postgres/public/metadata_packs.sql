-- Name: metadata_packs; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.metadata_packs (
    pack_id bigint NOT NULL,
    bucket smallint NOT NULL,
    size_bytes bigint NOT NULL,
    entries integer NOT NULL,
    min_match_id bigint NOT NULL,
    max_match_id bigint NOT NULL,
    sha256 bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: metadata_packs metadata_packs_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.metadata_packs
    ADD CONSTRAINT metadata_packs_pkey PRIMARY KEY (pack_id);
