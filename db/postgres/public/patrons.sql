-- Name: patrons; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.patrons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patreon_user_id text NOT NULL,
    email text,
    tier_id text,
    pledge_amount_cents integer,
    is_active boolean DEFAULT false NOT NULL,
    access_token text,
    refresh_token text,
    token_expires_at timestamp with time zone,
    last_verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    slot_override integer,
    ai_agent_access boolean DEFAULT false
);

-- Name: patrons patrons_patreon_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.patrons
    ADD CONSTRAINT patrons_patreon_user_id_unique UNIQUE (patreon_user_id);

-- Name: patrons patrons_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.patrons
    ADD CONSTRAINT patrons_pkey PRIMARY KEY (id);
