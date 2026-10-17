const fs = require('node:fs');
const path = require('node:path');
const {
  spawnSync
} = require('node:child_process');
const {
  prepare
} = require('./prepare.cjs');
const desktop = path.resolve(__dirname, '..');
const root = path.resolve(desktop, '..');
const localCargo = path.join(root, '.runtime/cargo');
const localRustup = path.join(root, '.runtime/rustup');
const env = {
  ...process.env,
  CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS || "4"
};
if (fs.existsSync(path.join(localCargo, 'bin/cargo.exe'))) {
  env.CARGO_HOME = localCargo;
  env.RUSTUP_HOME = localRustup;
  env.PATH = path.join(localCargo, 'bin') + path.delimiter + env.PATH;
}

function run(executable, args, cwd) {
  const result = spawnSync(executable, args, {
    cwd,
    env,
    stdio: 'inherit',
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('A compilação foi interrompida (código ' + result.status + ').');
}
async function build() {
  run(process.execPath, [path.join(root, 'ui/node_modules/vite/bin/vite.js'), 'build'], path.join(root, 'ui'));
  for (const file of ['index.html', 'prototypes/work-hours.html', 'prototypes/work-history.html']) {
    const output = path.join(root, 'app/public/ui', file);
    if (fs.existsSync(output)) fs.writeFileSync(output, fs.readFileSync(output, 'utf8').replace(/\r\n/g, '\n'));
  }
  await prepare();
  const mode = process.argv.includes('--dev') ? 'dev' : 'build';
  const args = [path.join(desktop, 'node_modules/@tauri-apps/cli/tauri.js'), mode];
  if (mode === 'build') args.push('--bundles', 'nsis');
  run(process.execPath, args, desktop);
  if (mode === 'build') {
    const output = path.join(desktop, 'src-tauri/target/release/bundle/nsis');
    fs.mkdirSync(path.join(desktop, 'dist'), {
      recursive: true
    });
    for (const file of fs.readdirSync(output).filter((file) => file.endsWith('.exe'))) {
      fs.copyFileSync(path.join(output, file), path.join(desktop, 'dist', file));
      console.log('Instalador: ' + path.join(desktop, 'dist', file));
    }
  }
}
build().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
