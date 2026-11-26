-- Name: metadata_pack_entries; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.metadata_pack_entries (
    match_id bigint NOT NULL,
    kind smallint NOT NULL,
    pack_id bigint NOT NULL,
    "offset" bigint NOT NULL,
    length integer NOT NULL,
    codec smallint NOT NULL,
    crc32 integer NOT NULL
)
WITH (fillfactor='100');

-- Name: metadata_pack_entries metadata_pack_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.metadata_pack_entries
    ADD CONSTRAINT metadata_pack_entries_pkey PRIMARY KEY (match_id, kind);
