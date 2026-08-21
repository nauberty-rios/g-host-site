# Domínio próprio G-Host

Domínio canônico: `https://g-host.com.br/`

## 1. GitHub Pages

GitHub → `g-host-site` → Configurações → Pages → Domínio personalizado → digite `g-host.com.br` → Salvar.

O repositório já contém `CNAME` com `g-host.com.br`.

## 2. DNS do domínio

No provedor DNS, configure o domínio raiz com os registros A do GitHub Pages:

- `@` → `185.199.108.153`
- `@` → `185.199.109.153`
- `@` → `185.199.110.153`
- `@` → `185.199.111.153`

Para `www`:

- `www` → CNAME → `nauberty-rios.github.io`

Não use wildcard `*`.

Depois que o GitHub concluir o certificado, ative **Forçar HTTPS / Enforce HTTPS**.

## 3. Cloudflare Worker

Enquanto a migração estiver em teste, mantenha em `ALLOWED_ORIGINS`:

`https://g-host.com.br,https://www.g-host.com.br,https://nauberty-rios.github.io`

Depois que `g-host.com.br` estiver estável e todos os testes passarem, remova `https://nauberty-rios.github.io`.

Defina também:

- `SITE_URL=https://g-host.com.br/`
- `EMAIL_FROM=G-Host <acesso@g-host.com.br>` somente depois de validar o domínio no Resend.

## 4. Ordem segura

1. Registrar/possuir o domínio.
2. Configurar o domínio em GitHub Pages.
3. Configurar DNS.
4. Esperar a verificação/certificado HTTPS.
5. Atualizar `ALLOWED_ORIGINS` no Worker.
6. Testar site, cadastro, login, cliente e admin.
7. Só então remover o origin antigo do GitHub Pages.
