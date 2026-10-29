-- Name: protected_user_accounts; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.protected_user_accounts (
    steam_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

-- Name: protected_user_accounts protected_user_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.protected_user_accounts
    ADD CONSTRAINT protected_user_accounts_pkey PRIMARY KEY (steam_id);
