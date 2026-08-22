# G-Host — pacote de produção 2026-08-22

Este pacote consolida a plataforma existente com o Front V2 e o domínio oficial `g-host.seg.br`.

Alterações principais:
- remoção real da faixa/leitura superior;
- remoção do radar do hero;
- novo painel Central G-Host;
- mais atalhos, opções por necessidade e módulos de projeto;
- correção do JavaScript para funcionar sem o bloco de anúncio;
- domínio `g-host.seg.br` em CNAME/SEO/Worker;
- `publisher-worker/worker.js` permanece como única fonte principal do Worker;
- cadastro, login, cliente, staff e dono preservados.

O envio de e-mail via `@g-host.seg.br` só deve ser ativado depois da verificação do domínio no provedor de e-mail.

Observação: `G-HOST-WORKER-TOTP-PLANOS.js` permanece como cópia de compatibilidade exigida pelo validador atual; a edição principal deve ser feita em `publisher-worker/worker.js` e as duas cópias devem permanecer idênticas.
