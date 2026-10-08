# Fluxo

Seu trabalho, passo a passo. Kanban pessoal em Vue e Laravel, com SQLite e execução local no Windows.

## Instalar a partir do GitHub

Requisitos: Node.js 22 ou superior, PHP 8.3 ou superior com SQLite e Composer. O banco, as imagens enviadas e as dependências locais não são versionados.

```powershell
git clone https://github.com/nicosikmoraes/fluxo.git
cd fluxo
Copy-Item app/.env.example app/.env
New-Item app/database/database.sqlite -ItemType File
cd app
composer install
php artisan key:generate
php artisan migrate
cd ../ui
npm ci
npm run build
cd ../app
php artisan serve --host=127.0.0.1 --port=8787
```

Abra `http://127.0.0.1:8787`. Nas próximas vezes, basta executar o último comando na pasta `app` e manter o terminal aberto. No Windows, o inicializador abaixo também pode ser usado quando o PHP portátil estiver em `.runtime/php/php.exe`.

## Abrir o aplicativo local já instalado

1. Dê dois cliques em **Iniciar-Fluxo.cmd**, nesta pasta.
2. O navegador abre em **http://127.0.0.1:8787**.
3. Mantenha a janela do inicializador aberta durante o uso. Para encerrar, pressione **Ctrl+C** ou digite **q** e Enter.

Abrir apenas o endereço no navegador não inicia o servidor. Execute o arquivo pelo Explorador de Arquivos do Windows; abrir o `.cmd` no editor do Codex apenas mostra seu conteúdo.

Também é possível pressionar **Win+R**, colar o caminho completo de `Iniciar-Fluxo.cmd` entre aspas e pressionar Enter. O inicializador abre o navegador quando a API estiver pronta. Se houver uma falha, a janela mantém o erro visível.

O PHP portátil, as dependências e a interface compilada já estão nesta pasta. O Node.js instalado no computador é usado pelo inicializador.

## Usar

- Crie uma task com título obrigatório, descrição opcional e projeto opcional.
- Abra a task e adicione atividades. Cada uma pode estar pendente, em andamento ou concluída.
- O status da task é calculado: sem atividades ou com todas pendentes, fica pendente; com todas concluídas, fica concluída; nos outros casos, fica em andamento.
- Para registrar uma dependência, bloqueie a atividade e informe a pessoa e o que precisa ser concluído. Ela ganha um destaque e um aviso de espera. Você a desbloqueia manualmente.
- Escreva vários comentários por atividade. É possível editar e excluir os comentários.
- Arraste pelo ícone de pontos para ordenar cards dentro da coluna e atividades dentro da task. As atividades definem a coluna da task.
- Use a busca por título, descrição, atividade ou pessoa. Os filtros permitem ver status e tasks com bloqueio.
- A aba Projetos reúne os projetos e seus quadros. Projetos são opcionais.
- Dentro de um projeto, abra a aba **Roadmap**. Crie quantos mapas quiser e escolha o mapa pelo seletor no topo. Você pode renomear e excluir cada mapa.
- Arraste atividades da lateral para o quadro ou use o botão **+** do card. Mova os cards pela faixa superior. O quadro cresce horizontalmente e as posições são salvas automaticamente.
- Ligue o ponto à direita de um card ao ponto à esquerda de outro, arrastando ou clicando nos dois pontos. As setas indicam a ordem e permitem ramificações. Clique numa seta e em **Remover conexão** para desfazer a ligação.
- Arraste o fundo para navegar. Use os controles de zoom, **Ctrl + rolagem** ou **Mostrar todos os cards**. Cards também podem ser movidos com as setas do teclado quando estiverem selecionados.
- A mesma atividade pode aparecer em vários mapas. Remover um card ou excluir um mapa preserva as atividades nas tasks. Clicar no título ou nos comentários de um card abre seus detalhes. A ordem do roadmap antigo é preservada como cards conectados no **Roadmap principal**.
- Escolha uma capa ilustrada para o projeto ou envie uma imagem. Tasks também podem receber imagens opcionais, até 8 MB em JPG, PNG, WebP ou GIF.
- As exclusões são permanentes. Ao excluir um projeto, escolha manter as tasks sem projeto ou excluir tudo.

O tema claro tem uma ilustração própria, capas, transições, animação ao concluir atividades e ajustes para telas menores. A interface respeita a preferência do sistema por redução de movimento.

## Dados locais

- Banco: `app/database/database.sqlite`.
- Imagens enviadas: `app/storage/app/public/images`.
- Não há contas, login, notificações ou rotina de backup.
- O servidor escuta apenas em `127.0.0.1`.

## Desenvolvimento

Estrutura:

- `ui/`: Vue, Vite, ícones Lucide e SortableJS.
- `app/`: Laravel, API, migrations e modelos.
- `.runtime/`: PHP portátil e Composer.
- `tests/api.mjs`: verificações de integração em banco isolado.
- `start.cjs`: inicializador local.

Para trabalhar com atualização automática da interface, abra dois terminais nesta pasta:

```powershell
node start.cjs --no-browser
```

```powershell
cd ui
npm run dev
```

Abra `http://127.0.0.1:5173/ui/`. O Vite encaminha API e imagens para o Laravel em `8787`.

Para gerar a interface de produção novamente:

```powershell
cd ui
npm run build
```

Para aplicar migrations:

```powershell
cd app
..\.runtime\php\php.exe artisan migrate
```

Para instalar dependências após alterar os arquivos de pacotes:

```powershell
cd ui
npm install
```

```powershell
cd app
..\.runtime\php\php.exe ..\.runtime\composer.phar install
```

## Verificações

Integração da API, usando um banco descartável separado:

```powershell
node tests/api.mjs
```

Componentes Vue conectados à API real, também em banco separado:

```powershell
cd ui
npm test
```

A porta `8002` deve estar livre para as verificações. Os testes não utilizam o banco do aplicativo.

Para verificar a migração do roadmap com dados anteriores:

```powershell
node tests/roadmap-migration.cjs
```

Os testes de componentes validam criação de projeto/task, atividades, bloqueio e desbloqueio, comentários, conclusão automática, filtros, roadmap e exclusão de projeto preservando tasks. Eles não substituem uma revisão visual em navegador real.

## Imagem

A ilustração foi criada com a ferramenta integrada imagegen e está em `ui/public/hero.png`. O prompt e o uso estão documentados em `ASSET.md`.
