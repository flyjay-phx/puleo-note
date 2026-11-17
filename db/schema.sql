-- 풀어노트: notes 표 하나
-- Supabase SQL Editor에 그대로 붙여 넣어 실행합니다.

create table if not exists notes (
  id            serial primary key,
  title         text        not null check (char_length(title) between 1 and 120),
  original_text text        not null check (char_length(original_text) between 1 and 16000),
  easy_text     text        not null default '' check (char_length(easy_text) <= 16000),
  one_liner     text        not null default '' check (char_length(one_liner) <= 200),
  status        text        not null default 'new' check (status in ('new', 'review', 'done')),
  node          integer     check (node between 0 and 99),
  tags          text[]      not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists notes_updated_at_idx on notes (updated_at desc);
