import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const router = Router();
const execAsync = promisify(exec);

// POST /api/terminal - Execute terminal commands
router.post('/', async (req, res) => {
  const { command, projectPath } = req.body;
  
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'Command is required' });
  }

  try {
    // Basic security check - prevent dangerous commands
    const dangerousCommands = ['rm -rf', 'del /', 'format', 'shutdown', 'reboot'];
    if (dangerousCommands.some(dangerous => command.toLowerCase().includes(dangerous))) {
      return res.status(403).json({ error: 'Dangerous command not allowed' });
    }

    // Execute the command
    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(), // Execute from current working directory
      timeout: 30000, // 30 second timeout
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });

    const output = stdout || stderr;
    return res.json({ 
      success: true, 
      output: output || 'Command executed successfully',
      stderr: stderr || null
    });
  } catch (error) {
    console.error('[terminal] Command execution failed:', error);
    return res.status(500).json({ 
      error: error.message || 'Command execution failed',
      output: error.stdout || '',
      stderr: error.stderr || ''
    });
  }
});

export default router;