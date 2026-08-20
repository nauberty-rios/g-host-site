# Como colocar esta versão no GitHub

## 1. Faça backup

GitHub → `nauberty-rios/g-host-site` → **Código** → **Baixar ZIP**.

## 2. Substitua os arquivos do repositório

GitHub → `nauberty-rios/g-host-site` → **Código** → **Adicionar arquivo** → **Carregar arquivos**.

Abra a pasta `G-HOST-PLATAFORMA-INTEGRADA` no computador e envie **os arquivos que estão dentro dela**. Não envie a pasta externa como `/G-HOST-PLATAFORMA-INTEGRADA/...`.

A pasta `publisher-worker` deve continuar como subpasta.

Confirme o commit na branch `main`.

## 3. GitHub Pages

GitHub → `g-host-site` → **Configurações** → **Pages** → confirme branch `main` e pasta `/ (root)`.

Teste:
- `index.html`
- `cliente.html`
- `admin.html`
- `staff.html`

## 4. Só depois atualize Cloudflare

A ordem completa está em `CHECKLIST-DEPLOY.md`:

1. arquivos no GitHub;
2. migração D1;
3. Worker;
4. testes de Dono, ADM, cliente, contrato e CFTV.

Não atualize o Worker antes de aplicar a migração D1 desta versão.

## Validação automática
Após o upload/commit, acesse:

`GitHub → g-host-site → Actions → Validar G-Host`

Só prossiga para D1/Cloudflare quando o job estiver verde. Se ficar vermelho, abra a execução para ver exatamente qual arquivo falhou.
