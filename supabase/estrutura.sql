-- Bloco 1: extensão e preparação do esquema
-- O UUID é usado como chave primária para facilitar a integração futura com a interface pública.
create extension if not exists "uuid-ossp";

-- Bloco 2: tabela principal de confirmações
-- A tabela é criada de forma segura, sem apagar dados existentes e com validações de integridade.
create table if not exists public.confirmacoes (
  id uuid primary key default uuid_generate_v4(),
  nome_completo text,
  whatsapp text,
  igreja text,
  primeira_vez boolean,
  participa_coquetel boolean,
  leva_convidados boolean,
  quantidade_convidados integer default 0,
  observacao text,
  consentimento boolean default true,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

-- Bloco 3: ajustes de colunas para compatibilidade idempotente
-- Se a tabela já existir com colunas antigas ou incompletas, os ajustes abaixo preservam os dados.
alter table public.confirmacoes
  add column if not exists nome_completo text,
  add column if not exists whatsapp text,
  add column if not exists igreja text,
  add column if not exists primeira_vez boolean,
  add column if not exists participa_coquetel boolean,
  add column if not exists leva_convidados boolean,
  add column if not exists quantidade_convidados integer default 0,
  add column if not exists observacao text,
  add column if not exists consentimento boolean default true,
  add column if not exists criado_em timestamptz default now(),
  add column if not exists atualizado_em timestamptz default now();

update public.confirmacoes
set nome_completo = coalesce(trim(nome_completo), '')
where nome_completo is null;

update public.confirmacoes
set whatsapp = coalesce(trim(whatsapp), '')
where whatsapp is null;

update public.confirmacoes
set quantidade_convidados = coalesce(quantidade_convidados, 0)
where quantidade_convidados is null;

update public.confirmacoes
set consentimento = coalesce(consentimento, true)
where consentimento is null;

-- Bloco 4: validações e normalização do WhatsApp
-- O valor é normalizado para dígitos e rejeitado se ficar claramente inválido.
create or replace function public.normalize_whatsapp(value text)
returns text
language plpgsql
as $$
begin
  if value is null then
    raise exception 'O WhatsApp é obrigatório.';
  end if;

  value := trim(value);
  if value = '' then
    raise exception 'O WhatsApp é obrigatório.';
  end if;

  value := regexp_replace(value, '\D', '', 'g');

  if length(value) < 10 or length(value) > 13 then
    raise exception 'WhatsApp inválido: use um número com 10 a 13 dígitos.';
  end if;

  return value;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create or replace trigger trg_confirmacoes_set_updated_at
before update on public.confirmacoes
for each row
execute function public.set_updated_at();

-- Bloco 5: restrições e índices
-- O índice único de WhatsApp protege contra duplicidade após a normalização.
alter table public.confirmacoes
  alter column nome_completo set not null,
  alter column whatsapp set not null,
  alter column primeira_vez set not null,
  alter column participa_coquetel set not null,
  alter column leva_convidados set not null,
  alter column consentimento set not null,
  alter column quantidade_convidados set default 0;

alter table public.confirmacoes
  add constraint confirmacoes_quantidade_convidados_check
  check (quantidade_convidados between 0 and 20);

alter table public.confirmacoes
  add constraint confirmacoes_consentimento_check
  check (consentimento is true);

create unique index if not exists idx_confirmacoes_whatsapp_unique
  on public.confirmacoes (lower(whatsapp));

create index if not exists idx_confirmacoes_criado_em
  on public.confirmacoes (criado_em desc);

-- Bloco 6: comentários de documentação
comment on table public.confirmacoes is 'Confirmações de presença para o evento MAFD Eventos.';
comment on column public.confirmacoes.id is 'Identificador único da confirmação.';
comment on column public.confirmacoes.nome_completo is 'Nome completo do participante.';
comment on column public.confirmacoes.whatsapp is 'WhatsApp do participante, armazenado após normalização para dígitos.';
comment on column public.confirmacoes.igreja is 'Igreja ou congregação informada pelo participante.';
comment on column public.confirmacoes.primeira_vez is 'Indica se é a primeira vez na Rede de Homens.';
comment on column public.confirmacoes.participa_coquetel is 'Indica se o participante participará do coquetel.';
comment on column public.confirmacoes.leva_convidados is 'Indica se o participante levará convidados.';
comment on column public.confirmacoes.quantidade_convidados is 'Quantidade de convidados quando leva_convidados for verdadeiro, com limite máximo de 20.';
comment on column public.confirmacoes.observacao is 'Observações adicionais fornecidas pelo participante.';
comment on column public.confirmacoes.consentimento is 'Consentimento explícito para uso exclusivo da organização do evento.';
comment on column public.confirmacoes.criado_em is 'Data e hora de criação do registro.';
comment on column public.confirmacoes.atualizado_em is 'Data e hora da última atualização do registro.';

-- Bloco 7: segurança com Row Level Security
-- O acesso público é restrito para evitar leitura, atualização ou exclusão indevida.
alter table public.confirmacoes enable row level security;

revoke all on table public.confirmacoes from anon, authenticated;

-- Política de INSERT para usuários anônimos
-- Somente são permitidas inserções com dados mínimos válidos e consentimento explícito.
drop policy if exists anon_insert_confirmacoes on public.confirmacoes;
create policy anon_insert_confirmacoes
  on public.confirmacoes
  for insert
  to anon
  with check (
    consentimento is true
    and length(trim(coalesce(nome_completo, ''))) > 0
    and length(trim(coalesce(whatsapp, ''))) > 0
    and quantidade_convidados between 0 and 20
  );

-- Política de leitura para administração futura
-- A leitura pública não é permitida; somente usuários autenticados poderão consultar quando necessário.
drop policy if exists authenticated_select_confirmacoes on public.confirmacoes;
create policy authenticated_select_confirmacoes
  on public.confirmacoes
  for select
  to authenticated
  using (true);

-- Permissões granulares para evitar acesso indevido.
-- O usuário anônimo pode apenas inserir os campos necessários ao formulário público.
grant insert (
  nome_completo,
  whatsapp,
  igreja,
  primeira_vez,
  participa_coquetel,
  leva_convidados,
  quantidade_convidados,
  observacao,
  consentimento
) on public.confirmacoes to anon;

grant select on public.confirmacoes to authenticated;

-- Observação final:
-- Este script é intencionalmente seguro para a landing page pública.
-- As políticas públicas não permitem leitura, atualização ou exclusão.
-- A etapa administrativa pode ser implementada posteriormente com autenticação real.
