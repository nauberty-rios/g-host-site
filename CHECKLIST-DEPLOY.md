# Checklist de implantação — G-Host Plataforma Integrada

A ordem abaixo evita colocar o Worker novo em produção antes de o banco possuir as colunas/tabelas que ele usa.

## 1. GitHub primeiro

Na raiz de `g-host-site` devem aparecer diretamente, entre outros:

- `index.html`
- `cliente.html`
- `contrato.html`
- `admin.html`
- `staff.html`
- `planos-admin.html`, `catalogo-admin.html`, `visibilidade-admin.html`
- `staff-planos.html`, `staff-catalogo.html`, `staff-visibilidade.html`
- `plans-data.js`, `catalog-data.js`, `visibility-data.js`
- `publisher-worker/`

Não envie a pasta externa `G-HOST-PLATAFORMA-INTEGRADA` como um único diretório. Envie **o conteúdo dela** para a raiz.

Mantenha `publisher-worker/` como subpasta.

Confirme que o GitHub Pages abre `index.html`, `cliente.html` e as páginas administrativas sem erro 404.

Depois do commit, abra `GitHub → g-host-site → Actions → Validar G-Host` e confirme que a execução ficou verde antes de avançar para a Cloudflare.

## 2. D1 — antes de atualizar o Worker

No Cloudflare Dashboard, abra o banco `g-host-db` e execute:

`publisher-worker/migrations/003_plataforma_integrada.sql`

Se for um banco vazio, pode executar `publisher-worker/schema.sql` completo.

A migração desta entrega cria as novas tabelas de contas/portal/contratos/analytics/Guardião e inclui `auth_version`, usado para invalidar sessões após redefinição de segurança.

## 3. Worker

Atualize `g-host-secure` com:

`publisher-worker/worker.js`

Bindings esperados:
- `DB` → `g-host-db`
- `AUTH_KV` → namespace KV de autenticação

Variáveis/secrets usados:
- `ADMIN_PASSWORD` — secret
- `ADMIN_EMAIL` — secret
- `RESEND_API_KEY` — secret
- `AUTH_PEPPER` — secret
- `GITHUB_TOKEN` — secret; necessário somente para publicação do conteúdo no GitHub pelo painel
- `EMAIL_FROM`
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_BRANCH`
- `ALLOWED_ORIGINS`
- `SESSION_TTL_SECONDS`

Nunca coloque valores secretos nos arquivos públicos do GitHub.

## 4. E-mail de clientes e ADM

Cadastro, recuperação, aceite contratual e autenticação ADM usam OTP por e-mail. Antes de divulgar essas funções, configure no Resend um remetente/domínio autorizado a enviar para destinatários reais.

## 5. Testes obrigatórios em ordem

1. `/health` retorna `ok: true`.
2. Dono entra em `admin.html` com senha + e-mail + TOTP.
3. Primeira autenticação do Dono registra o navegador administrativo autorizado.
4. Crie uma conta de teste em `cliente.html` e confirme o e-mail.
5. A conta aparece em `admin.html` → **Usuários & permissões** como Visitante.
6. Promova a conta para `ADM`, marque apenas permissões de teste e salve.
7. Abra `staff.html` em um navegador de teste e confirme senha + e-mail + TOTP.
8. Confirme que o ADM vê somente os módulos autorizados.
9. No painel do Dono, use **Resetar MFA/aparelho ADM** e confirme que a sessão/navegador ADM anterior deixa de valer.
10. Teste um cliente: salve configuração no autoatendimento e envie proposta.
11. Confirme que o lead aparece no Control Center, altere o status da proposta e confira a notificação no portal.
12. Crie um contrato em rascunho, revise o texto, mude/envie como `pendente_aceite`.
13. No cliente, abra o contrato, peça o código de aceite por e-mail e confirme o OTP.
14. Verifique contrato `ativo`, `signed_at` e evidência em `legal_acceptances`.
15. Autorize 2 aparelhos CFTV.
16. Tentativa de um 3º aparelho deve ser bloqueada e gerar alerta/evento de segurança.
17. Abra um chamado, altere o status no Control Center e confira a notificação no portal.
18. Com um ADM sem `data_export`, confirme que exportação do banco é negada; habilite a permissão e teste novamente.
19. Em Segurança, confira os eventos e a auditoria administrativa.
20. Com analytics recusado, confirme que não são enviados eventos opcionais; com aceite, confirme os agregados no Control Center.

## 6. Recuperação do aparelho do Dono

Se o navegador autorizado do Dono for perdido ou o armazenamento local for apagado, a recuperação deve ser feita pelo proprietário na Cloudflare, após confirmar que está na conta correta:

`AUTH_KV` → remover a lista `auth:owner_devices` e as entradas `auth:owner_device:<id>` correspondentes.

Na autenticação completa seguinte (senha + e-mail + TOTP), o novo navegador será cadastrado.

Trate isso como procedimento administrativo de recuperação, não como login normal.

## 7. Recuperação de um ADM

Não altere KV manualmente para rotina normal. Use:

`admin.html` → **Usuários & permissões** → conta ADM → **Resetar MFA/aparelho ADM**.

A ação invalida a versão de autenticação da conta, revoga os navegadores ADM confiáveis e remove o TOTP do ADM. O próximo acesso cadastra novamente autenticador e navegador.

## 8. Não ativar como produção ainda

- Vídeo ao vivo CFTV sem Gateway e tokens de stream temporários.
- Reconhecimento biométrico/facial sem projeto jurídico e técnico específico.
- Despacho automático de polícia/SAMU/bombeiros.
- Contratos comerciais baseados nos textos de rascunho sem revisão jurídica brasileira.
- Promessas de detecção/IA antes de testes reais de falso positivo, falso negativo, latência e disponibilidade.
