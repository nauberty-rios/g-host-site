# COMO COLOCAR ESTA VERSÃO NO GITHUB

## 1. Faça backup

GitHub → `nauberty-rios/g-host-site` → **Código** → **Baixar ZIP**.

## 2. Substitua os arquivos do repositório

GitHub → `nauberty-rios/g-host-site` → **Código** → **Adicionar arquivo** → **Carregar arquivos**.

Envie o conteúdo desta pasta mantendo a pasta `publisher-worker`.

Confirme o commit na branch `main`.

## 3. GitHub Pages

GitHub → `g-host-site` → **Configurações** → **Pages** → confirme publicação pela branch `main` e pasta `/ (root)`.

## 4. Atualize o Worker na Cloudflare

Cloudflare → **Workers & Pages** → `g-host-secure` → **Editar código**.

Substitua pelo arquivo `publisher-worker/worker.js`, implante e mantenha os bindings/secrets atuais.

Os novos painéis precisam dos endpoints `/publish-catalog` e `/publish-visibility` presentes nesta versão.

## 5. Teste nesta ordem

1. Abra `/health` do Worker.
2. Abra `planos-admin.html` e conclua senha + e-mail + TOTP.
3. Abra `catalogo-admin.html`, altere somente um item e publique.
4. Abra `visibilidade-admin.html`, oculte/mostre uma seção e publique.
5. Abra `index.html` em aba anônima e confirme o autoatendimento.

## Observação

A integração do ChatGPT com o GitHub não possui permissão de escrita neste repositório no momento; por isso o pacote foi preparado para upload manual.
