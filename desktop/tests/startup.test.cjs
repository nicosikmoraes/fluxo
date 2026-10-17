const {
  test
} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');

test('a tela de falha mostra o erro depois que o conteúdo carrega', async () => {
  const message = 'Não foi possível iniciar os dados locais: arquivo ausente.';
  const status = {
    textContent: 'Falha ao iniciar.'
  };
  const script = await fs.readFile(path.join(__dirname, '../shell/startup.js'), 'utf8');
  vm.runInNewContext(script, {
    window: {
      __FLUXO_STARTUP_ERROR__: message
    },
    document: {
      getElementById: () => status
    }
  });
  assert.equal(status.textContent, message);
  const html = await fs.readFile(path.join(__dirname, '../shell/index.html'), 'utf8');
  assert.match(html, /src="startup.js" defer/);
  assert.doesNotMatch(html, /Preparando seu espaço local/);
});

test('a tela de falha preserva uma mensagem útil quando não há detalhes', async () => {
  const status = {
    textContent: 'O serviço local não iniciou.'
  };
  const script = await fs.readFile(path.join(__dirname, '../shell/startup.js'), 'utf8');
  vm.runInNewContext(script, {
    window: {},
    document: {
      getElementById: () => status
    }
  });
  assert.equal(status.textContent, 'O serviço local não iniciou.');
});
