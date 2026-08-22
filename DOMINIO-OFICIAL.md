# Domínio oficial G-Host

Domínio do projeto: `https://g-host.seg.br/`

O pacote está preparado para publicar o site na raiz do domínio, com `CNAME`, canonical, Open Graph, `robots.txt`, `sitemap.xml`, `SITE_URL` e origens CORS do Worker apontando para `g-host.seg.br`.

## Ativação externa necessária

1. Registro.br: confirmar que `g-host.seg.br` está ativo e abrir a edição da zona DNS.
2. GitHub: `g-host-site → Configurações → Pages → Domínio personalizado` e informar `g-host.seg.br`.
3. DNS do domínio raiz: apontar para os endereços oficiais do GitHub Pages; configurar `www` como CNAME para `nauberty-rios.github.io` se desejar o alias.
4. GitHub Pages: aguardar a verificação DNS e então habilitar `Forçar HTTPS`.
5. Cloudflare Worker: manter `ALLOWED_ORIGINS` aceitando `https://g-host.seg.br` e `https://www.g-host.seg.br`; a origem antiga do GitHub Pages pode ser removida após a migração ser confirmada.
6. Resend: adicionar e verificar `g-host.seg.br`. Somente depois trocar `EMAIL_FROM` para um remetente do domínio, por exemplo `G-Host <acesso@g-host.seg.br>`.

Não coloque tokens, senhas, chaves de API ou códigos MFA em arquivos do GitHub.
