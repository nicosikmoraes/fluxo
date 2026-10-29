# Banco de dados e persistência no deploy

## SQLite em produção: persistência, escala, concorrência e backups

### Takeaway

SQLite segue adequado para desenvolvimento local e pode atender aplicações pequenas em um único servidor com disco persistente e backups próprios. Para o deploy gerenciado proposto, o Laravel Cloud recomenda usar Laravel Serverless Postgres ou Laravel MySQL; a recomendação prática para o Fluxo é começar com Serverless Postgres gerenciado e habilitar PITR antes de receber dados reais.

### Cited Findings
- Laravel documenta SQLite como um banco contido em um único arquivo no sistema de arquivos local. [Laravel: Database Configuration](https://laravel.com/framework/docs/database/config)
- O guia de conhecimento do Laravel Cloud recomenda Laravel Serverless Postgres ou Laravel MySQL em aplicações de produção; ambos oferecem persistência entre deploys e escala a zero quando ociosos. [Laravel Cloud: SQLite](https://laravel.com/cloud/docs/knowledge-base/sqlite)
- Serverless Postgres do Laravel Cloud é alimentado por Neon, ajusta CPU e armazenamento automaticamente, inclui PgBouncer e tem backups automáticos com recuperação point-in-time. O produto informa suporte a até 10.000 conexões simultâneas via pool. [Laravel Cloud: Application Resources](https://laravel.com/cloud/app-resources)
- Serverless Postgres permite configurar retenção de backup entre 0 e 30 dias; PITR pode restaurar o banco a um ponto no período de retenção. [Laravel: backup strategies for Serverless Postgres](https://laravel.com/blog/creating-backup-strategies-in-serverless-postgres-with-laravel-cloud)
- Laravel MySQL usa recursos dedicados configuráveis e snapshots automáticos diários, com retenção ajustável entre 1 e 30 dias nos planos padrão. [Laravel Cloud: Application Resources](https://laravel.com/cloud/app-resources)
- Cloudflare D1 tem limite documentado de 10 GB por banco no plano pago e cada banco é single-threaded, processando uma consulta de cada vez. A documentação sugere D1 para bancos menores e escala horizontal por múltiplos bancos. [Cloudflare D1: limits](https://developers.cloudflare.com/d1/platform/limits/)
- O D1 oferece Time Travel para recuperação point-in-time, com retenção indicada de até 30 dias no plano pago. [Cloudflare D1: limits](https://developers.cloudflare.com/d1/platform/limits/)
- Cloudflare descreve D1 e SQLite de Durable Objects como bancos acessados por bindings do Workers. Para banco Postgres/MySQL tradicional, a plataforma sugere Hyperdrive para os Workers. [Cloudflare: connect to databases](https://developers.cloudflare.com/workers/databases/connecting-to-databases/)

### Inferences
- Dado que o Fluxo é uma aplicação Laravel/PHP e que o plano de deploy cita Laravel Cloud, D1 não é substituto direto para a conexão PDO tradicional da aplicação: D1 é uma API de binding própria dos Workers. Usar D1 exigiria adaptar ou reestruturar o backend para Cloudflare Workers; manter Laravel Cloud favorece o banco Postgres/MySQL integrado.
- O custo operacional mais relevante do SQLite em produção não é sua capacidade para o volume inicial, mas garantir que o arquivo sobreviva a substituições/escala de instâncias e criar cópia/restauração verificável. Um arquivo de banco na camada gravável local não deve ser presumido como durável sem uma garantia explícita do host.
- Para um SaaS pequeno com contas, projetos, planos/assinaturas e registros de trabalho, um banco gerenciado simplifica persistência, backups e crescimento. Serverless Postgres é a melhor opção inicial dentro do Laravel Cloud pela combinação de provisionamento integrado, pool, scale-to-zero e PITR; MySQL gerenciado também é uma opção válida se a equipe preferir esse engine.

### Gaps
- Não foi encontrada, nas fontes consultadas, uma matriz pública única com os limites de IOPS, throughput, RPO/RTO ou SLA específico para o Serverless Postgres do Laravel Cloud. Confirmar requisitos de recuperação e disponibilidade nos termos atuais do plano antes de definir compromisso de produção.
- Não foi validado por experimento se o fluxo de deploy atual desse repositório mantém um SQLite local entre substituições de instância. A decisão não deve depender disso sem confirmação explícita da documentação/ambiente do host.

## Banco gerenciado, provedor e localização

### Takeaway

Laravel Cloud oferece Postgres serverless gerenciado e MySQL; recomenda manter banco e aplicação na mesma região AWS. Cloudflare pode ficar como camada de DNS/CDN/proteção na frente, enquanto Laravel Cloud executa o Laravel. Hyperdrive é relevante se houver Workers Cloudflare conectando a banco tradicional, não é necessário para a aplicação Laravel hospedada diretamente no Laravel Cloud.

### Cited Findings
- Laravel Cloud oferece Laravel MySQL e Serverless Postgres; o produto Serverless Postgres usa Neon. Também aceita banco externo com endpoint público e recomenda escolher a mesma região AWS para banco e recursos da aplicação para melhor desempenho. [Laravel Cloud](https://laravel.com/cloud) e [Laravel Cloud: Application Resources](https://laravel.com/cloud/app-resources)
- Laravel Cloud lista regiões nos EUA, Canadá, Europa, Ásia-Pacífico e Oriente Médio; sua lista pública atual não apresenta região no Brasil. [Laravel Cloud](https://laravel.com/cloud)
- A orientação do Laravel Cloud para deploy mostra a criação do banco pelo painel; credenciais `DB_HOST`, `DB_USERNAME`, `DB_PASSWORD` e `DB_DATABASE` são injetadas no ambiente para Laravel usar. [How to deploy a Laravel app to Cloud](https://laravel.com/cloud/deploy-a-laravel-app)
- A página de recursos informa backups diários com retenção de 1–30 dias para MySQL; Postgres serverless tem backup automático e PITR. RDS gerenciado com multi-AZ é opção somente no Laravel Private Cloud. [Laravel Cloud: Application Resources](https://laravel.com/cloud/app-resources) e [Laravel Private Cloud](https://laravel.com/cloud/private-cloud)
- Cloudflare Hyperdrive conecta Workers a Postgres/MySQL tradicionais e mantém pools de conexões no edge; suporta Neon, AWS, Supabase e outros bancos compatíveis. [Cloudflare Hyperdrive: supported databases](https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/) e [Cloudflare Hyperdrive: connection pooling](https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/)
- Hyperdrive mantém conexões de origem e pode acelerar a conectividade de Workers a bancos regionais, mas tem considerações de recursos não suportados, incluindo advisory locks e `LISTEN`/`NOTIFY` para Postgres. [Cloudflare Hyperdrive: supported databases and features](https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/)

### Inferences
- Como o público inicial é brasileiro e o Laravel Cloud não lista Brasil, escolher a região de menor latência entre as disponíveis e colocar banco e app juntos. Virginia ou Ohio são candidatas a comparar por medição real; não há base suficiente aqui para afirmar qual delas terá menor latência em todo o Brasil.
- Usar Cloudflare para DNS/CDN/WAF junto de Laravel Cloud não implica mover PHP e banco para Workers. Se futuramente o backend for executado em Workers, Hyperdrive pode intermediar uma conexão com PostgreSQL; D1 só faria sentido após uma escolha explícita de arquitetura baseada em Workers.
- Para o Fluxo, evitar banco externo no primeiro deploy reduz configuração e o número de provedores que precisam ser operados. Usar banco externo pode fazer sentido por preço, localização ou requisito contratual, mas exige gerir credenciais, rede pública/allowlist, backups e suporte de dois serviços.

### Gaps
- A lista de regiões publicada pelo Laravel Cloud pode mudar e não inclui uma promessa de disponibilidade regional para cada recurso de banco. Confirmar no painel durante provisionamento que a região escolhida está disponível tanto para app quanto para o banco.
- Não comparei preços efetivos entre Neon direto, Laravel Serverless Postgres e outros Postgres gerenciados; variam com região, armazenamento, tempo ativo, backups e tráfego. A estimativa deve ser refeita no pricing calculator com o perfil esperado.
- A escolha da região depende do mercado que será atendido primeiro (Brasil, Estados Unidos ou ambos); medir latência real com as opções ofertadas antes do go-live.

## Migração SQLite para PostgreSQL e recomendação para o Fluxo

### Takeaway

A mudança é viável e o Laravel tem suporte first-party tanto a SQLite quanto PostgreSQL, mas a compatibilidade não é garantida apenas por trocar `DB_CONNECTION`: revisar migrations, consultas SQL e tipos, exportar/importar dados existentes e testar um ensaio de migração. O repositório está configurado por padrão para SQLite e usa sessões, fila e cache em banco; no deploy, também é necessário escolher backends persistentes/compartilhados para esses serviços.

### Cited Findings
- O Laravel declara suporte first-party a SQLite e PostgreSQL e centraliza as conexões em `config/database.php`; o `.env.example` deste projeto define `DB_CONNECTION=sqlite`. [Laravel: Database Getting Started](https://laravel.com/framework/docs/database/config)
- O Laravel suporta conexões configuradas por variáveis de ambiente e o Laravel Cloud injeta as credenciais de sua base gerenciada no deploy. [Laravel: Database Configuration](https://laravel.com/framework/docs/database/config) e [Laravel Cloud deploy guide](https://laravel.com/cloud/deploy-a-laravel-app)
- Cloudflare fornece procedimento para exportar e importar dados de SQLite para D1, com observações sobre conversão de `.sqlite3` para SQL e edição do dump; isso se aplica a migração para D1, não é um caminho automático para PostgreSQL. [Cloudflare D1: import and export data](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
- O `.env.example` deste projeto define `SESSION_DRIVER=database`, `QUEUE_CONNECTION=database` e `CACHE_STORE=database`; logo, sessão/cache/queue também usam tabelas do banco por padrão localmente. *(Observação do repositório: `projeto/app/.env.example`; não é uma afirmação de fonte externa.)*
- Laravel oferece banco gerenciado com pool de conexões e as aplicações podem escalar em réplicas; isso evita o padrão de várias instâncias gravarem um único arquivo SQLite local. [Laravel Cloud: deploy guide](https://laravel.com/cloud/deploy-a-laravel-app)

### Inferences
- As migrations existentes devem ser auditadas para qualquer SQL SQLite específico, tipos não portáveis, comportamento de boolean/datetime/JSON, collations e pressupostos sobre ordenação. Query Builder/Eloquent e Schema Builder tendem a reduzir o trabalho, mas a documentação consultada não promete migração automática e sem ajustes entre engines.
- O `.env.example` já define drivers de sessão, fila e cache dependentes de banco, então migrar para Postgres tende a manter esses recursos funcionais no começo. Para um app com tráfego, vale considerar cache/filas em um serviço KV gerenciado se carga ou isolamento operacional justificar; essa escolha não é pré-requisito para o primeiro deploy.
- Como o `.env.example` indica SQLite e sessões/fila/cache em banco, o plano deve prever: provisionar Postgres no mesmo ambiente/região do app; executar migrations em staging; revisar consultas e constraints; exportar/importar dados de usuários caso o banco local já contenha dados a preservar; e testar rollback/restauração de snapshot antes de produção.
- Recomendação: Laravel Cloud + Serverless Postgres, em região compartilhada pelo app, configurando PITR (retenção escolhida entre 7 e 30 dias conforme custo/requisito) e executando as migrations no deploy. Considerar MySQL gerenciado se a análise do schema revelar incompatibilidades importantes ou se a equipe preferir o engine, mantendo o mesmo princípio: banco de rede gerenciado, não arquivo SQLite local.

### Gaps
- Não foi feito inventário das migrations e queries de negócio para determinar se há SQL exclusivo de SQLite; isso requer uma revisão do repositório antes da migração.
- A configuração local do exemplo não mostra os dados existentes nem um banco de produção, então não se sabe se é preciso preservar dados históricos ou se é suficiente criar o Postgres vazio com migrations.
- Não há estimativa de volume de sessões, jobs, cache ou conexões em produção para dimensionar pool/recursos; medir com tráfego de staging e ajustar limites após o primeiro deploy.
