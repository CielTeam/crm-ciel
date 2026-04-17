-- Phase 1: Geography + Scoring columns

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS country_name text,
  ADD COLUMN IF NOT EXISTS state_province text,
  ADD COLUMN IF NOT EXISTS score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_band text NOT NULL DEFAULT 'cold',
  ADD COLUMN IF NOT EXISTS score_updated_at timestamptz;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS country_name text,
  ADD COLUMN IF NOT EXISTS state_province text;

CREATE INDEX IF NOT EXISTS idx_leads_country_code ON public.leads(country_code);
CREATE INDEX IF NOT EXISTS idx_leads_score_band ON public.leads(score_band);
CREATE INDEX IF NOT EXISTS idx_accounts_country_code ON public.accounts(country_code);

-- Best-effort backfill of country_code from existing free-text country
WITH mapping(name, code) AS (
  VALUES
    ('lebanon','LB'),('lb','LB'),
    ('united arab emirates','AE'),('uae','AE'),('u.a.e','AE'),('emirates','AE'),
    ('saudi arabia','SA'),('ksa','SA'),('saudi','SA'),
    ('qatar','QA'),
    ('kuwait','KW'),
    ('oman','OM'),
    ('bahrain','BH'),
    ('jordan','JO'),
    ('egypt','EG'),
    ('turkey','TR'),('türkiye','TR'),('turkiye','TR'),
    ('france','FR'),
    ('united kingdom','GB'),('uk','GB'),('great britain','GB'),('england','GB'),
    ('united states','US'),('usa','US'),('us','US'),('america','US'),
    ('canada','CA'),
    ('germany','DE'),
    ('spain','ES'),
    ('italy','IT'),
    ('india','IN'),
    ('china','CN'),
    ('japan','JP'),
    ('australia','AU'),
    ('brazil','BR'),
    ('mexico','MX'),
    ('netherlands','NL'),
    ('belgium','BE'),
    ('switzerland','CH'),
    ('sweden','SE'),
    ('norway','NO'),
    ('denmark','DK'),
    ('finland','FI'),
    ('ireland','IE'),
    ('portugal','PT'),
    ('greece','GR'),
    ('poland','PL'),
    ('russia','RU'),
    ('south africa','ZA'),
    ('nigeria','NG'),
    ('kenya','KE'),
    ('morocco','MA'),
    ('algeria','DZ'),
    ('tunisia','TN'),
    ('iraq','IQ'),
    ('iran','IR'),
    ('syria','SY'),
    ('palestine','PS'),
    ('israel','IL'),
    ('yemen','YE'),
    ('pakistan','PK'),
    ('bangladesh','BD'),
    ('singapore','SG'),
    ('malaysia','MY'),
    ('indonesia','ID'),
    ('philippines','PH'),
    ('thailand','TH'),
    ('vietnam','VN'),
    ('south korea','KR'),('korea','KR')
)
UPDATE public.leads l
SET country_code = m.code,
    country_name = INITCAP(m.name)
FROM mapping m
WHERE l.country_code IS NULL
  AND l.country IS NOT NULL
  AND LOWER(TRIM(l.country)) = m.name;

WITH mapping(name, code) AS (
  VALUES
    ('lebanon','LB'),('lb','LB'),
    ('united arab emirates','AE'),('uae','AE'),('u.a.e','AE'),('emirates','AE'),
    ('saudi arabia','SA'),('ksa','SA'),('saudi','SA'),
    ('qatar','QA'),('kuwait','KW'),('oman','OM'),('bahrain','BH'),
    ('jordan','JO'),('egypt','EG'),('turkey','TR'),
    ('france','FR'),('united kingdom','GB'),('uk','GB'),
    ('united states','US'),('usa','US'),('canada','CA'),
    ('germany','DE'),('spain','ES'),('italy','IT')
)
UPDATE public.accounts a
SET country_code = m.code,
    country_name = INITCAP(m.name)
FROM mapping m
WHERE a.country_code IS NULL
  AND a.country IS NOT NULL
  AND LOWER(TRIM(a.country)) = m.name;