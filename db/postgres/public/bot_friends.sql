-- Name: bot_friends; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.bot_friends (
    friend_id integer NOT NULL,
    bot_id character varying(32) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);

-- Name: bot_friends bot_friends2_pkey1; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.bot_friends
    ADD CONSTRAINT bot_friends2_pkey1 PRIMARY KEY (friend_id);
