# G-Host — Site + Planos + Autoatendimento + Control Center

Esta pasta foi montada para ser publicada no repositório GitHub Pages da G-Host.

## O que já funciona nesta entrega

- Site público responsivo.
- Três níveis: Essencial, Proteção e Guardião.
- Serviços separados dos planos.
- Autoatendimento para selecionar plano, serviços e quantidades.
- Salvamento local da configuração e envio da seleção para o WhatsApp comercial.
- Preços opcionais, preços promocionais e período de promoção.
- Painel autenticado para editar planos.
- Painel autenticado para editar catálogo/serviços.
- Painel autenticado para escolher quais seções ficam públicas.
- Publicação do conteúdo pelo Cloudflare Worker para o GitHub, usando o token somente no servidor.
- Base existente de CRM/locais/projetos/equipamentos do Worker preservada.

## Painéis

- `planos-admin.html` — planos, preços e promoções.
- `catalogo-admin.html` — serviços do autoatendimento, preços, promoções e disponibilidade por plano.
- `visibilidade-admin.html` — liga/desliga seções públicas e políticas de exibição de preço/promoção.

## Importante

O GitHub Pages hospeda o front-end. Guardião, Horus, Sentinela, streaming CFTV, IA real, contas de clientes e integrações de emergência precisam de backend/gateway próprios e não podem ser fingidos por uma página estática.

A autenticação administrativa continua dependendo do Cloudflare Worker e dos bindings/secrets já configurados. O Worker desta entrega adiciona os endpoints `/publish-catalog` e `/publish-visibility`, portanto ele precisa ser atualizado na Cloudflare para que esses dois novos painéis publiquem diretamente no GitHub.

Os arquivos `privacidade.html` e `termos.html` são bases operacionais; antes de contratação comercial real, o texto jurídico final deve ser revisado por profissional habilitado e preenchido com os dados empresariais corretos.
