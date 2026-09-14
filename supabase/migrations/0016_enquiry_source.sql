-- Where each enquiry came from.
--
-- The website notes a visitor's source on the visit that brought them — a
-- Google ad click, a Google search, a Meta ad, a Facebook or Instagram post,
-- another site, or nothing at all (direct) — and sends it with the enquiry.
-- Until now an enquiry recorded only the page it was sent from, so there was
-- no telling whether the ads were producing them.
--
-- Two touches: `channel` is the most recent visit that had a source, and
-- `first_channel` the visit that introduced them. The rest is the detail
-- behind `channel`: the campaign tags, the ad click ids, the referring page and
-- the page they landed on.
--
-- `channel` is not constrained to a list: the site decides what counts as a
-- channel, and a new one should not bounce enquiries off a check constraint.
-- Everything is bounded, as the rest of this table is, because it takes writes
-- from the open internet. Existing enquiries keep '' — they predate tracking.
--
-- The site retries without these columns if they are missing, so the site can
-- be deployed before or after this runs without losing an enquiry.
--
-- Grants need no change: 0005 grants insert on the whole table.

alter table public.enquiries
  add column if not exists channel       text not null default '' check (char_length(channel) <= 40),
  add column if not exists first_channel text not null default '' check (char_length(first_channel) <= 40),
  add column if not exists utm_source    text not null default '' check (char_length(utm_source) <= 200),
  add column if not exists utm_medium    text not null default '' check (char_length(utm_medium) <= 200),
  add column if not exists utm_campaign  text not null default '' check (char_length(utm_campaign) <= 200),
  add column if not exists utm_term      text not null default '' check (char_length(utm_term) <= 200),
  add column if not exists utm_content   text not null default '' check (char_length(utm_content) <= 200),
  -- Google's gclid (or gbraid/wbraid) and Meta's fbclid. Kept whole: they are
  -- what an offline-conversion upload to either ad platform would match on.
  add column if not exists gclid         text not null default '' check (char_length(gclid) <= 300),
  add column if not exists fbclid        text not null default '' check (char_length(fbclid) <= 300),
  add column if not exists referrer      text not null default '' check (char_length(referrer) <= 500),
  add column if not exists landing_page  text not null default '' check (char_length(landing_page) <= 500);

create index if not exists enquiries_channel_idx on public.enquiries (channel);

-- PostgREST caches the schema; without this the new columns are "not found"
-- until it next reloads on its own.
notify pgrst, 'reload schema';
