create extension if not exists "vector";

create table public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    username text unique,
    display_name text,
    avatar_url text,
    created_at timestamptz default now()
);

create table public.projects (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    name text not null,
    description text,

    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table public.conversations (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    project_id uuid
        references public.projects(id)
        on delete cascade,

    title text,

    model text,

    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table public.messages (
    id uuid primary key default gen_random_uuid(),

    conversation_id uuid not null
        references public.conversations(id)
        on delete cascade,

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    role text not null
        check (role in ('user', 'assistant', 'system', 'tool')),

    content text,

    model text,

    input_tokens integer,
    output_tokens integer,

    created_at timestamptz default now()
);

create table public.files (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    project_id uuid
        references public.projects(id)
        on delete cascade,

    filename text not null,
    storage_path text not null,
    mime_type text not null,
    size_bytes bigint not null,

    created_at timestamptz default now()
);

create table public.generations (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    conversation_id uuid
        references public.conversations(id)
        on delete set null,

    generation_type text not null,

    model text not null,

    prompt text,

    output_path text,

    status text not null default 'completed',

    created_at timestamptz default now()
);

create table public.usage (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    provider text not null,
    model text not null,

    request_type text not null,

    input_tokens integer default 0,
    output_tokens integer default 0,

    created_at timestamptz default now()
);

create table public.embeddings (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    project_id uuid
        references public.projects(id)
        on delete cascade,

    file_id uuid
        references public.files(id)
        on delete cascade,

    content text not null,

    embedding vector(1536),

    created_at timestamptz default now()
);

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.files enable row level security;
alter table public.generations enable row level security;
alter table public.usage enable row level security;
alter table public.embeddings enable row level security;

-- Projects RLS
create policy "Users can view own projects"
on public.projects
for select
using (auth.uid() = user_id);

create policy "Users can create own projects"
on public.projects
for insert
with check (auth.uid() = user_id);

create policy "Users can update own projects"
on public.projects
for update
using (auth.uid() = user_id);

create policy "Users can delete own projects"
on public.projects
for delete
using (auth.uid() = user_id);

-- Conversations RLS
create policy "Users can view own conversations"
on public.conversations
for select
using (auth.uid() = user_id);

create policy "Users can create own conversations"
on public.conversations
for insert
with check (auth.uid() = user_id);

-- Messages RLS
create policy "Users can view own messages"
on public.messages
for select
using (auth.uid() = user_id);

create policy "Users can create own messages"
on public.messages
for insert
with check (auth.uid() = user_id);

-- Files RLS
create policy "Users can view own files"
on public.files
for select
using (auth.uid() = user_id);

create policy "Users can create own files"
on public.files
for insert
with check (auth.uid() = user_id);

-- Generations RLS
create policy "Users can view own generations"
on public.generations
for select
using (auth.uid() = user_id);

create policy "Users can create own generations"
on public.generations
for insert
with check (auth.uid() = user_id);

-- Usage RLS
create policy "Users can view own usage"
on public.usage
for select
using (auth.uid() = user_id);

-- Embeddings RLS
create policy "Users can view own embeddings"
on public.embeddings
for select
using (auth.uid() = user_id);

create policy "Users can create own embeddings"
on public.embeddings
for insert
with check (auth.uid() = user_id);
