# G-Host — Plataforma Integrada

Versão consolidada de 20/08/2026 para GitHub Pages + Cloudflare Worker + D1 + KV.

## Incluído nesta entrega

### Site público
- Home responsiva.
- Planos Essencial, Proteção e Guardião.
- Serviços separados dos planos.
- Autoatendimento por plano, serviço e quantidade.
- Preços opcionais, promoções e período de promoção.
- Controle de visibilidade pelo Dono.
- Área do Cliente no menu.
- Aviso de privacidade/analytics com escolha separada.
- Analytics limitado a eventos permitidos e somente após aceite do visitante.

### Minha G-Host
- Cadastro público com confirmação por código de e-mail.
- Toda conta nova nasce como `visitante`.
- Login e recuperação de senha.
- Perfis `visitante`, `cliente` e `adm` no banco; o perfil `dono` permanece protegido pela autenticação administrativa principal.
- Projetos do autoatendimento salvos na conta.
- Solicitação de proposta registrada no backend.
- Projetos, equipamentos, contratos e manutenção visíveis somente quando vinculados ao cliente.
- Notificações.
- Chamados de suporte.
- Contatos de emergência.
- Botões 190 / 192 / 193.
- Geolocalização somente após ação e permissão do próprio usuário; nesta versão não é enviada automaticamente.

### CFTV e dispositivos
- Cadastro de aparelho para CFTV usando segredo aleatório do servidor.
- Limite configurável de aparelhos por conta; padrão 2.
- Tentativa acima do limite é bloqueada, auditada e gera notificação.
- Tentativa de acesso por aparelho não autorizado é bloqueada e auditada.
- Metadados de câmeras são isolados pela propriedade do cliente/projeto.
- Senha, RTSP e credenciais de DVR/NVR não são expostos no navegador.
- Streaming real permanece bloqueado até existir Gateway CFTV G-Host e tokens de stream de curta duração.

> Observação de segurança: o segredo de aparelho desta versão é uma camada intermediária para preparar o fluxo. Antes de liberar vídeo ao vivo de alto risco, a evolução recomendada é WebAuthn/passkey ou outra identidade criptográfica de dispositivo validada no backend.

### Guardião / Horus / Sentinela
- Banco preparado para Guardião Hub.
- Status de nós Guardião.
- Eventos classificados por origem `guardiao`, `horus` ou `sentinela`.
- Área do Cliente e Control Center já possuem telas para consumir esses dados.
- Nenhum equipamento inexistente é mostrado como operacional.

### Control Center do Dono e ADM
Além do painel já existente de CRM, locais, projetos, sistemas, equipamentos, materiais e manutenção:
- Usuários e RBAC.
- Promoção Visitante → Cliente / ADM.
- Permissões granulares armazenadas por ADM, incluindo `data_export` separado da operação técnica.
- `staff.html`: acesso ADM com senha da própria conta + OTP por e-mail + TOTP individual + navegador administrativo autorizado.
- O Dono pode redefinir MFA/aparelho do ADM e invalidar suas sessões administrativas.
- Limite de aparelhos CFTV por conta.
- Leads/propostas do autoatendimento, com atualização de status e notificação ao cliente.
- Chamados de suporte com fluxo de status e notificação ao cliente.
- Analytics dos últimos 30 dias.
- Eventos de segurança.
- Auditoria administrativa (`audit_log`) disponível para quem possui permissão de segurança.
- Estado de Guardião Hubs.

### Dono
- Senha + código por e-mail + TOTP continuam obrigatórios.
- Na primeira autenticação após instalar este Worker, o navegador do Dono recebe um segredo criptográfico aleatório e passa a ser o aparelho autorizado para iniciar novos logins do Dono.
- Se esse navegador for perdido ou o armazenamento for apagado, use o procedimento de recuperação descrito em `CHECKLIST-DEPLOY.md`; não existe bypass automático pelo site.

### Jurídico / privacidade
- Termos e Aviso de Privacidade versionados.
- Registro de versão/evidência no cadastro.
- Tabelas para contratos e aceites.
- Aceite contratual exige conta autenticada e confirmação adicional por OTP de e-mail, com hash/versão e evidência registrada.
- Separação entre analytics, segurança, operação e dados contratuais.
- Os textos atuais são bases funcionais e precisam de revisão jurídica e preenchimento dos dados empresariais antes de contratação comercial real.

## Banco D1

`publisher-worker/schema.sql` já contém o esquema completo. Para um banco já existente, use:

`publisher-worker/migrations/003_plataforma_integrada.sql`

A migração é aditiva e não remove as tabelas antigas.

## Backend

O backend unificado é:

`publisher-worker/worker.js`

O arquivo `G-HOST-WORKER-TOTP-PLANOS.js` é uma cópia idêntica para facilitar o copiar/colar manual no painel da Cloudflare.

## Segurança de sessão

- Redefinição de senha incrementa `auth_version` e invalida sessões antigas do portal.
- Reset de segurança do ADM incrementa `auth_version`, revoga navegadores administrativos e força novo TOTP.
- Sessões administrativas permanecem somente em memória da página; o segredo de navegador é armazenado localmente e validado pelo backend no início do acesso.

## Dependências externas que não podem ser resolvidas só pelo GitHub

1. Cloudflare Worker publicado.
2. D1 `g-host-db` com a migração aplicada.
3. KV `AUTH_KV` conectado.
4. Secrets do Worker configurados.
5. Resend com remetente autorizado para enviar códigos aos clientes reais.
6. Para CFTV ao vivo: Gateway G-Host no cliente e camada de streaming segura.
7. Para Guardião/Horus/Sentinela reais: hardware/software local e protocolo de provisionamento.
8. Revisão jurídica antes de contratos comerciais reais.

## Testes feitos neste pacote

- Sintaxe de todos os arquivos JavaScript verificada com `node --check`.
- `schema.sql` executado integralmente em SQLite de teste sem erro.
- Referências locais `src`/`href`, IDs duplicados, scripts/handlers inline incompatíveis com CSP e arquivos ausentes verificados.
- Cópia do Worker na raiz comparada byte a byte com `publisher-worker/worker.js`.
- Varredura básica de padrões de tokens/segredos públicos.
- Validador reproduzível em `tools/validate.py`.
- GitHub Actions em `.github/workflows/validate.yml` executa a validação a cada push/PR.

## Acesso público reorganizado — 2026-08-21

O acesso da Minha G-Host foi separado em páginas independentes para reduzir confusão e deixar o cadastro mais limpo:

- `entrar.html` — somente login;
- `cadastro.html` — criação de conta + confirmação de e-mail em duas etapas;
- `recuperar-senha.html` — recuperação de senha separada;
- `cliente.html` — painel da Minha G-Host após autenticação.

O menu público agora exibe `Entrar` e `Criar conta` diretamente. Usuários sem sessão que tentarem abrir `cliente.html` são encaminhados para `entrar.html`.

## Domínio oficial

Este pacote está preparado para operar em `https://g-host.seg.br/`. Consulte `DOMINIO-OFICIAL.md` para as etapas externas de DNS/GitHub Pages/Resend.
