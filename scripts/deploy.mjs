#!/usr/bin/env node
// Deploys a commit of Custom Tabletop to the VPS (tabletop.murri.me).
//
//   npm run deploy               # deploys HEAD (committed state only)
//   npm run deploy -- <commit>   # a specific commit — also how to roll back
//
// Node rather than bash so it runs the same from PowerShell, cmd and Git
// Bash (from PowerShell/cmd, `bash` is the WSL launcher, not Git's bash).
// Needs only `git` and `ssh` on PATH (Windows ships OpenSSH).
//
// Ships the commit's files over SSH (`git archive`, so no push is needed and
// exactly the tested commit goes out), then runs scripts/deploy-remote.sh on
// the VPS: swap in the source, build, restart the one container, wait for it
// to report healthy. Details: docs/engineering/deployment.md.
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const HOST = process.env.DEPLOY_HOST ?? 'root@murri.me';
const APP_DIR = '/srv/apps/tabletop';
/** What the image is built from — everything else stays behind. */
const SHIPPED_PATHS = [
  'Dockerfile',
  '.dockerignore',
  'deploy',
  'package.json',
  'package-lock.json',
  'tsconfig.base.json',
  'shared',
  'server',
  'client',
];

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function run(command, args, { input, stdin } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: [input !== undefined || stdin ? 'pipe' : 'inherit', 'inherit', 'inherit'],
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)),
    );
    if (stdin) stdin.pipe(child.stdin);
    else if (input !== undefined) child.stdin.end(input);
  });
}

async function main() {
  const requested = process.argv[2];
  const commit = git('rev-parse', `${requested ?? 'HEAD'}^{commit}`);
  if (!requested && git('status', '--porcelain', '--untracked-files=no')) {
    console.warn(`Note: uncommitted changes are not deployed — only ${commit.slice(0, 7)}.`);
  }
  console.log(`Deploying ${git('log', '--oneline', '-1', commit)} to ${HOST}`);

  // 1. Stream the commit's files straight into <app>/src.new on the VPS.
  const archive = spawn('git', ['archive', '--format=tar', commit, ...SHIPPED_PATHS], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const archived = new Promise((resolve, reject) => {
    archive.on('error', reject);
    archive.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`git archive exited with ${code}`)),
    );
  });
  await Promise.all([
    archived,
    run(
      'ssh',
      [
        HOST,
        `rm -rf '${APP_DIR}/src.new' && mkdir -p '${APP_DIR}/src.new' && tar -x -C '${APP_DIR}/src.new'`,
      ],
      { stdin: archive.stdout },
    ),
  ]);

  // 2. Build and restart on the VPS (the script is sent over stdin).
  const remoteScript = readFileSync(new URL('./deploy-remote.sh', import.meta.url), 'utf8');
  await run('ssh', [HOST, 'bash', '-s', '--', commit, APP_DIR], {
    input: remoteScript.replace(/\r\n/g, '\n'),
  });
}

main().catch((error) => {
  console.error(`Deploy failed: ${error.message}`);
  process.exit(1);
});
