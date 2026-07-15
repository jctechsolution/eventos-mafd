-- MAFD Eventos - Sprint 6 - Recepcao protegida
-- Execute manualmente no SQL Editor somente depois de supabase/checkin.sql.
-- Este script e idempotente, nao cria SELECT/UPDATE publico e preserva o INSERT anonimo existente.

begin;

-- Consulta controlada: somente usuarios autenticados com papel checkin ou admin.
-- SECURITY DEFINER permite ler a linha sem conceder SELECT direto na tabela.
create or replace function public.consultar_checkin(p_token uuid)
returns table (
  id uuid,
  nome_completo text,
  igreja text,
  primeira_vez boolean,
  participa_coquetel boolean,
  quantidade_convidados integer,
  checkin_realizado boolean,
  checkin_em timestamptz,
  resultado text
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_usuario uuid := auth.uid();
  v_papel text := coalesce(auth.jwt() -> 'app_metadata' ->> 'mafd_role', '');
  v_confirmacao public.confirmacoes%rowtype;
begin
  if v_usuario is null or v_papel not in ('checkin', 'admin') then
    raise exception 'Usuario nao autorizado para consultar check-in.' using errcode = '42501';
  end if;

  if p_token is null then
    return query select null::uuid, null::text, null::text, null::boolean, null::boolean,
      null::integer, false, null::timestamptz, 'nao_encontrado'::text;
    return;
  end if;

  select confirmacao.* into v_confirmacao
  from public.confirmacoes as confirmacao
  where confirmacao.checkin_token = p_token;

  if not found then
    return query select null::uuid, null::text, null::text, null::boolean, null::boolean,
      null::integer, false, null::timestamptz, 'nao_encontrado'::text;
    return;
  end if;

  return query select
    v_confirmacao.id,
    v_confirmacao.nome_completo,
    v_confirmacao.igreja,
    v_confirmacao.primeira_vez,
    v_confirmacao.participa_coquetel,
    v_confirmacao.quantidade_convidados,
    v_confirmacao.checkin_realizado,
    v_confirmacao.checkin_em,
    case when v_confirmacao.checkin_realizado then 'ja_realizado' else 'encontrado' end::text;
end;
$$;

comment on function public.consultar_checkin(uuid) is
  'Consulta dados minimos de check-in por UUID para recepcionistas autorizados.';

-- Check-in atomico. FOR UPDATE impede que duas requisicoes simultaneas liberem a mesma entrada.
create or replace function public.realizar_checkin(p_token uuid)
returns table (
  id uuid,
  nome_completo text,
  igreja text,
  quantidade_convidados integer,
  checkin_realizado boolean,
  checkin_em timestamptz,
  resultado text
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_usuario uuid := auth.uid();
  v_papel text := coalesce(auth.jwt() -> 'app_metadata' ->> 'mafd_role', '');
  v_confirmacao public.confirmacoes%rowtype;
begin
  if v_usuario is null or v_papel not in ('checkin', 'admin') then
    raise exception 'Usuario nao autorizado para realizar check-in.' using errcode = '42501';
  end if;

  if p_token is null then
    return query select null::uuid, null::text, null::text, null::integer,
      false, null::timestamptz, 'nao_encontrado'::text;
    return;
  end if;

  select confirmacao.* into v_confirmacao
  from public.confirmacoes as confirmacao
  where confirmacao.checkin_token = p_token
  for update;

  if not found then
    return query select null::uuid, null::text, null::text, null::integer,
      false, null::timestamptz, 'nao_encontrado'::text;
    return;
  end if;

  if v_confirmacao.checkin_realizado then
    return query select v_confirmacao.id, v_confirmacao.nome_completo, v_confirmacao.igreja,
      v_confirmacao.quantidade_convidados, true, v_confirmacao.checkin_em, 'ja_realizado'::text;
    return;
  end if;

  update public.confirmacoes as confirmacao
  set checkin_realizado = true, checkin_em = now(), checkin_por = v_usuario, atualizado_em = now()
  where confirmacao.id = v_confirmacao.id
  returning confirmacao.* into v_confirmacao;

  return query select v_confirmacao.id, v_confirmacao.nome_completo, v_confirmacao.igreja,
    v_confirmacao.quantidade_convidados, true, v_confirmacao.checkin_em, 'realizado'::text;
end;
$$;

comment on function public.realizar_checkin(uuid) is
  'Realiza check-in atomico e impede reutilizacao simultanea do mesmo UUID.';

-- Privilegios minimos: nenhuma das RPCs pode ser chamada por PUBLIC ou anon.


revoke all on function public.consultar_checkin(uuid) from public;
revoke all on function public.consultar_checkin(uuid) from anon;
revoke all on function public.consultar_checkin(uuid) from authenticated;
grant execute on function public.consultar_checkin(uuid) to authenticated;

revoke all on function public.realizar_checkin(uuid) from public;
revoke all on function public.realizar_checkin(uuid) from anon;
revoke all on function public.realizar_checkin(uuid) from authenticated;
grant execute on function public.realizar_checkin(uuid) to authenticated;

-- Deliberadamente nao ha GRANT SELECT/UPDATE na tabela, chave administrativa ou alteracao de RLS.

revoke all on function public.consultar_checkin(uuid) from public;
revoke all on function public.consultar_checkin(uuid) from anon;
revoke all on function public.consultar_checkin(uuid) from authenticated;
grant execute on function public.consultar_checkin(uuid) to authenticated;

revoke all on function public.realizar_checkin(uuid) from public;
revoke all on function public.realizar_checkin(uuid) from anon;
revoke all on function public.realizar_checkin(uuid) from authenticated;
grant execute on function public.realizar_checkin(uuid) to authenticated;

-- Impede acesso direto aos cadastros pela API REST.
-- Usuários da recepção acessam apenas as funções protegidas.
drop policy if exists authenticated_select_confirmacoes
on public.confirmacoes;

revoke select, update, delete
on table public.confirmacoes
from authenticated;

commit;
