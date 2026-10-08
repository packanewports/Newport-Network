create table if not exists public.letters (
  id uuid primary key default gen_random_uuid(),
  sender_name text not null default 'Anonymous'
    check (char_length(sender_name) between 1 and 40),
  message text not null
    check (char_length(message) between 1 and 1000),
  image_path text,
  created_at timestamptz not null default now()
);

alter table public.letters enable row level security;

revoke all on public.letters from anon, authenticated;
grant insert on public.letters to anon;
grant select on public.letters to authenticated;

drop policy if exists "Anyone can submit a letter" on public.letters;
create policy "Anyone can submit a letter"
  on public.letters
  for insert
  to anon
  with check (true);

create or replace function public.is_mailbox_owner()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select auth.uid() = '3f409578-1225-4406-8ea2-14f86635d828'::uuid;
$$;

revoke all on function public.is_mailbox_owner() from public;
grant execute on function public.is_mailbox_owner() to authenticated;

create table if not exists public.mailbox_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table public.mailbox_state enable row level security;

revoke all on public.mailbox_state from anon, authenticated;
grant select, update on public.mailbox_state to authenticated;

drop policy if exists "Mailbox owner can read mailbox state" on public.mailbox_state;
create policy "Mailbox owner can read mailbox state"
  on public.mailbox_state
  for select
  to authenticated
  using (public.is_mailbox_owner() and owner_id = auth.uid());

drop policy if exists "Mailbox owner can update mailbox state" on public.mailbox_state;
create policy "Mailbox owner can update mailbox state"
  on public.mailbox_state
  for update
  to authenticated
  using (public.is_mailbox_owner() and owner_id = auth.uid())
  with check (public.is_mailbox_owner() and owner_id = auth.uid());

insert into public.mailbox_state (owner_id)
values ('3f409578-1225-4406-8ea2-14f86635d828'::uuid)
on conflict (owner_id) do nothing;

drop policy if exists "Mailbox owner can read letters" on public.letters;
create policy "Mailbox owner can read letters"
  on public.letters
  for select
  to authenticated
  using (public.is_mailbox_owner());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'letter-images',
  'letter-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can attach a letter image" on storage.objects;
create policy "Anyone can attach a letter image"
  on storage.objects
  for insert
  to anon
  with check (bucket_id = 'letter-images');

drop policy if exists "Mailbox owner can read letter images" on storage.objects;
create policy "Mailbox owner can read letter images"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'letter-images' and public.is_mailbox_owner());

create table if not exists public.art_museum (
  id uuid primary key default gen_random_uuid(),
  source_letter_id uuid not null unique references public.letters(id) on delete cascade,
  image_path text not null unique,
  sender_name text not null default 'Anonymous'
    check (char_length(sender_name) between 1 and 40),
  is_favorite boolean not null default false,
  is_art_of_week boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.art_museum
  add column if not exists is_favorite boolean not null default false;

alter table public.art_museum
  add column if not exists is_art_of_week boolean not null default false;

create unique index if not exists art_museum_single_art_of_week_idx
  on public.art_museum (is_art_of_week)
  where is_art_of_week = true;

alter table public.art_museum enable row level security;

revoke all on public.art_museum from anon, authenticated;
grant select on public.art_museum to anon, authenticated;
grant insert, delete on public.art_museum to authenticated;
grant update (is_favorite, is_art_of_week) on public.art_museum to authenticated;

drop policy if exists "Anyone can view art museum entries" on public.art_museum;
create policy "Anyone can view art museum entries"
  on public.art_museum
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Mailbox owner can add art museum entries" on public.art_museum;
create policy "Mailbox owner can add art museum entries"
  on public.art_museum
  for insert
  to authenticated
  with check (public.is_mailbox_owner());

drop policy if exists "Mailbox owner can remove art museum entries" on public.art_museum;
create policy "Mailbox owner can remove art museum entries"
  on public.art_museum
  for delete
  to authenticated
  using (public.is_mailbox_owner());

drop policy if exists "Mailbox owner can curate art museum entries" on public.art_museum;
create policy "Mailbox owner can curate art museum entries"
  on public.art_museum
  for update
  to authenticated
  using (public.is_mailbox_owner())
  with check (public.is_mailbox_owner());

create or replace function public.set_art_of_week(p_artwork_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_mailbox_owner() then
    raise exception 'Only the mailbox owner can choose Art of the Week.';
  end if;

  if not exists (select 1 from public.art_museum where id = p_artwork_id) then
    raise exception 'Artwork not found.';
  end if;

  update public.art_museum set is_art_of_week = false where is_art_of_week = true;
  update public.art_museum set is_art_of_week = true where id = p_artwork_id;
end;
$$;

revoke all on function public.set_art_of_week(uuid) from public;
grant execute on function public.set_art_of_week(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'art-museum',
  'art-museum',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Mailbox owner can upload art museum images" on storage.objects;
create policy "Mailbox owner can upload art museum images"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'art-museum' and public.is_mailbox_owner());

drop policy if exists "Mailbox owner can delete art museum images" on storage.objects;
create policy "Mailbox owner can delete art museum images"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'art-museum' and public.is_mailbox_owner());

create table if not exists public.anon_wall_posts (
  id uuid primary key default gen_random_uuid(),
  body text not null default '',
  media_path text,
  media_type text,
  created_at timestamptz not null default now(),
  check (char_length(body) <= 5000),
  check (
    (media_path is null and media_type is null)
    or (
      media_path is not null
      and media_type is not null
      and media_type in ('image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm')
    )
  ),
  check (char_length(trim(body)) > 0 or media_path is not null)
);

create index if not exists anon_wall_posts_created_at_idx
  on public.anon_wall_posts (created_at desc, id desc);

alter table public.anon_wall_posts enable row level security;

revoke all on public.anon_wall_posts from anon, authenticated;
grant select, insert on public.anon_wall_posts to anon, authenticated;
grant delete on public.anon_wall_posts to authenticated;

drop policy if exists "Anyone can read anon wall posts" on public.anon_wall_posts;
create policy "Anyone can read anon wall posts"
  on public.anon_wall_posts
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can create anon wall posts" on public.anon_wall_posts;
create policy "Anyone can create anon wall posts"
  on public.anon_wall_posts
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Mailbox owner can delete anon wall posts" on public.anon_wall_posts;
create policy "Mailbox owner can delete anon wall posts"
  on public.anon_wall_posts
  for delete
  to authenticated
  using (public.is_mailbox_owner());

create table if not exists public.anon_wall_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.anon_wall_posts(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists anon_wall_replies_post_created_idx
  on public.anon_wall_replies (post_id, created_at, id);

alter table public.anon_wall_replies enable row level security;

revoke all on public.anon_wall_replies from anon, authenticated;
grant select, insert on public.anon_wall_replies to anon, authenticated;
grant delete on public.anon_wall_replies to authenticated;

drop policy if exists "Anyone can read anon wall replies" on public.anon_wall_replies;
create policy "Anyone can read anon wall replies"
  on public.anon_wall_replies
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can create anon wall replies" on public.anon_wall_replies;
create policy "Anyone can create anon wall replies"
  on public.anon_wall_replies
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Mailbox owner can delete anon wall replies" on public.anon_wall_replies;
create policy "Mailbox owner can delete anon wall replies"
  on public.anon_wall_replies
  for delete
  to authenticated
  using (public.is_mailbox_owner());

create table if not exists public.anon_wall_likes (
  post_id uuid not null references public.anon_wall_posts(id) on delete cascade,
  voter_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (post_id, voter_id)
);

alter table public.anon_wall_likes enable row level security;

revoke all on public.anon_wall_likes from anon, authenticated;
grant select, insert, delete on public.anon_wall_likes to anon, authenticated;

drop policy if exists "Anyone can read anon wall likes" on public.anon_wall_likes;
create policy "Anyone can read anon wall likes"
  on public.anon_wall_likes
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can like anon wall posts" on public.anon_wall_likes;
create policy "Anyone can like anon wall posts"
  on public.anon_wall_likes
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Anyone can unlike anon wall posts" on public.anon_wall_likes;
create policy "Anyone can unlike anon wall posts"
  on public.anon_wall_likes
  for delete
  to anon, authenticated
  using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'anon-wall-media',
  'anon-wall-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can upload anon wall media" on storage.objects;
create policy "Anyone can upload anon wall media"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'anon-wall-media');

drop policy if exists "Anyone can view anon wall media" on storage.objects;
create policy "Anyone can view anon wall media"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'anon-wall-media');

drop policy if exists "Mailbox owner can delete anon wall media" on storage.objects;
create policy "Mailbox owner can delete anon wall media"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'anon-wall-media' and public.is_mailbox_owner());

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 160),
  body text not null check (char_length(trim(body)) between 1 and 10000),
  created_at timestamptz not null default now()
);

create index if not exists blog_posts_created_at_idx
  on public.blog_posts (created_at desc, id desc);

alter table public.blog_posts enable row level security;

revoke all on public.blog_posts from anon, authenticated;
grant select on public.blog_posts to anon, authenticated;
grant insert on public.blog_posts to authenticated;

drop policy if exists "Anyone can read blog posts" on public.blog_posts;
create policy "Anyone can read blog posts"
  on public.blog_posts
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Mailbox owner can publish blog posts" on public.blog_posts;
create policy "Mailbox owner can publish blog posts"
  on public.blog_posts
  for insert
  to authenticated
  with check (public.is_mailbox_owner());

create table if not exists public.blog_likes (
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  voter_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (post_id, voter_id)
);

alter table public.blog_likes enable row level security;

revoke all on public.blog_likes from anon, authenticated;
grant select, insert, delete on public.blog_likes to anon, authenticated;

drop policy if exists "Anyone can read blog likes" on public.blog_likes;
create policy "Anyone can read blog likes"
  on public.blog_likes
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can like blog posts" on public.blog_likes;
create policy "Anyone can like blog posts"
  on public.blog_likes
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Anyone can unlike blog posts" on public.blog_likes;
create policy "Anyone can unlike blog posts"
  on public.blog_likes
  for delete
  to anon, authenticated
  using (true);

create table if not exists public.music_queue (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 160),
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  requester_id uuid not null,
  requester_name text not null default 'Anonymous'
    check (char_length(trim(requester_name)) between 1 and 24),
  status text not null default 'queued'
    check (status in ('queued', 'playing', 'played', 'skipped')),
  created_at timestamptz not null default now()
);

alter table public.music_queue
  add column if not exists requester_id uuid not null default gen_random_uuid();

alter table public.music_queue
  add column if not exists requester_name text not null default 'Anonymous';

create index if not exists music_queue_status_created_idx
  on public.music_queue (status, created_at, id);

create unique index if not exists music_queue_single_playing_idx
  on public.music_queue (status)
  where status = 'playing';

alter table public.music_queue enable row level security;

revoke all on public.music_queue from anon, authenticated;
grant select (id, title, video_id, requester_name, status, created_at) on public.music_queue to anon, authenticated;
grant insert (title, video_id, requester_id, requester_name) on public.music_queue to anon, authenticated;

drop policy if exists "Anyone can read music queue" on public.music_queue;
create policy "Anyone can read music queue"
  on public.music_queue
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can queue music" on public.music_queue;
create policy "Anyone can queue music"
  on public.music_queue
  for insert
  to anon, authenticated
  with check (status = 'queued');

create or replace function public.music_get_queue(p_session_id uuid)
returns table (
  id uuid,
  title text,
  video_id text,
  requester_name text,
  created_at timestamptz,
  can_remove boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    q.id,
    q.title,
    q.video_id,
    q.requester_name,
    q.created_at,
    (q.requester_id = p_session_id or public.is_mailbox_owner()) as can_remove
  from public.music_queue q
  where q.status = 'queued'
  order by q.created_at, q.id
  limit 50;
$$;

create or replace function public.music_remove_queued_track(p_track_id uuid, p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester_id uuid;
begin
  select requester_id
    into v_requester_id
    from public.music_queue
    where id = p_track_id and status = 'queued'
    for update;

  if v_requester_id is null then
    return false;
  end if;

  if (p_session_id is null or v_requester_id <> p_session_id) and not public.is_mailbox_owner() then
    raise exception 'You can only remove your own queued songs.';
  end if;

  delete from public.music_queue
    where id = p_track_id and status = 'queued';
  return true;
end;
$$;

create or replace function public.music_clear_queue()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if not public.is_mailbox_owner() then
    raise exception 'Only the mailbox owner can clear the queue.';
  end if;

  delete from public.music_queue where status = 'queued';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.music_remove_queued_track(uuid, uuid) from public;
revoke all on function public.music_clear_queue() from public;
revoke all on function public.music_get_queue(uuid) from public;
grant execute on function public.music_remove_queued_track(uuid, uuid) to anon, authenticated;
grant execute on function public.music_clear_queue() to authenticated;
grant execute on function public.music_get_queue(uuid) to anon, authenticated;

create table if not exists public.music_room_state (
  id boolean primary key default true check (id),
  current_track_id uuid references public.music_queue(id),
  started_at timestamptz
);

insert into public.music_room_state (id)
values (true)
on conflict (id) do nothing;

alter table public.music_room_state enable row level security;

revoke all on public.music_room_state from anon, authenticated;
grant select on public.music_room_state to anon, authenticated;

drop policy if exists "Anyone can read music room state" on public.music_room_state;
create policy "Anyone can read music room state"
  on public.music_room_state
  for select
  to anon, authenticated
  using (true);

create table if not exists public.music_skip_votes (
  track_id uuid not null references public.music_queue(id) on delete cascade,
  session_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (track_id, session_id)
);

create table if not exists public.music_room_presence (
  session_id uuid primary key,
  heartbeat_at timestamptz not null default now()
);

create index if not exists music_room_presence_heartbeat_idx
  on public.music_room_presence (heartbeat_at);

alter table public.music_skip_votes enable row level security;
alter table public.music_room_presence enable row level security;

revoke all on public.music_skip_votes from anon, authenticated;
revoke all on public.music_room_presence from anon, authenticated;

create table if not exists public.music_chat (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  display_name text not null default 'Anonymous'
    check (char_length(trim(display_name)) between 1 and 24),
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.music_chat
  add column if not exists client_id uuid not null default gen_random_uuid();

create index if not exists music_chat_created_at_idx
  on public.music_chat (created_at desc);

create index if not exists music_chat_created_at_id_idx
  on public.music_chat (created_at desc, id desc);

create unique index if not exists music_chat_client_id_idx
  on public.music_chat (client_id);

alter table public.music_chat enable row level security;

revoke all on public.music_chat from anon, authenticated;
grant select on public.music_chat to anon, authenticated;
grant insert (client_id, display_name, body) on public.music_chat to anon, authenticated;

drop policy if exists "Anyone can read Music Bar chat" on public.music_chat;
create policy "Anyone can read Music Bar chat"
  on public.music_chat
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can send Music Bar chat messages" on public.music_chat;
create policy "Anyone can send Music Bar chat messages"
  on public.music_chat
  for insert
  to anon, authenticated
  with check (true);

create table if not exists public.music_plinko_state (
  id boolean primary key default true check (id),
  target_slot smallint not null default 3 check (target_slot between 0 and 6)
);

insert into public.music_plinko_state (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.music_plinko_wins (
  round_id uuid primary key,
  winning_slot smallint not null check (winning_slot between 0 and 6),
  created_at timestamptz not null default now()
);

alter table public.music_plinko_state enable row level security;
alter table public.music_plinko_wins enable row level security;

revoke all on public.music_plinko_state from anon, authenticated;
revoke all on public.music_plinko_wins from anon, authenticated;
grant select on public.music_plinko_state to anon, authenticated;

drop policy if exists "Anyone can read Music Bar Plinko state" on public.music_plinko_state;
create policy "Anyone can read Music Bar Plinko state"
  on public.music_plinko_state
  for select
  to anon, authenticated
  using (true);

create or replace function public.music_plinko_record_win(
  p_round_id uuid,
  p_expected_slot smallint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_slot smallint;
  v_recorded_slot smallint;
  v_next_slot smallint;
begin
  if p_round_id is null or p_expected_slot is null or p_expected_slot not between 0 and 6 then
    raise exception 'A valid Plinko round and target hole are required.';
  end if;

  select target_slot
    into v_current_slot
    from public.music_plinko_state
    where id = true
    for update;

  if v_current_slot is null then
    raise exception 'The shared Plinko state has not been initialized.';
  end if;

  select winning_slot
    into v_recorded_slot
    from public.music_plinko_wins
    where round_id = p_round_id;

  if found then
    return jsonb_build_object(
      'won', v_recorded_slot = p_expected_slot,
      'target_slot', v_current_slot
    );
  end if;

  if v_current_slot <> p_expected_slot then
    return jsonb_build_object('won', false, 'target_slot', v_current_slot);
  end if;

  insert into public.music_plinko_wins (round_id, winning_slot)
  values (p_round_id, p_expected_slot);

  loop
    v_next_slot := floor(random() * 7)::smallint;
    exit when v_next_slot <> v_current_slot;
  end loop;

  update public.music_plinko_state
    set target_slot = v_next_slot
    where id = true;

  return jsonb_build_object('won', true, 'target_slot', v_next_slot);
end;
$$;

revoke all on function public.music_plinko_record_win(uuid, smallint) from public;
grant execute on function public.music_plinko_record_win(uuid, smallint) to anon, authenticated;

create or replace function public.music_server_time()
returns timestamptz
language sql
volatile
security definer
set search_path = ''
as $$
  select clock_timestamp();
$$;

create or replace function public.music_room_heartbeat(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_session_id is null then
    raise exception 'A session ID is required.';
  end if;

  insert into public.music_room_presence (session_id, heartbeat_at)
  values (p_session_id, now())
  on conflict (session_id) do update
    set heartbeat_at = excluded.heartbeat_at;

  select count(*)::integer
    into v_count
    from public.music_room_presence
    where heartbeat_at > now() - interval '45 seconds';
  return v_count;
end;
$$;

create or replace function public.music_room_leave(p_session_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.music_room_presence
  where session_id = p_session_id;
$$;

create or replace function public.music_room_presence_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.music_room_presence
  where heartbeat_at > now() - interval '45 seconds';
$$;

create or replace function public.music_start_next_track()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_track uuid;
  v_next_track uuid;
begin
  insert into public.music_room_state (id)
  values (true)
  on conflict (id) do nothing;

  select current_track_id
    into v_current_track
    from public.music_room_state
    where id = true
    for update;

  if v_current_track is not null then
    return v_current_track;
  end if;

  select id
    into v_next_track
    from public.music_queue
    where status = 'queued'
    order by created_at, id
    limit 1
    for update skip locked;

  if v_next_track is null then
    return null;
  end if;

  update public.music_queue
    set status = 'playing'
    where id = v_next_track;

  update public.music_room_state
    set current_track_id = v_next_track,
        started_at = now()
    where id = true;

  return v_next_track;
end;
$$;

create or replace function public.music_finish_track(p_track_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_track uuid;
begin
  select current_track_id
    into v_current_track
    from public.music_room_state
    where id = true
    for update;

  if v_current_track is null or v_current_track <> p_track_id then
    return v_current_track;
  end if;

  update public.music_queue
    set status = 'played'
    where id = v_current_track;

  update public.music_room_state
    set current_track_id = null,
        started_at = null
    where id = true;

  return public.music_start_next_track();
end;
$$;

create or replace function public.music_get_skip_status(p_track_id uuid, p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_current_track uuid;
  v_audience integer;
  v_votes integer;
  v_required integer;
  v_has_voted boolean;
begin
  select current_track_id
    into v_current_track
    from public.music_room_state
    where id = true;

  select greatest(1, count(*)::integer)
    into v_audience
    from public.music_room_presence
    where heartbeat_at > now() - interval '45 seconds';

  if v_current_track is distinct from p_track_id then
    return jsonb_build_object(
      'audience', v_audience, 'votes', 0, 'required', (v_audience + 1) / 2, 'has_voted', false
    );
  end if;

  select count(*)::integer
    into v_votes
    from public.music_skip_votes
    where track_id = p_track_id;

  select exists (
    select 1
    from public.music_skip_votes
    where track_id = p_track_id and session_id = p_session_id
  )
    into v_has_voted;

  v_required := (v_audience + 1) / 2;
  return jsonb_build_object(
    'audience', v_audience,
    'votes', v_votes,
    'required', v_required,
    'has_voted', v_has_voted
  );
end;
$$;

create or replace function public.music_vote_skip(p_track_id uuid, p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_track uuid;
  v_audience integer;
  v_votes integer;
  v_required integer;
  v_has_voted boolean;
  v_passed boolean := false;
begin
  if p_session_id is null then
    raise exception 'A session ID is required.';
  end if;

  select current_track_id
    into v_current_track
    from public.music_room_state
    where id = true
    for update;

  select greatest(1, count(*)::integer)
    into v_audience
    from public.music_room_presence
    where heartbeat_at > now() - interval '45 seconds';
  v_required := (v_audience + 1) / 2;

  if v_current_track is distinct from p_track_id then
    return jsonb_build_object(
      'passed', false, 'has_voted', false, 'audience', v_audience, 'votes', 0, 'required', v_required
    );
  end if;

  if exists (
    select 1
    from public.music_skip_votes
    where track_id = p_track_id and session_id = p_session_id
  ) then
    delete from public.music_skip_votes
      where track_id = p_track_id and session_id = p_session_id;
    v_has_voted := false;
  else
    insert into public.music_skip_votes (track_id, session_id)
    values (p_track_id, p_session_id);
    v_has_voted := true;
  end if;

  select count(*)::integer
    into v_votes
    from public.music_skip_votes
    where track_id = p_track_id;

  if v_has_voted and v_votes >= v_required then
    update public.music_queue
      set status = 'skipped'
      where id = p_track_id;
    update public.music_room_state
      set current_track_id = null,
          started_at = null
      where id = true;
    perform public.music_start_next_track();
    v_passed := true;
  end if;

  return jsonb_build_object(
    'passed', v_passed,
    'has_voted', v_has_voted,
    'audience', v_audience,
    'votes', v_votes,
    'required', v_required
  );
end;
$$;

revoke all on function public.music_server_time() from public;
revoke all on function public.music_room_heartbeat(uuid) from public;
revoke all on function public.music_room_leave(uuid) from public;
revoke all on function public.music_room_presence_count() from public;
revoke all on function public.music_start_next_track() from public;
revoke all on function public.music_finish_track(uuid) from public;
revoke all on function public.music_get_skip_status(uuid, uuid) from public;
revoke all on function public.music_vote_skip(uuid, uuid) from public;

grant execute on function public.music_server_time() to anon, authenticated;
grant execute on function public.music_room_heartbeat(uuid) to anon, authenticated;
grant execute on function public.music_room_leave(uuid) to anon, authenticated;
grant execute on function public.music_room_presence_count() to anon, authenticated;
grant execute on function public.music_start_next_track() to anon, authenticated;
grant execute on function public.music_finish_track(uuid) to anon, authenticated;
grant execute on function public.music_get_skip_status(uuid, uuid) to anon, authenticated;
grant execute on function public.music_vote_skip(uuid, uuid) to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'music_queue'
  ) then
    alter publication supabase_realtime add table public.music_queue;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'music_room_state'
  ) then
    alter publication supabase_realtime add table public.music_room_state;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'music_chat'
  ) then
    alter publication supabase_realtime add table public.music_chat;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'music_plinko_state'
  ) then
    alter publication supabase_realtime add table public.music_plinko_state;
  end if;
end;
$$;

create table if not exists public.wall_of_praise (
  id uuid primary key default gen_random_uuid(),
  person_name text not null check (char_length(trim(person_name)) between 1 and 80),
  praise_text text not null check (char_length(trim(praise_text)) between 1 and 1000),
  image_path text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists wall_of_praise_created_at_idx
  on public.wall_of_praise (created_at desc, id desc);

alter table public.wall_of_praise enable row level security;

revoke all on public.wall_of_praise from anon, authenticated;
grant select on public.wall_of_praise to anon, authenticated;
grant insert, delete on public.wall_of_praise to authenticated;
grant update (person_name, praise_text, image_path) on public.wall_of_praise to authenticated;

drop policy if exists "Anyone can view Wall of Praise entries" on public.wall_of_praise;
create policy "Anyone can view Wall of Praise entries"
  on public.wall_of_praise
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Mailbox owner can add Wall of Praise entries" on public.wall_of_praise;
create policy "Mailbox owner can add Wall of Praise entries"
  on public.wall_of_praise
  for insert
  to authenticated
  with check (public.is_mailbox_owner());

drop policy if exists "Mailbox owner can edit Wall of Praise entries" on public.wall_of_praise;
create policy "Mailbox owner can edit Wall of Praise entries"
  on public.wall_of_praise
  for update
  to authenticated
  using (public.is_mailbox_owner())
  with check (public.is_mailbox_owner());

drop policy if exists "Mailbox owner can remove Wall of Praise entries" on public.wall_of_praise;
create policy "Mailbox owner can remove Wall of Praise entries"
  on public.wall_of_praise
  for delete
  to authenticated
  using (public.is_mailbox_owner());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wall-of-praise',
  'wall-of-praise',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can view Wall of Praise images" on storage.objects;
create policy "Anyone can view Wall of Praise images"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'wall-of-praise');

drop policy if exists "Mailbox owner can upload Wall of Praise images" on storage.objects;
create policy "Mailbox owner can upload Wall of Praise images"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'wall-of-praise' and public.is_mailbox_owner());

drop policy if exists "Mailbox owner can replace Wall of Praise images" on storage.objects;
create policy "Mailbox owner can replace Wall of Praise images"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'wall-of-praise' and public.is_mailbox_owner())
  with check (bucket_id = 'wall-of-praise' and public.is_mailbox_owner());

drop policy if exists "Mailbox owner can delete Wall of Praise images" on storage.objects;
create policy "Mailbox owner can delete Wall of Praise images"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'wall-of-praise' and public.is_mailbox_owner());

create table if not exists public.private_corner_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 160),
  body text not null check (char_length(trim(body)) between 1 and 10000),
  created_at timestamptz not null default now()
);

create index if not exists private_corner_posts_created_at_idx
  on public.private_corner_posts (created_at desc, id desc);

alter table public.private_corner_posts enable row level security;

revoke all on public.private_corner_posts from anon, authenticated;
grant select on public.private_corner_posts to anon, authenticated;
grant insert on public.private_corner_posts to authenticated;

drop policy if exists "Anyone can read private corner posts" on public.private_corner_posts;
create policy "Anyone can read private corner posts"
  on public.private_corner_posts
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Mailbox owner can publish private corner posts" on public.private_corner_posts;
create policy "Mailbox owner can publish private corner posts"
  on public.private_corner_posts
  for insert
  to authenticated
  with check (public.is_mailbox_owner());

create table if not exists public.site_counters (
  id boolean primary key default true check (id),
  click_count bigint not null default 0 check (click_count >= 0),
  visit_count bigint not null default 0 check (visit_count >= 0)
);

insert into public.site_counters (id)
values (true)
on conflict (id) do nothing;

alter table public.site_counters enable row level security;

revoke all on public.site_counters from anon, authenticated;
grant select on public.site_counters to anon, authenticated;

drop policy if exists "Anyone can read site counters" on public.site_counters;
create policy "Anyone can read site counters"
  on public.site_counters
  for select
  to anon, authenticated
  using (true);

create or replace function public.increment_site_counter(p_counter text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count bigint;
begin
  if p_counter is null or p_counter not in ('clicks', 'visits') then
    raise exception 'Unknown site counter.';
  end if;

  if p_counter = 'clicks' then
    update public.site_counters
      set click_count = click_count + 1
      where id = true
      returning click_count into v_count;
  else
    update public.site_counters
      set visit_count = visit_count + 1
      where id = true
      returning visit_count into v_count;
  end if;

  if v_count is null then
    raise exception 'Site counters have not been initialized.';
  end if;
  return v_count;
end;
$$;

revoke all on function public.increment_site_counter(text) from public;
grant execute on function public.increment_site_counter(text) to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'site_counters'
  ) then
    alter publication supabase_realtime add table public.site_counters;
  end if;
end;
$$;
