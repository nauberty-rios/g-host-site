# G-Host — versão com publicação direta

Esta versão inclui o botão **Salvar e publicar**, que pode enviar as mudanças do painel diretamente para o repositório e disparar a atualização do GitHub Pages.

Antes de usar a publicação direta, siga `CONFIGURAR-PUBLICACAO-DIRETA.md`.

> Importante: credenciais do GitHub não ficam no site público. Elas ficam como secrets no Publicador.

---

# G-Host — Site para GitHub Pages

Site institucional responsivo e interativo para a G-Host Segurança Eletrônica & Automação.

## Arquivos principais

- `index.html` — site público.
- `styles.css` — visual e responsividade.
- `app.js` — interações.
- `site-data.js` — dados comerciais editáveis.
- `admin.html` — painel do proprietário.
- `admin.css` e `admin.js` — painel.

## Painel do proprietário

Depois de publicar, acesse:

`https://SEU-USUARIO.github.io/SEU-REPOSITORIO/admin.html`

O painel permite alterar nome, slogan, WhatsApp, telefone, e-mail, região, Instagram, cores, textos principais, aviso do topo e quais serviços aparecem.

As alterações ficam salvas no navegador. Para publicar para todos:

1. Clique em **Baixar atualização**.
2. O painel gera um novo `site-data.js`.
3. Substitua o `site-data.js` no GitHub.
4. Faça o commit.

## Segurança importante

GitHub Pages é uma hospedagem estática. Não coloque token do GitHub, senha, chave privada ou credencial nos arquivos HTML/JS, porque visitantes podem visualizar o código. Por isso, esta versão não grava diretamente no seu repositório: ela gera o arquivo atualizado para você publicar.

## Configuração inicial

Antes de publicar, configure no `site-data.js` principalmente:

```js
whatsapp: "5500000000000",
phoneDisplay: "(00) 00000-0000",
email: "contato@ghostseguranca.com.br",
location: "Sua cidade e região"
```

Use no WhatsApp apenas números: país + DDD + telefone.

## GitHub Pages

Envie todos os arquivos para a raiz do repositório. Depois, em `Settings > Pages`, escolha `Deploy from a branch`, branch `main` e `/ (root)`.
