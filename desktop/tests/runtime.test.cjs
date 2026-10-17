const {
  test
} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const {
  spawn,
  execFile
} = require('node:child_process');
const {
  promisify
} = require('node:util');
const {
  isBundledBackendFile
} = require('../scripts/prepare.cjs');
const exec = promisify(execFile);
const build = path.resolve(__dirname, '../.build');
const resources = path.join(build, 'resources');
const php = path.join(resources, 'php/php.exe');
const phpArgs = ['-d', 'opcache.enable=0', '-d', 'opcache.enable_cli=0', '-c', path.join(resources, 'php/php.ini'), '-d', 'extension_dir=' + path.join(resources, 'php/ext')];

function environment(data, url) {
  const env = {
    ...process.env,
    FLUXO_BACKEND_DIR: path.join(resources, 'backend'),
    FLUXO_DATA_DIR: data,
    APP_ENV: 'desktop',
    APP_DEBUG: 'false',
    APP_URL: url,
    DB_CONNECTION: 'sqlite',
    DB_DATABASE: path.join(data, 'database.sqlite'),
    SESSION_COOKIE: 'fluxo_desktop_session',
    FLUXO_INSTANCE: 'runtime-test'
  };
  delete env.APP_KEY;
  for (const [key, file] of [
      ['APP_CONFIG_CACHE', 'config.php'],
      ['APP_SERVICES_CACHE', 'services.php'],
      ['APP_PACKAGES_CACHE', 'packages.php'],
      ['APP_ROUTES_CACHE', 'routes.php'],
      ['APP_EVENTS_CACHE', 'events.php']
    ]) env[key] = path.join(data, 'cache', file);
  return env;
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function start(data) {
  const port = await freePort();
  const url = 'http://127.0.0.1:' + port;
  const env = environment(data, url);
  await exec(php, [...phpArgs, path.join(resources, 'runtime/prepare.php')], {
    env,
    cwd: resources,
    timeout: 90000,
    windowsHide: true
  });
  const child = spawn(php, [...phpArgs, '-S', '127.0.0.1:' + port, '-t', path.join(resources, 'backend/public'), path
    .join(resources, 'runtime/router.php')
  ], {
    env,
    cwd: resources,
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let logs = '';
  child.stderr.on('data', (chunk) => {
    logs += chunk;
  });
  let stopping;
  const stop = () => {
    if (stopping) return stopping;
    stopping = new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      child.once('exit', resolve);
      child.kill();
    });
    return stopping;
  };
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await fetch(url + '/__fluxo_desktop_health').then((r) => r.json()).catch(() => null);
      if (result?.instance === 'runtime-test') return {
        url,
        stop,
        logs: () => logs
      };
      if (child.exitCode !== null) throw new Error(logs);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('O serviço não iniciou: ' + logs);
  } catch (error) {
    await stop();
    throw error;
  }
}

function client(url) {
  const cookies = new Map();
  let csrf = '';
  return async function request(route, method = 'GET', payload) {
    const result = await fetch(url + '/api' + route, {
      method,
      headers: {
        Accept: 'application/json',
        Cookie: [...cookies].map(([key, value]) => key + '=' + value).join('; '),
        ...(csrf ? {
          'X-CSRF-TOKEN': csrf
        } : {}),
        ...(payload ? {
          'Content-Type': 'application/json'
        } : {})
      },
      body: payload ? JSON.stringify(payload) : undefined
    });
    for (const value of result.headers.getSetCookie()) {
      const pair = value.split(';')[0];
      const equals = pair.indexOf('=');
      cookies.set(pair.slice(0, equals), pair.slice(equals + 1));
    }
    const body = await result.json();
    if (body.csrf_token) csrf = body.csrf_token;
    assert.ok(result.ok, JSON.stringify(body));
    return body;
  };
}

test('o instalador exclui configurações pessoais, bancos e armazenamento', async () => {
  for (const file of ['.env', '.env.backup', 'database/database.sqlite', 'database/database.sqlite-wal',
      'storage/logs/laravel.log', 'bootstrap/cache/config.php'
    ]) assert.equal(isBundledBackendFile(file), false, file);
  assert.equal(isBundledBackendFile('database/migrations/2026_10_17_add_breaks.php'), true);
  for (const file of ['backend/.env', 'backend/database/database.sqlite', 'backend/storage']) await assert
    .rejects(fs.access(path.join(resources, file)));
});

test('os horários e os campos criptografados sobrevivem ao reinício e à importação local', {
  timeout: 180000
}, async (t) => {
  const data = await fs.mkdtemp(path.join(build, 'test-persistence-'));
  let server;
  t.after(async () => {
    await server?.stop();
    assert.ok(path.resolve(data).startsWith(build + path.sep + 'test-'));
    await fs.rm(data, {
      recursive: true,
      force: true
    });
  });
  server = await start(data);
  let request = client(server.url);
  await request('/auth/session');
  await request('/auth/register', 'POST', {
    name: 'Perfil de verificação',
    email: 'desktop@example.test',
    password: 'local-test-123',
    password_confirmation: 'local-test-123'
  });
  const original = await request('/profile/work-hours?timezone=UTC');
  await request('/profile/work-hours', 'PUT', {
    settings: {
      ...original.settings,
      enabled: true,
      monthlySalary: 4400,
      cycleClosingDay: 20
    },
    settings_version: original.settings_version,
    date: original.today,
    entry_version: original.day.version,
    entries: original.day.entries,
    additional_breaks: []
  });
  const started = await request('/profile/work-hours/records', 'POST', {
    action: 'start',
    date: original.today,
    entry_version: 0
  });
  const environmentBefore = await fs.readFile(path.join(data, '.env'), 'utf8');
  await server.stop();
  server = await start(data);
  request = client(server.url);
  await request('/auth/session');
  await request('/auth/login', 'POST', {
    email: 'desktop@example.test',
    password: 'local-test-123'
  });
  const restored = await request('/profile/work-hours?timezone=UTC');
  assert.equal(restored.settings.monthlySalary, 4400);
  assert.equal(restored.settings.cycleClosingDay, 20);
  assert.equal(restored.day.instants.startedAt, started.day.instants.startedAt);
  assert.equal(await fs.readFile(path.join(data, '.env'), 'utf8'), environmentBefore);
  await server.stop();
  await fs.appendFile(path.join(data, '.env'), '\nDB_DATABASE="' + path.join(data, 'database.sqlite').split(path.sep).join('/') + '"\n');
  const sourceBefore = await fs.readFile(path.join(data, 'database.sqlite'));
  const imported = await fs.mkdtemp(path.join(build, 'test-import-'));
  let importedServer;
  t.after(async () => {
    await importedServer?.stop();
    assert.ok(path.resolve(imported).startsWith(build + path.sep + 'test-'));
    await fs.rm(imported, {
      recursive: true,
      force: true
    });
  });
  importedServer = await start(imported);
  await importedServer.stop();
  await exec(php, [...phpArgs, path.join(resources, 'runtime/import.php'), data], {
    env: environment(imported, importedServer.url),
    cwd: resources,
    windowsHide: true,
    timeout: 90000
  });
  importedServer = await start(imported);
  const importedRequest = client(importedServer.url);
  await importedRequest('/auth/session');
  await importedRequest('/auth/login', 'POST', {
    email: 'desktop@example.test',
    password: 'local-test-123'
  });
  const importedDay = await importedRequest('/profile/work-hours?timezone=UTC');
  assert.equal(importedDay.settings.monthlySalary, 4400);
  assert.equal(importedDay.day.instants.startedAt, started.day.instants.startedAt);
  assert.deepEqual(await fs.readFile(path.join(data, 'database.sqlite')), sourceBefore);
  await importedServer.stop();
  await assert.rejects(exec(php, [...phpArgs, path.join(resources, 'runtime/import.php'), data], {
    env: environment(imported, importedServer.url),
    cwd: resources,
    windowsHide: true,
    timeout: 90000
  }), (error) => /Importe antes/.test(error.stderr));

});
