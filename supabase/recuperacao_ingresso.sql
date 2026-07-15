-- MAFD Eventos
-- Sprint 7 — Recuperação segura do ingresso digital
--
-- Execute manualmente no SQL Editor após:
--   supabase/checkin.sql
--   supabase/recepcao.sql
--
-- O script:
-- - não cria novas confirmações;
-- - não altera confirmações existentes;
-- - não concede SELECT direto na tabela;
-- - recupera o mesmo checkin_token já registrado;
-- - exige nome completo e WhatsApp simultaneamente.

begin;

create or replace function public.recuperar_ingresso(
  p_nome_completo text,
  p_whatsapp text
)
returns table (
  nome_completo text,
  igreja text,
  quantidade_convidados integer,
  checkin_token uuid,
  checkin_realizado boolean,
  checkin_em timestamptz,
  criado_em timestamptz,
  resultado text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_nome_original text;
  v_whatsapp_original text;

  v_nome_normalizado text;
  v_whatsapp_normalizado text;

  v_primeira public.confirmacoes%rowtype;
  v_quantidade_encontrada integer := 0;
begin
  /*
   * Limita as entradas antes de executar expressões regulares.
   * Isso reduz processamento desnecessário em entradas abusivamente grandes.
   */
  v_nome_original := trim(coalesce(p_nome_completo, ''));
  v_whatsapp_original := trim(coalesce(p_whatsapp, ''));

  if
    char_length(v_nome_original) < 3
    or char_length(v_nome_original) > 160
    or char_length(v_whatsapp_original) < 10
    or char_length(v_whatsapp_original) > 30
  then
    return query
    select
      null::text,
      null::text,
      null::integer,
      null::uuid,
      false,
      null::timestamptz,
      null::timestamptz,
      'nao_encontrado'::text;

    return;
  end if;

  /*
   * Normalização do nome:
   * - remove espaços externos;
   * - unifica espaços internos;
   * - converte para minúsculas;
   * - remove os acentos portugueses mais comuns.
   */
  v_nome_normalizado := translate(
    lower(
      regexp_replace(
        v_nome_original,
        '[[:space:]]+',
        ' ',
        'g'
      )
    ),
    'áàâãäéèêëíìîïóòôõöúùûüçñ',
    'aaaaaeeeeiiiiooooouuuucn'
  );

  /*
   * Normalização do telefone:
   * - mantém somente números;
   * - remove o código internacional 55 quando presente,
   *   preservando os últimos 10 ou 11 dígitos nacionais.
   */
  v_whatsapp_normalizado := right(
    regexp_replace(
      v_whatsapp_original,
      '[^0-9]',
      '',
      'g'
    ),
    11
  );

  if
    char_length(v_nome_normalizado) < 3
    or char_length(v_whatsapp_normalizado) not in (10, 11)
  then
    return query
    select
      null::text,
      null::text,
      null::integer,
      null::uuid,
      false,
      null::timestamptz,
      null::timestamptz,
      'nao_encontrado'::text;

    return;
  end if;

  /*
   * Busca no máximo duas correspondências.
   *
   * Uma correspondência:
   *   ingresso localizado.
   *
   * Duas correspondências:
   *   dados ambíguos.
   *
   * Nenhuma:
   *   ingresso não localizado.
   */
  for v_primeira in
    select confirmacao.*
    from public.confirmacoes as confirmacao
    where
      right(
        regexp_replace(
          coalesce(confirmacao.whatsapp, ''),
          '[^0-9]',
          '',
          'g'
        ),
        11
      ) = v_whatsapp_normalizado
      and translate(
        lower(
          regexp_replace(
            trim(coalesce(confirmacao.nome_completo, '')),
            '[[:space:]]+',
            ' ',
            'g'
          )
        ),
        'áàâãäéèêëíìîïóòôõöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucn'
      ) = v_nome_normalizado
    order by confirmacao.criado_em desc
    limit 2
  loop
    v_quantidade_encontrada := v_quantidade_encontrada + 1;

    exit when v_quantidade_encontrada > 1;
  end loop;

  if v_quantidade_encontrada = 0 then
    return query
    select
      null::text,
      null::text,
      null::integer,
      null::uuid,
      false,
      null::timestamptz,
      null::timestamptz,
      'nao_encontrado'::text;

    return;
  end if;

  if v_quantidade_encontrada > 1 then
    return query
    select
      null::text,
      null::text,
      null::integer,
      null::uuid,
      false,
      null::timestamptz,
      null::timestamptz,
      'dados_ambiguos'::text;

    return;
  end if;

  return query
  select
    v_primeira.nome_completo,
    v_primeira.igreja,
    coalesce(v_primeira.quantidade_convidados, 0),
    v_primeira.checkin_token,
    v_primeira.checkin_realizado,
    v_primeira.checkin_em,
    v_primeira.criado_em,
    'encontrado'::text;
end;
$$;

comment on function public.recuperar_ingresso(text, text) is
  'Recupera um único ingresso usando simultaneamente nome completo e WhatsApp, sem expor o telefone nem conceder leitura direta da tabela.';

alter table public.confirmacoes
enable row level security;

-- Remove permissões implícitas ou anteriores da função.
revoke all
on function public.recuperar_ingresso(text, text)
from public;

revoke all
on function public.recuperar_ingresso(text, text)
from anon;

revoke all
on function public.recuperar_ingresso(text, text)
from authenticated;

-- A Landing Page pública pode executar somente esta função.
grant execute
on function public.recuperar_ingresso(text, text)
to anon, authenticated;

-- Não há GRANT de SELECT, INSERT, UPDATE ou DELETE neste script.
-- A função exige nome completo e WhatsApp na mesma chamada
-- e retorna no máximo um ingresso.

commit;