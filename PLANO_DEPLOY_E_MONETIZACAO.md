# Plano de deploy e monetização do Fluxo

**Atualizado em:** 15 de outubro de 2026  
**Status:** planejamento; nenhuma implementação ou configuração de serviço foi feita neste computador.

## Objetivo

Preparar o Fluxo para ser publicado como um SaaS acessível pela web, com contas de usuário, login com Google, dados isolados por conta, uma opção gratuita com anúncios e uma assinatura sem anúncios.

## Decisões tomadas

- **Hospedagem da aplicação:** Laravel Cloud. O app Laravel será o backend e continuará servindo a interface Vue compilada no mesmo domínio na primeira versão. Isso evita separar a API do front e simplifica sessões, cookies e CORS.
- **Domínio e camada DNS:** Cloudflare. A Cloudflare cuidará do DNS e poderá atuar como proxy e camada de proteção na frente da aplicação. A compra do domínio pela Cloudflare depende de a extensão escolhida estar disponível no Registrar; se não estiver, o domínio pode ser comprado em outro registrador e ainda usar DNS da Cloudflare.
- **Banco de produção:** PostgreSQL gerenciado no Laravel Cloud. SQLite permanece para desenvolvimento local/testes, mas não será o banco da primeira publicação SaaS.
- **Autenticação:** oferecer “Entrar com Google” usando OpenID Connect. A autenticação deve acontecer no backend Laravel e criar uma sessão segura da aplicação.
- **Modelo de acesso inicial:** cada conta terá seu próprio espaço de trabalho. Compartilhamento entre usuários/equipes fica fora da primeira versão, até ser decidido separadamente.
- **Monetização:** versão gratuita com anúncios e assinatura paga sem anúncios. O Stripe será considerado para checkout recorrente, estado da assinatura e autoatendimento de cobrança.

## Estado atual observado

O sistema é um app Vue + Laravel 13, configurado para PHP 8.3 ou superior, com SQLite e execução local. O README descreve que não há contas/login nem rotina de backup e que o servidor escuta somente em localhost.

A migração padrão já cria uma tabela de usuários, mas isso ainda não fornece login Google nem autenticação nas rotas do produto. As rotas da API estão sem middleware de autenticação, e os registros de projetos, tarefas, atividades e comentários ainda não têm proprietário/conta. Portanto, a autenticação e o isolamento dos dados precisam ser tratados como uma única etapa fundamental antes de abrir cadastros ao público.

O app também permite enviar imagens. O armazenamento local da máquina não pode ser tratado como armazenamento durável no deploy; as imagens precisam ir para um serviço de objetos ou outro armazenamento persistente.

## Arquitetura alvo

Navegador → Cloudflare (domínio, DNS e proteção/proxy) → Laravel Cloud (Laravel/PHP + arquivos Vue compilados)

O Laravel Cloud conecta-se ao PostgreSQL gerenciado para usuários, projetos, tarefas, atividades, roadmaps e lista diária. Imagens enviadas ficam em armazenamento persistente de objetos. Stripe atende checkout, assinaturas e portal de cobrança por API e webhooks.

O front e o back ficam juntos no Laravel Cloud inicialmente. Não há necessidade de publicar o Vue separadamente no Cloudflare Pages para o primeiro lançamento.

## Plano de implementação

### 1. Fechar decisões de produto e preparar migração

- Definir se o primeiro lançamento será beta por convite ou cadastro público; o plano técnico assume contas independentes, sem equipes compartilhadas.
- Definir como tratar o banco local atual: começar com workspace vazio ou importar os dados para uma conta proprietária inicial.
- Fazer inventário das tabelas, chaves estrangeiras, uploads e migrations; testar todas as migrations em PostgreSQL e corrigir diferenças de SQLite.
- Criar uma cópia de segurança do banco local e dos arquivos antes de qualquer importação.

**Pronto quando:** existe uma estratégia aprovada para os dados existentes e uma instalação limpa do app sobe em PostgreSQL nos testes.

### 2. Preparar isolamento por usuário/conta

- Adicionar a relação de propriedade do espaço de trabalho e dos projetos/tarefas aos registros relevantes; propagar a propriedade às atividades, comentários, roadmaps, conexões e itens da lista diária por relações consistentes.
- Aplicar autorização no backend em todas as leituras, criações, edições, exclusões, ordenações e uploads. Não confiar em filtros feitos somente pela interface.
- Impedir acesso entre contas mesmo quando alguém alterar IDs manualmente nas chamadas da API.
- Adicionar testes de isolamento e autorização para os endpoints existentes.

**Pronto quando:** duas contas de teste não conseguem ver nem alterar dados uma da outra por nenhum endpoint.

### 3. Implementar login com Google

- Configurar um cliente OAuth/OIDC no Google Cloud Console com URLs de retorno para staging e produção.
- Validar a resposta de identidade no backend; criar ou associar o usuário usando um identificador estável do Google e email verificado.
- Implementar entrar, sair, sessão/cookies seguros, proteção CSRF, expiração e tratamento de conta já existente.
- Guardar segredos somente no gerenciador de secrets do ambiente; nunca no repositório ou no bundle Vue.
- Definir o fluxo de exclusão da conta e o que acontece com os dados associados.

**Pronto quando:** login, logout, renovação/expiração de sessão e isolamento passam por testes de integração no ambiente de staging.

### 4. Migrar banco e configurar persistência de arquivos

- Criar PostgreSQL gerenciado no Laravel Cloud e configurar as variáveis de produção.
- Revisar e executar migrations de produção; usar o comando de migrations de produção como etapa controlada do deploy.
- Configurar armazenamento de objetos para imagens e validar upload, leitura, exclusão e limites atuais do produto.
- Escolher entre o armazenamento de objetos integrado ao Laravel Cloud e Cloudflare R2 na implementação, considerando simplicidade, custo, região e compatibilidade S3.
- Configurar backups automáticos e testar uma restauração antes do lançamento.

**Pronto quando:** dados e imagens continuam disponíveis após um novo deploy e a restauração de backup foi demonstrada em ambiente de teste.

### 5. Publicar staging no Laravel Cloud

- Conectar o repositório GitHub ao Laravel Cloud e criar ambientes separados de staging e produção.
- Configurar o build do monorepo para instalar dependências da interface (npm ci), compilar Vue (npm run build) e disponibilizar os arquivos no diretório público esperado pelo Laravel.
- Configurar ambiente de produção, depuração desativada, chave da aplicação, URL pública, sessão segura, banco, Google, email, storage e logs por secrets/variáveis de ambiente.
- Configurar health check, logs, alertas de falha e limites de gastos.
- Confirmar a versão de PHP compatível e testar deploy, migrations e rollback.

**Pronto quando:** staging fica acessível por URL temporária e as jornadas principais do Fluxo funcionam em navegador e celular.

### 6. Conectar o domínio via Cloudflare

- Registrar o domínio escolhido; confirmar preço/renovação e suporte da extensão no registrador.
- Adicionar o domínio ao Laravel Cloud e configurar o registro DNS solicitado na Cloudflare.
- Validar certificado HTTPS, redirecionamento HTTP→HTTPS, cookies seguros, URL de retorno Google e URLs de webhooks Stripe.
- Só depois de validar o caminho direto, decidir se o proxy da Cloudflare deve ficar ativado para esse host; seguir as instruções atuais de TLS dos dois serviços.

**Pronto quando:** domínio próprio funciona com HTTPS e os fluxos Google/Stripe retornam às URLs corretas.

### 7. Implementar assinatura sem anúncios com Stripe

- Criar produto e preços recorrentes mensal/anual no Stripe; valores ainda não foram decididos.
- Criar sessão de checkout no backend e usar Stripe Checkout para processar o pagamento sem armazenar cartão no Fluxo.
- Implementar portal de cobrança para trocar forma de pagamento, consultar faturas e cancelar.
- Implementar endpoint de webhook com validação de assinatura, processamento idempotente e registro dos eventos tratados.
- Atualizar entitlements no backend somente a partir dos eventos confirmados; tratar assinatura ativa, pagamento falho, período de tolerância, cancelamento e fim do período pago.
- No frontend, ocultar anúncios conforme entitlement confirmado no backend, sem usar o redirecionamento de sucesso do navegador como fonte de verdade.
- Validar preços, tarifas e meios de pagamento disponíveis para a conta Stripe brasileira antes de anunciar o plano.

**Pronto quando:** testes no modo sandbox cobrem ativação, renovação, cancelamento, falha de pagamento, evento repetido e recuperação de acesso.

### 8. Introduzir anúncios com cuidado

- Escolher a rede de anúncios e verificar seus requisitos antes de integrar.
- Manter anúncios discretos e separados da edição de atividades e do roadmap; preservar boa experiência em telas pequenas.
- Não enviar títulos, descrições, comentários ou conteúdo de projeto para direcionamento de anúncios.
- Implementar consentimento e política de privacidade conforme os requisitos do produto e da rede escolhida.
- Medir receita por usuário ativo, retenção, conversão para assinatura e impacto na experiência antes de aumentar a frequência.

**Pronto quando:** anúncios aparecem somente para contas elegíveis no plano gratuito, somem para assinantes ativos e não interferem nas jornadas principais.

### 9. Beta, revisão e lançamento

- Abrir beta por convite para validar cadastro, isolamento, uploads, backups, cobrança e suporte.
- Monitorar erros, disponibilidade, custo mensal, uso do banco, falhas de webhook e conversão.
- Testar exportação/exclusão de dados, recuperação de backup, troca de domínio e rollback de versão.
- Fazer revisão de segurança, privacidade, termos, cancelamento e obrigações fiscais antes de oferecer o serviço publicamente.
- Liberar cadastro público após corrigir problemas do beta e definir limites operacionais e de gastos.

## Questões ainda abertas

1. Qual domínio/extensão e nome final do produto?
2. O lançamento inicial será por convite ou cadastro público?
3. Como importar (ou não) os dados da instalação local atual?
4. Login será inicialmente apenas Google ou também haverá email/senha?
5. O que a versão gratuita limita além dos anúncios? O plano pago oferecerá somente remoção de anúncios ou também recursos extras?
6. Quais serão os preços mensal e anual e haverá período de teste?
7. Qual rede de anúncios será usada e em quais telas?
8. Usaremos Laravel Cloud Object Storage ou Cloudflare R2 para as imagens?
9. Qual orçamento máximo mensal para hospedagem, banco, domínio, armazenamento e serviços externos?
10. Qual região de hospedagem oferece a melhor combinação de latência para o público esperado e custo?

## Referências e premissas de custo

Preços consultados em **15/10/2026**; devem ser recalculados antes da contratação:

- [Laravel Cloud — preços, créditos e recursos](https://laravel.com/cloud/pricing): Starter anunciado por US$ 5/mês mais uso, com US$ 5 em créditos mensais de uso e primeiro mês do Starter gratuito. O custo depende de computação, banco, armazenamento, tráfego e tempo acordado.
- [Laravel Cloud — deploy de uma aplicação Laravel](https://laravel.com/cloud/deploy-a-laravel-app): deploy a partir do Git e configuração de recursos/segredos pelo painel.
- [Cloudflare Registrar](https://developers.cloudflare.com/registrar/): domínio cobrado por extensão/registro, sem margem sobre o custo do registro; Cloudflare DNS pode ser usado mesmo que o domínio seja comprado em outro registrador.
- [Stripe Billing — preços no Brasil](https://stripe.com/br/billing): conferir a tarifa vigente e meios de pagamento antes de fixar preços públicos.
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect): referência para o login Google.

## Fora do escopo deste documento

Este arquivo registra decisões e orienta uma implementação futura. Não foram feitas alterações no código, deploy, compra de domínio, criação de contas de provedor ou configuração de pagamentos neste computador.
