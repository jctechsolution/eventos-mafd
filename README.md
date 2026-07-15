# MAFD Eventos

Landing page premium e responsiva para o evento “Festa de Crente... Com Homens de Deus”, criada com HTML5 semântico, CSS3 moderno e JavaScript puro.

## Objetivo

Apresentar o evento com uma identidade visual forte, inspirada em uma experiência digital profissional e premium, com foco em uma comunicação cristã, masculina e elegante.

## Estrutura de pastas

- index.html — landing page principal
- assets/css/styles.css — estilos visuais do site
- assets/js/app.js — interações, contagem regressiva, formulário e compartilhamento
- assets/js/config.js — configuração central de dados do evento
- pages/admin.html — painel administrativo temporário
- assets/css/admin.css — estilos do painel administrativo
- assets/js/admin.js — leitura e gestão das confirmações salvas no localStorage
- supabase/estrutura.sql — estrutura inicial da tabela de confirmações para Supabase
- README.md — documentação do projeto

## Como executar

1. Abra a pasta do projeto no VS Code.
2. Clique com o botão direito em index.html e escolha “Open with Live Server”.
3. O site será aberto em uma aba do navegador.

## Como abrir o painel administrativo

Abra diretamente a página [pages/admin.html](pages/admin.html) no navegador ou acesse o caminho relativo após subir o projeto em um servidor local.

## Recuperação do ingresso digital

Participantes que já confirmaram presença podem usar **Recuperar meu ingresso** na seção de confirmação. O ingresso é reconstruído com o `checkin_token` original, portanto o QR Code e o código curto permanecem os mesmos e nenhuma nova confirmação é criada.

Existem dois caminhos:

- **Recuperação local:** após uma confirmação ou recuperação online bem-sucedida, o navegador salva em `mafd_ultimo_ingresso_v1` somente nome, token, total de participantes, data da confirmação e identificação do evento. Não são armazenados WhatsApp, observação, consentimento ou dados administrativos.
- **Recuperação online:** exige nome completo e WhatsApp juntos e chama a função controlada `public.recuperar_ingresso(text, text)`. A função retorna somente os dados mínimos do ingresso e não concede leitura direta da tabela `public.confirmacoes`.

Antes de disponibilizar a recuperação online, execute manualmente no SQL Editor do Supabase, depois de `supabase/checkin.sql`:

```sql
-- conteúdo de supabase/recuperacao_ingresso.sql
```

O arquivo [supabase/recuperacao_ingresso.sql](supabase/recuperacao_ingresso.sql) é idempotente, mantém RLS ativo, revoga execução de `PUBLIC` e concede a RPC somente a `anon` e `authenticated`. Ele não deve ser executado automaticamente pelo frontend ou pelo processo de publicação.

Como nome completo e WhatsApp formam um fator de recuperação baseado em conhecimento, esta primeira versão reduz tentativas repetidas no frontend, mas não substitui proteção no servidor. Antes de ampliar a exposição pública, recomenda-se adicionar CAPTCHA e rate limiting na borda ou em uma Edge Function.

## Limitação atual

O cache local do último ingresso serve apenas para reabertura no mesmo dispositivo. O Supabase permanece como fonte oficial para confirmações e recuperação em outros dispositivos.

## Próximos passos

- Adicionar CAPTCHA e rate limiting à recuperação online.
- Criar autenticação para o painel administrativo.
- Publicar o projeto no Cloudflare Pages.
- Adicionar GitHub para versionamento e deploy contínuo.
