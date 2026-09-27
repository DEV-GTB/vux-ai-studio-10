import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, access } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();
const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Detect project type and available commands
async function detectProjectType(projectPath) {
  try {
    const rootPath = path.join(__dirname, '..');
    
    // Check for package.json (Node.js/React)
    try {
      await access(path.join(rootPath, 'package.json'));
      const packageJson = JSON.parse(await readFile(path.join(rootPath, 'package.json'), 'utf-8'));
      return {
        type: 'node',
        framework: packageJson.dependencies?.react ? 'React' : 'Node.js',
        packageManager: 'npm',
        scripts: packageJson.scripts || {},
        runCommand: 'npm run dev',
        buildCommand: 'npm run build',
        testCommand: 'npm test'
      };
    } catch (e) {
      // Not a Node.js project
    }

    // Check for requirements.txt (Python)
    try {
      await access(path.join(rootPath, 'requirements.txt'));
      return {
        type: 'python',
        framework: 'Python',
        packageManager: 'pip',
        runCommand: 'python main.py',
        buildCommand: 'python -m build',
        testCommand: 'python -m pytest'
      };
    } catch (e) {
      // Not a Python project
    }

    // Check for Cargo.toml (Rust)
    try {
      await access(path.join(rootPath, 'Cargo.toml'));
      return {
        type: 'rust',
        framework: 'Rust',
        packageManager: 'cargo',
        runCommand: 'cargo run',
        buildCommand: 'cargo build',
        testCommand: 'cargo test'
      };
    } catch (e) {
      // Not a Rust project
    }

    // Default generic project
    return {
      type: 'generic',
      framework: 'Generic',
      packageManager: 'none',
      runCommand: null,
      buildCommand: null,
      testCommand: null
    };
  } catch (error) {
    console.error('[project] Detection failed:', error);
    return {
      type: 'generic',
      framework: 'Unknown',
      packageManager: 'none',
      runCommand: null,
      buildCommand: null,
      testCommand: null
    };
  }
}

// Check project health
async function checkProjectHealth(projectPath) {
  const health = {
    status: 'healthy',
    issues: [],
    warnings: [],
    checks: {
      dependencies: false,
      build: false,
      typescript: false,
      git: false
    }
  };

  try {
    const rootPath = path.join(__dirname, '..');
    
    // Check dependencies
    try {
      if (await access(path.join(rootPath, 'package.json'))) {
        health.checks.dependencies = true;
        // Try to check if node_modules exists
        try {
          await access(path.join(rootPath, 'node_modules'));
        } catch (e) {
          health.warnings.push('Dependencies not installed. Run: npm install');
          health.status = 'warning';
        }
      }
    } catch (e) {
      health.issues.push('No package.json found');
    }

    // Check git status
    try {
      await execAsync('git status', { cwd: rootPath });
      health.checks.git = true;
    } catch (e) {
      health.warnings.push('Not a git repository');
    }

    // Check TypeScript
    try {
      await access(path.join(rootPath, 'tsconfig.json'));
      health.checks.typescript = true;
    } catch (e) {
      // TypeScript not configured
    }

    // Basic build check
    try {
      const projectType = await detectProjectType(projectPath);
      if (projectType.buildCommand) {
        health.checks.build = true;
      }
    } catch (e) {
      health.issues.push('Build configuration not found');
    }

  } catch (error) {
    console.error('[project] Health check failed:', error);
    health.status = 'error';
    health.issues.push('Health check failed');
  }

  return health;
}

// GET /api/project/info - Get project information
router.get('/info', async (req, res) => {
  try {
    const projectPath = req.query.path || process.cwd();
    const projectInfo = await detectProjectType(projectPath);
    const health = await checkProjectHealth(projectPath);
    
    res.json({
      ...projectInfo,
      health,
      path: projectPath
    });
  } catch (error) {
    console.error('[project] Info failed:', error);
    res.status(500).json({ error: 'Failed to get project information' });
  }
});

// POST /api/project/run - Run project with detected command
router.post('/run', async (req, res) => {
  const { command } = req.body;
  
  if (!command) {
    return res.status(400).json({ error: 'Command is required' });
  }

  try {
    // Start the process in background
    const { spawn } = await import('child_process');
    const process = spawn(command.split(' ')[0], command.split(' ').slice(1), {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore'
    });

    process.unref();
    
    res.json({ 
      success: true, 
      message: 'Project started successfully',
      pid: process.pid
    });
  } catch (error) {
    console.error('[project] Run failed:', error);
    res.status(500).json({ error: error.message || 'Failed to run project' });
  }
});

// POST /api/project/fix - Attempt to fix common project issues
router.post('/fix', async (req, res) => {
  const { issues } = req.body;
  
  if (!issues || !Array.isArray(issues)) {
    return res.status(400).json({ error: 'Issues array is required' });
  }

  const fixes = [];
  
  try {
    for (const issue of issues) {
      if (issue.includes('Dependencies not installed')) {
        try {
          await execAsync('npm install', { cwd: process.cwd() });
          fixes.push({ issue, fixed: true, command: 'npm install' });
        } catch (error) {
          fixes.push({ issue, fixed: false, error: error.message });
        }
      }
      // Add more fix logic as needed
    }
    
    res.json({ 
      success: true, 
      fixes,
      message: `Fixed ${fixes.filter(f => f.fixed).length} out of ${fixes.length} issues`
    });
  } catch (error) {
    console.error('[project] Fix failed:', error);
    res.status(500).json({ error: error.message || 'Failed to fix issues' });
  }
});

export default router;