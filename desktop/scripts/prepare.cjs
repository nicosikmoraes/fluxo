const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const destination = path.join(root, 'desktop/.build/resources');

function isBundledBackendFile(file) {
  const relative = file.split(path.sep).join('/');
  const parts = relative.split('/');
  return !parts.some((part) => part.startsWith('.env') || part === '.git' || part === 'node_modules') &&
    !/\.sqlite(?:-|$)/i.test(relative) &&
    !relative.startsWith('storage/') &&
    !relative.startsWith('bootstrap/cache/');
}

async function prepare() {
  const resolved = path.resolve(destination);
  if (!resolved.startsWith(path.join(root, 'desktop/.build') + path.sep)) throw new Error(
    'Pasta de preparação inválida.');
  await fs.rm(resolved, {
    recursive: true,
    force: true
  });
  await fs.mkdir(resolved, {
    recursive: true
  });
  const backend = path.join(resolved, 'backend');
  for (const entry of ['app', 'bootstrap', 'config', 'database/migrations', 'public', 'resources', 'routes', 'vendor',
      'composer.json', 'composer.lock', 'artisan'
    ]) {
    const source = path.join(root, 'app', entry);
    await fs.cp(source, path.join(backend, entry), {
      recursive: true,
      filter: (file) => isBundledBackendFile(path.relative(path.join(root, 'app'), file)),
    });
  }
  await fs.mkdir(path.join(backend, 'bootstrap/cache'), {
    recursive: true
  });
  const php = path.join(root, '.runtime/php');
  await fs.mkdir(path.join(resolved, 'php'), {
    recursive: true
  });
  for (const entry of await fs.readdir(php)) {
    if (entry === 'ext' || entry === 'php.exe' || entry.toLowerCase().endsWith('.dll') || entry === 'license.txt' ||
      entry === 'readme-redist-bins.txt') {
      await fs.cp(path.join(php, entry), path.join(resolved, 'php', entry), {
        recursive: true
      });
    }
  }
  const redistRoots = [
    process.env.VCToolsRedistDir,
    'C:/Program Files (x86)/Microsoft Visual Studio/18/BuildTools/VC/Redist/MSVC',
    'C:/Program Files/Microsoft Visual Studio/2022/BuildTools/VC/Redist/MSVC',
    'C:/Program Files (x86)/Microsoft Visual Studio/2019/BuildTools/VC/Redist/MSVC',
  ].filter(Boolean);
  let copiedRuntime = false;
  for (const redistRoot of redistRoots) {
    const versions = await fs.readdir(redistRoot).catch(() => []);
    const candidates = [redistRoot, ...versions.filter((item) => Number.isFinite(Number(item.split('.')[0]))).sort()
      .reverse().map((item) => path.join(redistRoot, item))
    ];
    for (const candidate of candidates) {
      const folders = await fs.readdir(path.join(candidate, 'x64')).catch(() => []);
      const crt = folders.find((item) => item.startsWith('Microsoft.VC') && item.endsWith('.CRT'));
      if (!crt) continue;
      for (const entry of await fs.readdir(path.join(candidate, 'x64', crt))) {
        if (entry.endsWith('.dll')) await fs.copyFile(path.join(candidate, 'x64', crt, entry), path.join(resolved,
          'php', entry));
      }
      copiedRuntime = true;
      break;
    }
    if (copiedRuntime) break;
  }
  if (!copiedRuntime) throw new Error(
    'Não foi possível localizar o runtime C++ redistribuível. Defina VCToolsRedistDir.');
  await fs.copyFile(path.join(root, 'desktop/runtime/php.ini'), path.join(resolved, 'php/php.ini'));
  await fs.cp(path.join(root, 'desktop/runtime'), path.join(resolved, 'runtime'), {
    recursive: true
  });
  console.log('Serviço local preparado sem bancos, contas ou configurações pessoais.');
  return resolved;
}

if (require.main === module) prepare().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
module.exports = {
  prepare,
  isBundledBackendFile
};
