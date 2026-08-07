-- One submission can now annotate several elements at once. The `source_*`,
-- `selector` and `element_text` columns keep holding the first of them, so a
-- plain `select *` still reads at a glance for the usual single-element case.
alter table website_feedback
    add column if not exists targets jsonb;
