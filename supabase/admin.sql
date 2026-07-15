-- MAFD Eventos - Sprint 8 - Painel Administrativo MVP
-- Execute manualmente no SQL Editor depois de checkin.sql, recepcao.sql e recuperacao_ingresso.sql.
-- Idempotente, sem SELECT/INSERT/UPDATE/DELETE direto para authenticated.

begin;

create or replace function public.usuario_eh_admin()
returns boolean
language sql
stable
set search_path = pg_catalog, public, auth
as $$
  select auth.uid() is not null
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'mafd_role', '') = 'admin';
$$;

create or replace function public.admin_resumo_evento()
returns table (
  total_confirmacoes bigint,
  total_convidados bigint,
  total_participantes bigint,
  total_primeira_vez bigint,
  total_coquetel bigint,
  total_checkins bigint,
  total_aguardando_checkin bigint,
  confirmacoes_hoje bigint,
  checkins_hoje bigint,
  atualizado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public.usuario_eh_admin() then
    raise exception 'Acesso administrativo nao autorizado.' using errcode = '42501';
  end if;

  return query
  select
    count(*)::bigint,
    coalesce(sum(coalesce(c.quantidade_convidados, 0)), 0)::bigint,
    (count(*) + coalesce(sum(coalesce(c.quantidade_convidados, 0)), 0))::bigint,
    count(*) filter (where c.primeira_vez is true)::bigint,
    count(*) filter (where c.participa_coquetel is true)::bigint,
    count(*) filter (where c.checkin_realizado is true)::bigint,
    count(*) filter (where c.checkin_realizado is not true)::bigint,
    count(*) filter (where (c.criado_em at time zone 'America/Manaus')::date = (now() at time zone 'America/Manaus')::date)::bigint,
    count(*) filter (where c.checkin_realizado is true and (c.checkin_em at time zone 'America/Manaus')::date = (now() at time zone 'America/Manaus')::date)::bigint,
    coalesce(max(c.atualizado_em), max(c.criado_em), now())
  from public.confirmacoes as c;
end;
$$;

comment on function public.admin_resumo_evento() is
  'Resumo sem dados pessoais. total_coquetel conta confirmacoes principais; convidados entram apenas em total_participantes.';

create or replace function public.admin_listar_confirmacoes(
  p_busca text default null,
  p_filtro_primeira_vez boolean default null,
  p_filtro_coquetel boolean default null,
  p_filtro_checkin text default 'todos',
  p_ordem text default 'mais_recentes',
  p_limite integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  nome_completo text,
  whatsapp text,
  igreja text,
  primeira_vez boolean,
  participa_coquetel boolean,
  leva_convidados boolean,
  quantidade_convidados integer,
  criado_em timestamptz,
  checkin_realizado boolean,
  checkin_em timestamptz,
  total_registros bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_busca text := left(trim(coalesce(p_busca, '')), 100);
  v_busca_numeros text;
  v_filtro_checkin text := lower(coalesce(p_filtro_checkin, 'todos'));
  v_ordem text := lower(coalesce(p_ordem, 'mais_recentes'));
  v_limite integer := least(100, greatest(10, coalesce(p_limite, 25)));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if not public.usuario_eh_admin() then
    raise exception 'Acesso administrativo nao autorizado.' using errcode = '42501';
  end if;
  if v_filtro_checkin not in ('todos', 'realizado', 'aguardando') then v_filtro_checkin := 'todos'; end if;
  if v_ordem not in ('mais_recentes', 'mais_antigos', 'nome_az', 'nome_za', 'checkin_recentes') then v_ordem := 'mais_recentes'; end if;
  v_busca_numeros := regexp_replace(v_busca, '[^0-9]', '', 'g');

  return query
  select
    c.id, c.nome_completo, c.whatsapp, c.igreja, c.primeira_vez,
    c.participa_coquetel, c.leva_convidados, c.quantidade_convidados,
    c.criado_em, c.checkin_realizado, c.checkin_em,
    count(*) over()::bigint
  from public.confirmacoes as c
  where (v_busca = ''
    or c.nome_completo ilike '%' || v_busca || '%'
    or coalesce(c.igreja, '') ilike '%' || v_busca || '%'
    or (v_busca_numeros <> '' and regexp_replace(c.whatsapp, '[^0-9]', '', 'g') like '%' || v_busca_numeros || '%'))
    and (p_filtro_primeira_vez is null or c.primeira_vez = p_filtro_primeira_vez)
    and (p_filtro_coquetel is null or c.participa_coquetel = p_filtro_coquetel)
    and (v_filtro_checkin = 'todos'
      or (v_filtro_checkin = 'realizado' and c.checkin_realizado is true)
      or (v_filtro_checkin = 'aguardando' and c.checkin_realizado is not true))
  order by
    case when v_ordem = 'mais_recentes' then c.criado_em end desc nulls last,
    case when v_ordem = 'mais_antigos' then c.criado_em end asc nulls last,
    case when v_ordem = 'nome_az' then lower(c.nome_completo) end asc nulls last,
    case when v_ordem = 'nome_za' then lower(c.nome_completo) end desc nulls last,
    case when v_ordem = 'checkin_recentes' then c.checkin_em end desc nulls last,
    c.id
  limit v_limite offset v_offset;
end;
$$;

create or replace function public.admin_exportar_confirmacoes()
returns table (
  nome_completo text,
  whatsapp text,
  igreja text,
  primeira_vez boolean,
  participa_coquetel boolean,
  leva_convidados boolean,
  quantidade_convidados integer,
  total_grupo integer,
  criado_em timestamptz,
  checkin_realizado boolean,
  checkin_em timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public.usuario_eh_admin() then
    raise exception 'Acesso administrativo nao autorizado.' using errcode = '42501';
  end if;
  return query
  select c.nome_completo, c.whatsapp, c.igreja, c.primeira_vez,
    c.participa_coquetel, c.leva_convidados, c.quantidade_convidados,
    (coalesce(c.quantidade_convidados, 0) + 1)::integer,
    c.criado_em, c.checkin_realizado, c.checkin_em
  from public.confirmacoes as c
  order by c.criado_em desc, c.id;
end;
$$;

comment on function public.admin_listar_confirmacoes(text, boolean, boolean, text, text, integer, integer) is
  'Lista administrativa paginada sem token, observacao, consentimento ou checkin_por.';
comment on function public.admin_exportar_confirmacoes() is
  'Exportacao administrativa minima para CSV, sem token ou dados de autenticacao.';
  

alter table public.confirmacoes
enable row level security;

-- Impede acesso direto aos dados pelo papel authenticated.
-- Administradores acessam as informações exclusivamente pelas RPCs.
revoke select, insert, update, delete
on table public.confirmacoes
from authenticated;

-- Necessário para que usuários autenticados consigam chamar
-- as funções autorizadas no schema public.
grant usage on schema public
to authenticated;

revoke all
on function public.usuario_eh_admin()
from public, anon, authenticated;

revoke all
on function public.admin_resumo_evento()
from public, anon, authenticated;

revoke all
on function public.admin_listar_confirmacoes(
  text,
  boolean,
  boolean,
  text,
  text,
  integer,
  integer
)
from public, anon, authenticated;

revoke all
on function public.admin_exportar_confirmacoes()
from public, anon, authenticated;

grant execute
on function public.admin_resumo_evento()
to authenticated;

grant execute
on function public.admin_listar_confirmacoes(
  text,
  boolean,
  boolean,
  text,
  text,
  integer,
  integer
)
to authenticated;

grant execute
on function public.admin_exportar_confirmacoes()
to authenticated;

commit;


--alter table public.confirmacoes enable row level security;
--revoke select, insert, update, delete on table public.confirmacoes from authenticated;

--revoke all on function public.usuario_eh_admin() from public, anon, authenticated;
--revoke all on function public.admin_resumo_evento() from public, anon, authenticated;
--revoke all on function public.admin_listar_confirmacoes(text, boolean, boolean, text, text, integer, integer) from public, anon, authenticated;
--revoke all on function public.admin_exportar_confirmacoes() from public, anon, authenticated;
--grant execute on function public.admin_resumo_evento() to authenticated;
--grant execute on function public.admin_listar_confirmacoes(text, boolean, boolean, text, text, integer, integer) to authenticated;
--grant execute on function public.admin_exportar_confirmacoes() to authenticated;

--commit;

-- VERIFICACOES MANUAIS (nao executadas automaticamente):
-- select proname from pg_proc where proname like 'admin_%' or proname = 'usuario_eh_admin';
-- select routine_name, grantee, privilege_type from information_schema.routine_privileges where routine_name like 'admin_%';
-- select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'confirmacoes';
-- select relrowsecurity from pg_class where oid = 'public.confirmacoes'::regclass;
