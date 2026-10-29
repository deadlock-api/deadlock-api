-- Name: website_feedback; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.website_feedback (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    kind text NOT NULL,
    comment text NOT NULL,
    nickname text,
    page_path text NOT NULL,
    page_url text NOT NULL,
    build_id text,
    source_file text,
    source_line integer,
    source_column integer,
    component text,
    component_chain text[],
    selector text,
    element_text text,
    viewport_width integer,
    viewport_height integer,
    device_pixel_ratio real,
    user_agent text,
    status text DEFAULT 'new'::text NOT NULL,
    targets jsonb
);

-- Name: website_feedback website_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.website_feedback
    ADD CONSTRAINT website_feedback_pkey PRIMARY KEY (id);

-- Name: website_feedback_created_at_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX website_feedback_created_at_idx ON public.website_feedback USING btree (created_at DESC);

-- Name: website_feedback_status_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX website_feedback_status_idx ON public.website_feedback USING btree (status);
