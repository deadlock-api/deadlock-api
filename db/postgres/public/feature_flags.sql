-- Name: feature_flags; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.feature_flags (
    key text NOT NULL,
    kind text NOT NULL,
    enabled boolean NOT NULL,
    description text,
    disabled_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: feature_flags feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (key);

-- Name: feature_flags feature_flags_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER feature_flags_touch_updated_at BEFORE UPDATE ON public.feature_flags FOR EACH ROW WHEN (((old.enabled IS DISTINCT FROM new.enabled) OR (old.disabled_reason IS DISTINCT FROM new.disabled_reason))) EXECUTE FUNCTION public.feature_flags_touch_updated_at();
