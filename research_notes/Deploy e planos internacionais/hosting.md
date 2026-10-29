# Hospedagem do Fluxo

## Laravel Cloud ou Cloudflare para executar a aplicação?

### Takeaway

Laravel Cloud é a opção direta para executar o backend Laravel/PHP do Fluxo. Cloudflare Pages/Workers pode servir o Vue estático ou hospedar código compatível com o runtime Workers, mas a documentação atual não oferece runtime PHP/Laravel; usar Cloudflare como substituto do Laravel Cloud exigiria reescrever o backend. Cloudflare DNS pode ficar como provedor DNS; um proxy Cloudflare adicional é opcional e deve ser validado, pois Laravel Cloud já informa que roteia suas aplicações pela rede de borda Cloudflare.

### Cited Findings
- Laravel Cloud reconhece monorepos, permite selecionar qual diretório implantar e usa Laravel Cloud para build/deploy dessa aplicação — [Deploy a Laravel App to Laravel Cloud](https://laravel.com/cloud/deploy-a-laravel-app).
- Cloudflare Workers documenta suporte de primeira classe a JavaScript, TypeScript, Python e Rust; outras linguagens podem ser compiladas para WebAssembly. A lista não identifica PHP como runtime de primeira classe nem documenta Laravel — [Workers languages](https://developers.cloudflare.com/workers/languages/).
- Cloudflare Pages Functions executa código no runtime Workers e usa os recursos desse runtime — [Pages Functions](https://developers.cloudflare.com/pages/functions/), [Get started with Pages Functions](https://developers.cloudflare.com/pages/functions/get-started/).
- Laravel Cloud diz que toda aplicação passa pela rede edge da Cloudflare, com edge caching/CDN e mitigação DDoS já incluídos — [Laravel Cloud networking](https://laravel.com/cloud/network).
- Cloudflare recomenda iniciar projetos novos em Workers, pois Workers atende a maioria dos usos de Pages com mais recursos — [Cloudflare Pages overview](https://developers.cloudflare.com/pages/).
- DNS Cloudflare pode encaminhar HTTP/HTTPS através do proxy Cloudflare quando o registro elegível A/AAAA/CNAME está como Proxied; registros DNS-only vão diretamente ao origin — [Proxy status](https://developers.cloudflare.com/dns/proxy-status/), [Proxying limitations](https://developers.cloudflare.com/dns/proxy-status/limitations/).
- Laravel Cloud fornece os registros A/CNAME que devem ser configurados no provedor DNS e provisiona/renova TLS automaticamente quando o domínio é conectado — [Deploy a Laravel App to Laravel Cloud](https://laravel.com/cloud/deploy-a-laravel-app).

### Inferences
- Para a arquitetura existente, a recomendação inicial é Laravel Cloud para aplicação completa e Cloudflare como DNS. Não há necessidade técnica inicial de hospedar o frontend em Pages: Laravel serve a API e o build Vue sob o mesmo domínio, reduzindo trabalho com CORS, cookies e roteamento.
- Um proxy DNS Cloudflare adicional pode ser testado depois que o domínio direto estiver funcional; avaliar certificados TLS, regras de cache para conteúdo autenticado, upload de imagens e webhooks. A documentação consultada não confirma especificamente a combinação de proxy reverso de Cloudflare com Laravel Cloud, embora ambos usem a rede Cloudflare.
- Separar Vue para Pages/Workers é uma alternativa se houver motivo operacional para isso, mas exigiria uma URL de API (ou proxy de rotas) compatível com cookies/CSRF e configuração de CORS. A aplicação ainda precisaria do Laravel Cloud ou de outro host PHP para o backend.
- A documentação confirma build Workers em imagem com ferramentas PHP, mas isso se refere ao ambiente de build; não demonstra PHP como runtime de request. Não inferir suporte a Laravel desse dado — [Workers Builds build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/).

### Gaps
- A documentação oficial consultada não esclarece compatibilidade garantida de proxy Cloudflare externo, modo TLS recomendado entre edge e Laravel Cloud, cache por padrão do domínio da aplicação, nem particularidades de limite de corpo para uploads. Validar com domínio de staging e orientação atual do Laravel Cloud antes de ativar o proxy em produção.
- Não foi encontrada documentação oficial de implantação Laravel/PHP diretamente em Cloudflare Workers ou Pages. Ausência de guia não prova impossibilidade absoluta via compilações ou adaptação customizada, mas não é caminho documentado/suportado para este app.

## Como configurar este monorepo no Laravel Cloud?

### Takeaway

Selecionar `app/` como raiz da aplicação Laravel. As pastas irmãs continuam acessíveis durante o build, e a configuração Vite existente já grava o bundle em `app/public/ui`; portanto é viável compilar `ui/` a partir do build da aplicação Laravel e implantar apenas `app/`.

### Cited Findings
- Laravel Cloud permite escolher a raiz do projeto em monorepos. Durante o build todos os diretórios do repositório permanecem acessíveis; somente o diretório selecionado é implantado e executado — [Monorepos](https://laravel.com/cloud/docs/monorepos), [Deploy a Laravel App](https://laravel.com/cloud/deploy-a-laravel-app).
- Cloud preenche comandos de build para Laravel e executa build antes do deploy; migrações podem ser configuradas como deploy command, executado contra o banco de produção antes da troca de tráfego — [Deploy a Laravel App](https://laravel.com/cloud/deploy-a-laravel-app).
- No checkout consultado, `ui/vite.config.js` define `build.outDir: "../app/public/ui"`, enquanto `ui/package.json` contém `npm run build` e o lockfile é `ui/package-lock.json` — [vite.config.js](../../ui/vite.config.js), [package.json](../../ui/package.json).
- O app Laravel tem `app/composer.json` e `app/artisan`; a interface é um frontend Vue + Vite no diretório irmão `ui/` — [composer.json](../../app/composer.json), [README](../../README.md).

### Inferences
- Configuração plausível no painel Cloud, com raiz `app/`: build command `composer install --no-dev && cd ../ui && npm ci --audit false && npm run build && cd ../app && php artisan optimize`; deploy command `php artisan migrate --force`. Conferir diretório de trabalho inicial no painel e testar em staging. Laravel Cloud documenta comandos Composer/npm de build e execução Laravel, mas deve-se validar no ambiente selecionado se Node/NPM está disponível como runtime de build — [Deploy a Laravel App](https://laravel.com/cloud/deploy-a-laravel-app).
- O bundle gerado estará dentro de `app/public/ui`, portanto deve integrar a imagem do app Laravel ao fim do build, em vez de configurar `ui/` como aplicação independente.
- Não criar uma segunda aplicação Cloud para `ui/` nesta arquitetura: o Vue não está preparado como aplicação isolada com endpoint de API configurado para produção, e o repo pretende servir a UI pelo Laravel.

### Gaps
- Confirmar no painel a sintaxe e shell do build command, o diretório de trabalho que ele usa e as versões de Node e PHP no momento de configurar o app. Laravel Cloud informa suporte a PHP 8.2–8.5 e runtimes de Node.js e mostra `npm run build` no fluxo Laravel, mas as versões de runtime devem ser conferidas nas configurações atuais — [Deploy a Laravel App](https://laravel.com/cloud/deploy-a-laravel-app).
- Confirmar que instalar `npm ci` no caminho irmão mantém artefatos `app/public/ui` no contexto da imagem resultante. O suporte monorepo documenta acesso a irmãos no build, mas o deploy inclui somente o diretório escolhido.

## Que armazenamento e banco usar em produção?

### Takeaway

SQLite local pode continuar para desenvolvimento, mas para SaaS em produção, escolher PostgreSQL gerenciado (por exemplo Serverless Postgres no Laravel Cloud) e storage de objetos para uploads. O filesystem local da Cloud é efêmero e replicado separadamente. Laravel Cloud Object Storage — que é alimentado por Cloudflare R2 — é o caminho de menor configuração; R2 separado também funciona via API compatível com S3.

### Cited Findings
- Os arquivos do filesystem do ambiente Laravel Cloud são efêmeros: podem sumir em novo deploy e não são compartilhados entre réplicas. A documentação indica database/Redis para estado/cache/sessões e object storage para arquivos persistentes — [Laravel Cloud environments](https://laravel.com/cloud/docs/environments).
- Laravel Cloud orienta anexar bucket de object storage para uploads; Cloud injeta credenciais S3 compatíveis e Laravel usa `Storage` facade. Para a integração Laravel, a documentação manda incluir `league/flysystem-aws-s3-v3` — [Laravel deploy guide](https://laravel.com/cloud/docs/deploy-guides/laravel).
- Laravel Cloud Object Storage é powered by Cloudflare R2, oferece buckets públicos/privados e credenciais automáticas; a plataforma lista Serverless Postgres (Neon) e backups/PITR automáticos entre suas opções de banco — [Application Resources](https://laravel.com/cloud/app-resources).
- Cloudflare R2 expõe API compatível com S3, mas documenta operações e funcionalidades que diferem de AWS S3 — [R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/), [R2 S3 getting started](https://developers.cloudflare.com/r2/get-started/s3/).
- Workers não tem acesso ao filesystem local. O Node `fs` em Workers, quando habilitado, oferece VFS temporário em memória e seus arquivos `/tmp` não persistem — [Workers security model](https://developers.cloudflare.com/workers/reference/security-model/), [Workers `fs`](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/).
- Cloudflare apresenta Hyperdrive como forma de conectar Worker a PostgreSQL/MySQL existente, enquanto R2 é storage de objetos; não substituem diretamente a hospedagem Laravel/PHP — [Workers storage options](https://developers.cloudflare.com/workers/platform/storage-options/).

### Inferences
- Recomendação de primeira versão: PostgreSQL gerenciado pelo Laravel Cloud (mesma região do app) para dados relacionais e Laravel Cloud Object Storage para imagens. Essa opção minimiza configuração e é apoiada pela integração de credenciais no Laravel Cloud; usar R2 diretamente faz sentido se a equipe quiser controlar bucket/domínio separado ou comparar custo e configuração S3.
- SQLite pode continuar no fluxo de desenvolvimento/testes, mas o banco de produção deve ser tratado separadamente: testar migrations, tipos/consultas e integridade referencial em PostgreSQL antes de publicar. Isso é recomendação baseada na natureza do produto SaaS multiusuário e no fato de SQLite ser um arquivo local, não uma garantia documental contra uso em produção.
- Evitar uploads em `storage/app/public` local ou banco SQLite em disco no Cloud: o deploy e a escala horizontal podem perder ou não compartilhar esses arquivos.

### Gaps
- O plano/preço final e regiões disponíveis para Laravel Cloud, Serverless Postgres e bucket precisam ser verificados no painel na data da implantação; preços e regiões mudam.
- A documentação de recursos consultada não fornece uma avaliação comparativa sob o tráfego esperado entre Laravel Cloud Object Storage e R2 standalone, nem resolve requisitos legais de localização/retensão. Decidir após estimativa de volume e análise dos requisitos de backup e privacidade.
