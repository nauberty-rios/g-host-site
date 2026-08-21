# G-Host — atualização do front de acesso

## Alterações

- Cadastro separado do login e da recuperação de senha.
- Nova página `entrar.html`.
- Nova página `cadastro.html` com fluxo em duas etapas.
- Nova página `recuperar-senha.html`.
- Novo `portal-auth.js` compartilhado pelas telas de autenticação.
- Novo `portal-auth.css` com layout limpo e responsivo.
- Menu do site com `Entrar` e `Criar conta` visíveis.
- Configurador encaminha usuário sem sessão para a página de login.
- `cliente.html` reservado para a área autenticada.
- Rotas de autenticação adicionadas ao `robots.txt` como `noindex`/disallow.

## URL pública

Os arquivos usam links relativos e funcionam tanto no repositório atual quanto após uma futura troca de domínio. A URL externa não deve ser alterada sem definir o domínio/repositório final e atualizar a variável `GITHUB_REPO` do Worker se o repositório for renomeado.
