-- MAFD Eventos - Sprint de Check-in
-- Execute este arquivo manualmente no SQL Editor do Supabase.
-- O script e idempotente, preserva os dados e nao altera as politicas atuais de INSERT anonimo.

-- A transacao garante que uma falha interrompa e reverta a migracao inteira.
begin;

-- Bloco 1: dependencia para tokens UUID criptograficamente aleatorios.
-- gen_random_uuid() nao incorpora dados pessoais e nao produz valores sequenciais.
create extension if not exists pgcrypto;

-- Bloco 2: colunas de controle do check-in.
-- checkin_token e criado inicialmente sem NOT NULL para permitir a migracao segura dos registros existentes.
alter table public.confirmacoes
  add column if not exists checkin_token uuid,
  add column if not exists checkin_realizado boolean not null default false,
  add column if not exists checkin_em timestamptz,
  add column if not exists checkin_por uuid,
  add column if not exists atualizado_em timestamptz default now();

-- Bloco 3: defaults e compatibilidade com execucoes parciais anteriores.
-- Valores nulos sao normalizados antes da criacao das restricoes.
alter table public.confirmacoes
  alter column checkin_token set default gen_random_uuid(),
  alter column checkin_realizado set default false,
  alter column atualizado_em set default now();

update public.confirmacoes
set checkin_realizado = false
where checkin_realizado is null;

update public.confirmacoes
set atualizado_em = coalesce(atualizado_em, criado_em, now())
where atualizado_em is null;

-- Bloco 4: preenchimento dos tokens antigos e reparo defensivo de eventuais duplicidades.
-- A primeira atualizacao contempla todos os registros criados antes desta sprint.
update public.confirmacoes
set checkin_token = gen_random_uuid()
where checkin_token is null;

-- Se uma execucao parcial ou insercao administrativa anterior tiver repetido um token,
-- somente as ocorrencias posteriores recebem um novo UUID; nenhum registro e apagado.
with tokens_repetidos as (
  select
    id,
    row_number() over (
      partition by checkin_token
      order by criado_em nulls last, id
    ) as ocorrencia
  from public.confirmacoes
  where checkin_token is not null
)
update public.confirmacoes as confirmacao
set checkin_token = gen_random_uuid()
from tokens_repetidos
where confirmacao.id = tokens_repetidos.id
  and tokens_repetidos.ocorrencia > 1;

-- Bloco 5: compatibilidade com check-ins oriundos de uma execucao parcial.
-- Um check-in ja marcado como realizado recebe um horario coerente antes da restricao.
update public.confirmacoes
set checkin_em = coalesce(checkin_em, atualizado_em, criado_em, now())
where checkin_realizado is true
  and checkin_em is null;

-- Bloco 6: obrigatoriedade e integridade dos estados.
-- O tipo uuid impede tokens vazios; NOT NULL e o indice unico impedem ausencia e repeticao.
alter table public.confirmacoes
  alter column checkin_token set not null,
  alter column checkin_realizado set not null;

create unique index if not exists idx_confirmacoes_checkin_token_unique
  on public.confirmacoes (checkin_token);

-- A restricao permite checkin_em nulo enquanto o check-in nao ocorreu,
-- mas exige o horario assim que checkin_realizado for verdadeiro.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'confirmacoes_checkin_estado_check'
      and conrelid = 'public.confirmacoes'::regclass
  ) then
    alter table public.confirmacoes
      add constraint confirmacoes_checkin_estado_check
      check (checkin_realizado is false or checkin_em is not null);
  end if;
end;
$$;

-- Bloco 7: documentacao das novas colunas e do indice.
comment on column public.confirmacoes.checkin_token is
  'Token UUID individual, aleatorio e sem dados pessoais usado para localizar o check-in.';
comment on column public.confirmacoes.checkin_realizado is
  'Indica se a confirmacao ja foi validada na entrada do evento.';
comment on column public.confirmacoes.checkin_em is
  'Data e hora em que o check-in foi efetivamente realizado.';
comment on column public.confirmacoes.checkin_por is
  'UUID do usuario autenticado que realizou o check-in, quando disponivel.';
comment on column public.confirmacoes.atualizado_em is
  'Data e hora da ultima alteracao do registro.';
comment on index public.idx_confirmacoes_checkin_token_unique is
  'Garante um unico registro para cada token individual de check-in.';

-- Bloco 8: funcao atomica de check-in.
-- SECURITY DEFINER permite a operacao controlada sem conceder SELECT ou UPDATE na tabela.
-- A autorizacao exige usuario autenticado e app_metadata.mafd_role igual a checkin ou admin.
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
  -- A permissao EXECUTE pertence a authenticated, e esta verificacao limita
  -- a operacao aos usuarios explicitamente autorizados no app_metadata.
  if v_usuario is null or v_papel not in ('checkin', 'admin') then
    raise exception 'Usuario nao autorizado para realizar check-in.'
      using errcode = '42501';
  end if;

  -- Token nulo e tratado como inexistente sem consultar ou expor participantes.
  if p_token is null then
    return query
    select
      null::uuid,
      null::text,
      null::text,
      null::integer,
      false,
      null::timestamptz,
      'nao_encontrado'::text;
    return;
  end if;

  -- FOR UPDATE bloqueia a linha ate o fim da transacao. Uma segunda chamada
  -- simultanea aguarda a primeira e depois observa o estado ja realizado.
  select confirmacao.*
  into v_confirmacao
  from public.confirmacoes as confirmacao
  where confirmacao.checkin_token = p_token
  for update;

  if not found then
    return query
    select
      null::uuid,
      null::text,
      null::text,
      null::integer,
      false,
      null::timestamptz,
      'nao_encontrado'::text;
    return;
  end if;

  if v_confirmacao.checkin_realizado is true then
    return query
    select
      v_confirmacao.id,
      v_confirmacao.nome_completo,
      v_confirmacao.igreja,
      v_confirmacao.quantidade_convidados,
      v_confirmacao.checkin_realizado,
      v_confirmacao.checkin_em,
      'ja_realizado'::text;
    return;
  end if;

  update public.confirmacoes as confirmacao
  set
    checkin_realizado = true,
    checkin_em = now(),
    checkin_por = v_usuario,
    atualizado_em = now()
  where confirmacao.id = v_confirmacao.id
  returning confirmacao.* into v_confirmacao;

  return query
  select
    v_confirmacao.id,
    v_confirmacao.nome_completo,
    v_confirmacao.igreja,
    v_confirmacao.quantidade_convidados,
    v_confirmacao.checkin_realizado,
    v_confirmacao.checkin_em,
    'realizado'::text;
end;
$$;

comment on function public.realizar_checkin(uuid) is
  'Realiza check-in atomico por token UUID e retorna somente os dados necessarios para a recepcao.';

-- Bloco 9: privilegios minimos e RLS.
-- RLS permanece habilitado. Nenhuma politica existente e removida ou substituida.
alter table public.confirmacoes enable row level security;

-- Remove a permissao EXECUTE implicita de PUBLIC e qualquer concessao anonima.
-- authenticated pode chamar a funcao, mas a funcao ainda valida app_metadata.mafd_role.
revoke all on function public.realizar_checkin(uuid) from public;
revoke all on function public.realizar_checkin(uuid) from anon;
revoke all on function public.realizar_checkin(uuid) from authenticated;
grant execute on function public.realizar_checkin(uuid) to authenticated;

-- Bloco 10: garantias deliberadas deste script.
-- Nao ha GRANT SELECT publico, GRANT UPDATE para anon, DROP TABLE ou service_role.
-- A politica de INSERT anonimo definida em supabase/estrutura.sql permanece intacta.

commit;
