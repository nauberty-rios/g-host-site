# G-Host — publicação direta pelo painel

Depois desta configuração inicial, o fluxo será:

1. Abra `admin.html`.
2. Edite o site.
3. Clique em **Salvar e publicar**.
4. O Publicador atualiza `site-data.js` no GitHub.
5. O GitHub Pages publica a nova versão automaticamente.

## Por que existe um Publicador?

O GitHub Pages serve arquivos estáticos. Colocar um token do GitHub dentro de `admin.js` ou de qualquer HTML deixaria a credencial visível para visitantes.

Por isso, este projeto inclui um pequeno Cloudflare Worker. Ele guarda:
- o token do GitHub;
- a senha do painel;

como **secrets do servidor**, fora do código público.

O Worker só atualiza `site-data.js`.

---

## ETAPA 1 — Site no GitHub Pages

Envie os arquivos da raiz deste pacote ao seu repositório.

No GitHub:
- `Settings`
- `Pages`
- `Deploy from a branch`
- branch: `main`
- pasta: `/ (root)`

Exemplo:
`https://SEU_USUARIO.github.io/g-host-site/`

O painel será:
`https://SEU_USUARIO.github.io/g-host-site/admin.html`

---

## ETAPA 2 — Criar um token de acesso refinado no GitHub

Crie um **fine-grained personal access token** limitado somente ao repositório do site.

Configure:
- Repository access: somente `g-host-site`
- Repository permissions:
  - Contents: Read and write
  - Metadata: Read

Não coloque esse token em nenhum arquivo deste projeto.

---

## ETAPA 3 — Criar o Cloudflare Worker

Crie um Worker chamado, por exemplo:

`g-host-publisher`

Use o conteúdo de:

`publisher-worker/worker.js`

### Variáveis normais

Configure:

- `GITHUB_OWNER` = seu usuário do GitHub
- `GITHUB_REPO` = nome do repositório
- `GITHUB_BRANCH` = `main`
- `ALLOWED_ORIGINS` = origem do GitHub Pages, sem caminho
- `SITE_URL` = endereço completo do site

Exemplo:

- `GITHUB_OWNER` = `joaosilva`
- `GITHUB_REPO` = `g-host-site`
- `GITHUB_BRANCH` = `main`
- `ALLOWED_ORIGINS` = `https://joaosilva.github.io`
- `SITE_URL` = `https://joaosilva.github.io/g-host-site/`

Se usar domínio próprio, coloque a origem dele em `ALLOWED_ORIGINS`.

### Secrets

Crie dois secrets no Worker:

- `GITHUB_TOKEN` = token refinado criado no GitHub
- `ADMIN_PASSWORD` = uma senha forte só sua

Não use uma senha que você usa em e-mail, banco, GitHub ou outras contas.

---

## ETAPA 4 — Conectar o painel

Depois de publicar o Worker, ele terá um endereço parecido com:

`https://g-host-publisher.SEUSUBDOMINIO.workers.dev`

Abra:

`https://SEU_USUARIO.github.io/g-host-site/admin.html`

Em **Conexão de publicação**:

- coloque a URL do Worker;
- digite sua senha de publicação;
- edite o site;
- clique em **Salvar e publicar**.

A URL do Worker fica salva no navegador.
A senha de publicação não fica salva.

---

## Segurança

- Nunca coloque `GITHUB_TOKEN` no GitHub Pages.
- Nunca escreva o token em `admin.js`, `site-data.js`, HTML ou README público.
- O token deve ter acesso somente ao repositório do site.
- O Worker aceita publicações somente da origem configurada.
- O endpoint altera somente `site-data.js`.
- Use uma senha de publicação forte.

## Teste do Worker

Abra:

`https://SEU-WORKER.workers.dev/health`

Deve responder com um JSON indicando que o serviço está ativo.

O endpoint `/publish` exige origem autorizada e senha.
