-- Name: api_key_limits; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.api_key_limits (
    key uuid NOT NULL,
    path text NOT NULL,
    rate_limit integer DEFAULT 10 NOT NULL,
    rate_period interval DEFAULT '00:00:01'::interval NOT NULL
);

-- Name: api_key_limits limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.api_key_limits
    ADD CONSTRAINT limits_pkey PRIMARY KEY (key, path);

-- Name: api_key_limits limits_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.api_key_limits
    ADD CONSTRAINT limits_key_fkey FOREIGN KEY (key) REFERENCES public.api_keys(key);
