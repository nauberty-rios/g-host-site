# Status da implementação — G-Host Plataforma Integrada

## Implementado no código desta entrega

### Site e comercial
- Site público responsivo.
- Planos Essencial, Proteção e Guardião.
- Serviços separados dos planos.
- Autoatendimento por plano, serviço e quantidade.
- Preços opcionais, promoções e datas de campanha.
- Controle de visibilidade das seções públicas.
- Rascunho local e publicação autenticada pelo Worker.

### Contas e acesso
- Cadastro público com OTP por e-mail; toda conta nova nasce como `visitante`.
- Login e recuperação de senha.
- Sessões do portal vinculadas ao navegador e invalidadas quando a senha é redefinida.
- Perfis `visitante`, `cliente` e `adm` no D1.
- Dono protegido fora do cadastro público.
- Dono: senha + e-mail + TOTP + navegador administrativo autorizado.
- ADM: senha da própria conta + e-mail + TOTP individual + navegador administrativo autorizado.
- Dono define permissões granulares do ADM.
- Reset de MFA/aparelho/sessões de ADM somente pelo Dono.

### Control Center
- CRM técnico existente: pessoas, locais, projetos, sistemas, equipamentos, dossiê, materiais, ordens/manutenção.
- Usuários e RBAC do portal.
- Permissões: conteúdo, visibilidade, preços, CRM, operação, exportação de dados (`data_export`), CFTV, Guardião, segurança, analytics e jurídico.
- Leads/propostas do autoatendimento com mudança de status e notificação ao cliente.
- Chamados de suporte com mudança de status e notificação ao cliente.
- Contratos e aceite eletrônico.
- Analytics dos últimos 30 dias.
- Eventos de segurança e consulta do `audit_log` para perfis autorizados.
- Estado dos Guardião Hubs cadastrados.
- Painel separado `staff.html` para ADM, mostrando somente módulos permitidos.

### Minha G-Host
- Projetos/configurações salvas.
- Pedidos de proposta.
- Projetos, equipamentos e manutenção vinculados ao cliente.
- Contratos, inclusive pendentes para Visitante vinculado à pessoa/cliente; aceite confirmado promove a conta para `cliente`.
- Notificações.
- Suporte.
- Contatos de emergência.
- Atalhos 190 / 192 / 193.
- Geolocalização somente quando o próprio usuário solicita e autoriza.
- Link para Painel ADM quando a conta estiver no perfil `adm`.

### Contratos e LGPD
- Termos e Aviso de Privacidade versionados.
- Evidência de aceite no cadastro.
- Contratos com versão, hash do conteúdo e histórico de status.
- Aceite de contrato exige conta autenticada **e novo código OTP por e-mail**.
- Evidência registra versão/hash, conta, data/hora e identificadores técnicos minimizados.
- Documento aceito não é reaberto para edição; alterações exigem nova versão.

### CFTV e segurança de aparelhos
- Limite de aparelhos CFTV configurável por conta; padrão 2.
- Terceiro aparelho é bloqueado e gera evento/notificação.
- Tentativa de câmera por aparelho não autorizado é bloqueada.
- Metadados de câmeras isolados por cliente/projeto.
- Credenciais e RTSP não são enviados ao navegador.
- Alertas por e-mail preparados para eventos críticos quando o remetente Resend estiver operacional.

### Analytics e privacidade
- Banner separado para analytics opcional.
- Eventos enviados somente após aceite de analytics.
- Backend aceita somente tipos de evento permitidos.
- Texto de formulários não é enviado ao analytics.
- IP/visitor IDs usados em analytics/segurança são pseudonimizados por HMAC no backend.

### Guardião / Horus / Sentinela
- Banco e APIs para nós Guardião e eventos.
- Interfaces no cliente e no Control Center.
- Nomenclatura consolidada:
  - Guardião = núcleo local.
  - Horus = visão/câmeras/sensores.
  - Sentinela = rede/cibersegurança.

## Preparado, mas depende de infraestrutura externa
- Envio real de OTP para qualquer cliente: domínio/remetente Resend autorizado.
- Streaming CFTV real: Gateway seguro + camada WebRTC/HLS ou tecnologia equivalente.
- Guardião Hub físico/local.
- Horus com visão computacional executando no ambiente real.
- Sentinela integrado ao firewall/VLAN do cliente.
- Push notifications/app nativo.
- WebAuthn/passkey como identidade forte de dispositivo para liberar vídeo de maior risco.
- Assinatura eletrônica qualificada/avançada quando o contrato específico exigir.

## Não deve ser anunciado como ativo enquanto não existir e for testado
- Despacho automático de polícia/SAMU/bombeiros.
- Reconhecimento facial/biometria.
- IA de segurança com desempenho não validado.
- Garantia absoluta de detecção de invasões.
- Monitoramento 24h humano se não houver uma operação real contratada para isso.

## Qualidade e implantação
- `tools/validate.py` valida estrutura, sintaxe JavaScript, schema SQLite, referências HTML, CSP básico, cópia do Worker e padrões comuns de segredos.
- `.github/workflows/validate.yml` executa a validação automaticamente em push/PR.
- Arquivos privados/administrativos possuem `noindex`; `robots.txt` também bloqueia rotas administrativas/portal/contrato para rastreadores cooperativos.
