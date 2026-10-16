-- Adds the usage events recorded by the panel photo / PDF import feature.
-- Only needed if you already ran an older 0001_init.sql. Safe to run more than once.
alter table public.usage_events drop constraint if exists usage_events_event_check;
alter table public.usage_events add constraint usage_events_event_check
  check (event in ('login','project_created','project_opened','export_pdf','export_excel','export_csv','tool_opened','feedback_sent','import_analyzed','import_created'));
