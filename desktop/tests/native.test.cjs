const {
  test
} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  execFile
} = require('node:child_process');
const {
  promisify
} = require('node:util');
const execute = promisify(execFile);
const build = path.resolve(__dirname, '../.build');
const executable = path.resolve(__dirname, '../src-tauri/target/release/fluxo-jornada.exe');

test('o executável empacotado inicia e encerra o serviço local com seus próprios recursos', {
  timeout: 120000
}, async (t) => {
  const data = await fs.mkdtemp(path.join(build, 'test-native-'));
  t.after(async () => {
    assert.ok(path.resolve(data).startsWith(build + path.sep + 'test-'));
    await fs.rm(data, {
      recursive: true,
      force: true
    });
  });
  await execute(executable, ['--check-runtime', data], {
    windowsHide: true,
    timeout: 90000
  });
  const report = JSON.parse(await fs.readFile(path.join(data, 'runtime-check.json'), 'utf8'));
  assert.equal(report.ready, true);
  await assert.rejects(fetch(report.url + '/__fluxo_desktop_health', {
    signal: AbortSignal.timeout(1000)
  }));
  await fs.access(path.join(data, 'database.sqlite'));
  await fs.access(path.join(data, '.env'));
});
