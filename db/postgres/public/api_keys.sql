-- Name: api_keys; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.api_keys (
    key uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    comment text,
    data_access boolean DEFAULT false NOT NULL,
    disabled boolean DEFAULT false NOT NULL,
    esports_ingest boolean DEFAULT false NOT NULL,
    user_id uuid DEFAULT gen_random_uuid() NOT NULL,
    patron_id uuid,
    discord_id bigint,
    live_events_pool boolean DEFAULT false NOT NULL,
    custom_limits_only boolean DEFAULT false NOT NULL
);

COMMENT ON COLUMN public.api_keys.custom_limits_only IS 'The key lifts only the buckets it has api_key_limits rows for; everywhere else it is held to the limits of a client without a key.';

-- Name: api_keys api_keys_pk; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pk UNIQUE (comment);

-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (key);

-- Name: api_keys api_keys_patron_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_patron_id_fkey FOREIGN KEY (patron_id) REFERENCES public.patrons(id);
