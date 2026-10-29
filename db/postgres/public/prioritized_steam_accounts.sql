-- Name: prioritized_steam_accounts; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.prioritized_steam_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patron_id uuid,
    steam_id3 bigint NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp with time zone,
    user_deleted boolean DEFAULT false NOT NULL
);

-- Name: prioritized_steam_accounts prioritized_steam_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.prioritized_steam_accounts
    ADD CONSTRAINT prioritized_steam_accounts_pkey PRIMARY KEY (id);

-- Name: prioritized_steam_accounts_active_unique; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX prioritized_steam_accounts_active_unique ON public.prioritized_steam_accounts USING btree (patron_id, steam_id3) WHERE (deleted_at IS NULL);

-- Name: prioritized_steam_accounts_deleted_at_cleanup; Type: INDEX; Schema: public; Owner: -

CREATE INDEX prioritized_steam_accounts_deleted_at_cleanup ON public.prioritized_steam_accounts USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);

-- Name: prioritized_steam_accounts_steam_id3_active; Type: INDEX; Schema: public; Owner: -

CREATE INDEX prioritized_steam_accounts_steam_id3_active ON public.prioritized_steam_accounts USING btree (steam_id3) WHERE (deleted_at IS NULL);

-- Name: prioritized_steam_accounts prioritized_steam_accounts_patron_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.prioritized_steam_accounts
    ADD CONSTRAINT prioritized_steam_accounts_patron_fkey FOREIGN KEY (patron_id) REFERENCES public.patrons(id) ON DELETE CASCADE;
