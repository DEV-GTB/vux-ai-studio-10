import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { readFile, realpath } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE_ROOT = path.resolve(__dirname, '..');
const SAFE_ARGUMENT = /^[A-Za-z0-9@._/+,:=-]+$/;
const SAFE_PACKAGE = /^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+(?:@[A-Za-z0-9._-]+)?$/;
const INSTALL_FLAGS = new Set(['-D', '--save-dev', '--save', '--save-exact', '--no-save', '--no-audit', '--no-fund', '--ignore-scripts', '--dry-run']);

export async function getLocalWorkspaceRoot() {
  return realpath(path.resolve(process.env.STUDIO_WORKSPACE_ROOT || DEFAULT_WORKSPACE_ROOT));
}

function invalidCommand(message = 'Command is not in the local command allowlist.') {
  return Object.assign(new Error(message), { status: 400 });
}

export async function resolveLocalCommand(command, workspaceRoot) {
  const root = workspaceRoot || await getLocalWorkspaceRoot();
  if (typeof command !== 'string' || command.length > 500 || /[;&|`$<>\r\n"'%]/.test(command)) {
    throw invalidCommand();
  }

  const tokens = command.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || tokens.some((token) => !SAFE_ARGUMENT.test(token))) throw invalidCommand();

  const [program, ...args] = tokens;
  const executableName = program.toLowerCase().replace(/\.cmd$/, '');
  if (executableName === 'npm' || executableName === 'npx') {
    if (executableName === 'npx') throw invalidCommand('npx is disabled because it can download and execute unreviewed packages.');
    const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    const scripts = packageJson.scripts || {};
    const subcommand = args[0];
    const remaining = args.slice(1);

    if (['--version', '-v'].includes(subcommand) && remaining.length === 0) return commandSpec('npm', args);
    if (subcommand === 'test' && remaining.length === 0 && scripts.test) return commandSpec('npm', args);
    if (subcommand === 'start' && remaining.length === 0 && scripts.start) return commandSpec('npm', args);
    if (subcommand === 'run' && remaining.length === 1 && Object.hasOwn(scripts, remaining[0])) return commandSpec('npm', args);
    if (subcommand === 'pkg' && remaining.length === 2 && remaining[0] === 'get' && ['name', 'version'].includes(remaining[1])) return commandSpec('npm', args);
    if (subcommand === 'list' && remaining.length === 1 && remaining[0] === '--depth=0') return commandSpec('npm', args);
    if (subcommand === 'ci' && remaining.every((arg) => ['--ignore-scripts', '--no-audit', '--no-fund', '--dry-run'].includes(arg))) return commandSpec('npm', args);
    if ((subcommand === 'install' || subcommand === 'i') && remaining.every((arg) => arg.startsWith('-') ? INSTALL_FLAGS.has(arg) : SAFE_PACKAGE.test(arg))) {
      return commandSpec('npm', args, root);
    }
    throw invalidCommand('Supported npm commands: --version, test, start, run <script>, pkg get name|version, list --depth=0, install, and ci.');
  }

  if (['node', 'python', 'python3', 'pip', 'pip3'].includes(executableName)) {
    if (['--version', '-V', '-v'].includes(args[0]) && args.length === 1) return commandSpec(executableName, args);
    if (executableName.startsWith('pip') && (args[0] === '--version' || args[0] === 'show' && args.length === 2 && SAFE_PACKAGE.test(args[1]))) {
      return commandSpec(executableName, args);
    }
    if (executableName.startsWith('pip') && (args[0] === 'install' || args[0] === 'uninstall') && args.slice(1).every((arg) => SAFE_PACKAGE.test(arg) || ['-y', '--yes', '--no-deps'].includes(arg))) {
      return commandSpec(executableName, args);
    }
    if (executableName.startsWith('python') && args[0] === '-m' && args[1] === 'pytest' && args.slice(2).every((arg) => SAFE_ARGUMENT.test(arg))) {
      return commandSpec(executableName, args);
    }
    if (executableName.startsWith('python') && args[0] === '-m' && args[1] === 'pip' && ['install', 'uninstall'].includes(args[2]) && args.slice(3).every((arg) => SAFE_PACKAGE.test(arg) || ['-y', '--yes', '--no-deps'].includes(arg))) {
      return commandSpec(executableName, args);
    }
    throw invalidCommand('Only version checks, pytest, and explicit pip install/uninstall commands are supported.');
  }

  if (executableName === 'git') {
    const supported = [
      ['status'], ['status', '--short'], ['status', '--branch'],
      ['diff'], ['diff', '--stat'], ['diff', '--name-only'],
      ['branch', '--show-current'], ['log', '--oneline'],
    ];
    if (supported.some((allowed) => allowed.length === args.length && allowed.every((value, index) => value === args[index]))) {
      return commandSpec('git', args);
    }
  }

  throw invalidCommand();
}

function commandSpec(program, args, workspaceRoot) {
  const windowsCommand = process.platform === 'win32' && program === 'npm';
  const npmCli = windowsCommand ? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js') : null;
  if (windowsCommand && npmCli) {
    return { executable: process.execPath, args: [npmCli, ...args], shell: false, display: [program, ...args].join(' '), cwd: workspaceRoot };
  }
  return {
    executable: program,
    args,
    shell: false,
    display: [program, ...args].join(' '),
  };
}

export async function runLocalCommand(command, options = {}) {
  const cwd = await getLocalWorkspaceRoot();
  const spec = await resolveLocalCommand(command, cwd);
  try {
    const result = await execFileAsync(spec.executable, spec.args, {
      cwd,
      shell: spec.shell,
      timeout: options.timeout || 120000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    return { ...spec, success: true, code: 0, stdout: result.stdout || '', stderr: result.stderr || '' };
  } catch (error) {
    return {
      ...spec,
      success: false,
      code: Number.isInteger(error.code) ? error.code : error.killed ? 124 : 1,
      stdout: error.stdout || '',
      stderr: error.stderr || error.message || 'Command failed.',
    };
  }
}

export async function startLocalCommand(command) {
  const cwd = await getLocalWorkspaceRoot();
  const spec = await resolveLocalCommand(command, cwd);
  return new Promise((resolve, reject) => {
    const child = spawn(spec.executable, spec.args, {
      cwd,
      detached: true,
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve({ pid: child.pid, display: spec.display });
    });
  });
}