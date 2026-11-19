-- Name: retry_after_blocks; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.retry_after_blocks (
    id bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
    api_key uuid,
    network cidr,
    reason text,
    wait_secs integer DEFAULT 60 NOT NULL,
    required_rounds integer DEFAULT 3 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    released_at timestamp with time zone,
    CONSTRAINT retry_after_blocks_one_subject CHECK (((api_key IS NULL) <> (network IS NULL))),
    CONSTRAINT retry_after_blocks_wait_secs CHECK (((wait_secs >= 5) AND (wait_secs <= 86400))),
    CONSTRAINT retry_after_blocks_required_rounds CHECK (((required_rounds >= 1) AND (required_rounds <= 100)))
);

COMMENT ON TABLE public.retry_after_blocks IS 'Clients blocked for retrying before Retry-After. Every request of a blocked client gets a 429 with Retry-After: wait_secs; the block lifts itself (released_at) after required_rounds requests in a row that waited for it.';

COMMENT ON COLUMN public.retry_after_blocks.network IS 'Blocks every request from these addresses, with or without an API key. A bare address is a /32 or /128.';

-- Name: retry_after_blocks retry_after_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.retry_after_blocks
    ADD CONSTRAINT retry_after_blocks_pkey PRIMARY KEY (id);

-- Name: retry_after_blocks_active_api_key; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX retry_after_blocks_active_api_key ON public.retry_after_blocks USING btree (api_key) WHERE ((released_at IS NULL) AND (api_key IS NOT NULL));

-- Name: retry_after_blocks_active_network; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX retry_after_blocks_active_network ON public.retry_after_blocks USING btree (network) WHERE ((released_at IS NULL) AND (network IS NOT NULL));
