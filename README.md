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

## Limitação atual

As confirmações são armazenadas temporariamente no localStorage do navegador. Isso permite testar a experiência sem backend, mas não substitui uma base de dados compartilhada.

## Próximos passos

- Substituir o armazenamento local por integração com o Supabase.
- Criar autenticação para o painel administrativo.
- Publicar o projeto no Cloudflare Pages.
- Adicionar GitHub para versionamento e deploy contínuo.
