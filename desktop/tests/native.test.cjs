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
const executable = process.env.FLUXO_DESKTOP_EXECUTABLE || path.resolve(__dirname, '../src-tauri/target/release/fluxo-jornada.exe');

test('o executável empacotado inicia e encerra o serviço local com seus próprios recursos', {
  timeout: 120000
}, async (t) => {
  const temporary = await fs.mkdtemp(path.join(build, 'test-native-local space-'));
  const data = path.join(temporary, 'data');
  const installation = path.join(temporary, 'Fluxo Jornada');
  const resources = ['backend', 'php', 'runtime'];
  t.after(async () => {
    assert.ok(path.resolve(temporary).startsWith(build + path.sep + 'test-'));
    for (const resource of resources) {
      await fs.unlink(path.join(installation, resource)).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    await fs.rm(temporary, {
      recursive: true,
      force: true
    });
  });
  await fs.mkdir(installation);
  const installedExecutable = path.join(installation, 'fluxo-jornada.exe');
  await fs.copyFile(executable, installedExecutable);
  for (const resource of resources) {
    await fs.symlink(path.join(path.dirname(executable), resource), path.join(installation, resource), 'junction');
  }
  await execute(installedExecutable, ['--check-runtime', data], {
    windowsHide: true,
    timeout: 90000
  });
  const report = JSON.parse(await fs.readFile(path.join(data, 'runtime-check.json'), 'utf8'));
  assert.equal(report.ready, true);
  assert.ok(report.resources.includes('Fluxo Jornada'));
  if (process.platform === 'win32') assert.ok(report.resources.startsWith('\\\\?\\'), 'Usa o caminho canônico fornecido pelo Tauri');
  await assert.rejects(fetch(report.url + '/__fluxo_desktop_health', {
    signal: AbortSignal.timeout(1000)
  }));
  await fs.access(path.join(data, 'database.sqlite'));
  await fs.access(path.join(data, '.env'));
});
