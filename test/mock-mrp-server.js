/**
 * Mock MRP Server
 *
 * A simple Node.js server implementing the MRMD Runtime Protocol for testing.
 * Run with: node test/mock-mrp-server.js
 *
 * Endpoints:
 *   GET  /mrp/v1/capabilities
 *   GET  /mrp/v1/sessions
 *   POST /mrp/v1/sessions
 *   POST /mrp/v1/execute
 *   POST /mrp/v1/execute/stream
 *   POST /mrp/v1/input
 *   POST /mrp/v1/interrupt
 *   POST /mrp/v1/complete
 *   POST /mrp/v1/inspect
 *   POST /mrp/v1/hover
 *   POST /mrp/v1/variables
 *   POST /mrp/v1/is_complete
 */

import http from 'http';

const PORT = process.env.PORT || 8000;

// ===========================================================================
// Session State
// ===========================================================================

const sessions = new Map();
sessions.set('default', {
  id: 'default',
  language: 'python',
  created: new Date().toISOString(),
  lastActivity: new Date().toISOString(),
  executionCount: 0,
  variableCount: 0,
  variables: {
    x: { name: 'x', type: 'int', value: '42', expandable: false },
    name: { name: 'name', type: 'str', value: '"Alice"', expandable: false },
    data: {
      name: 'data',
      type: 'list',
      value: '[1, 2, 3, 4, 5]',
      expandable: true,
      length: 5,
    },
    df: {
      name: 'df',
      type: 'DataFrame',
      value: '<1000 rows × 5 cols>',
      expandable: true,
      shape: [1000, 5],
      size: '45.2 KB',
    },
  },
});

// Pending input requests
const pendingInputs = new Map();

// Running executions (for interrupt)
const runningExecutions = new Map();

// ===========================================================================
// Capabilities
// ===========================================================================

const capabilities = {
  runtime: 'mock-python',
  version: '3.11.0',
  languages: ['python', 'py', 'python3'],
  features: {
    execute: true,
    executeStream: true,
    interrupt: true,
    complete: true,
    inspect: true,
    hover: true,
    variables: true,
    variableExpand: true,
    reset: true,
    isComplete: true,
    format: false,
    assets: false,
  },
  defaultSession: 'default',
  maxSessions: 10,
  environment: {
    cwd: '/home/user/project',
    executable: '/usr/bin/python3',
  },
};

// ===========================================================================
// Mock Completions
// ===========================================================================

const mockCompletions = {
  'df.': [
    { label: 'head', kind: 'method', detail: '(n=5) -> DataFrame', documentation: 'Return first n rows' },
    { label: 'tail', kind: 'method', detail: '(n=5) -> DataFrame', documentation: 'Return last n rows' },
    { label: 'describe', kind: 'method', detail: '() -> DataFrame', documentation: 'Generate descriptive statistics' },
    { label: 'columns', kind: 'property', detail: 'Index', valuePreview: "['a', 'b', 'c', 'd', 'e']" },
    { label: 'shape', kind: 'property', detail: 'tuple', valuePreview: '(1000, 5)' },
    { label: 'dtypes', kind: 'property', detail: 'Series' },
  ],
  'data.': [
    { label: 'append', kind: 'method', detail: '(item) -> None' },
    { label: 'pop', kind: 'method', detail: '(index=-1) -> item' },
    { label: 'sort', kind: 'method', detail: '(reverse=False) -> None' },
    { label: 'reverse', kind: 'method', detail: '() -> None' },
  ],
  'print': [
    { label: 'print', kind: 'function', detail: '(*args, **kwargs)', documentation: 'Print to stdout' },
  ],
  'import': [
    { label: 'import', kind: 'keyword' },
  ],
};

// ===========================================================================
// Mock Execution Patterns
// ===========================================================================

async function executeCode(code, session, onChunk, signal) {
  const sess = sessions.get(session) || sessions.get('default');
  sess.executionCount++;
  sess.lastActivity = new Date().toISOString();

  // Pattern: progress bar
  if (code.includes('tqdm') || code.includes('progress')) {
    return simulateProgressBar(onChunk, signal);
  }

  // Pattern: colored output
  if (code.includes('color') || code.includes('rich')) {
    return simulateColoredOutput(onChunk, signal);
  }

  // Pattern: input request
  if (code.includes('input(')) {
    return simulateInputRequest(code, session, onChunk, signal);
  }

  // Pattern: error
  if (code.includes('error') || code.includes('raise') || code.includes('1/0')) {
    return simulateError(onChunk, signal);
  }

  // Pattern: slow output
  if (code.includes('slow') || code.includes('sleep')) {
    return simulateSlowOutput(onChunk, signal);
  }

  // Pattern: multi-line progress (rich-style)
  if (code.includes('multi') || code.includes('download')) {
    return simulateMultiLineProgress(onChunk, signal);
  }

  // Default: simple eval-like response
  return simulateSimpleOutput(code, onChunk, signal);
}

async function simulateProgressBar(onChunk, signal) {
  const steps = [0, 10, 25, 40, 55, 70, 85, 100];

  for (const pct of steps) {
    if (signal?.aborted) throw new Error('Aborted');
    await sleep(200);

    const filled = Math.floor(pct / 10);
    const empty = 10 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const chunk = `\rProcessing: ${pct}%|${bar}| ${pct}/100`;
    onChunk(chunk);
  }

  onChunk('\n\x1b[32m✓ Complete!\x1b[0m\n');

  return {
    success: true,
    stdout: 'Processing: 100%|██████████| 100/100\n✓ Complete!\n',
    stderr: '',
    executionCount: sessions.get('default').executionCount,
  };
}

async function simulateColoredOutput(onChunk, signal) {
  const lines = [
    '\x1b[1m=== Status Report ===\x1b[0m\n',
    '\x1b[32m✓\x1b[0m Tests passed: 42\n',
    '\x1b[31m✗\x1b[0m Tests failed: 3\n',
    '\x1b[33m⚠\x1b[0m Warnings: 7\n',
    '\x1b[34mℹ\x1b[0m Info: Running on Python 3.11\n',
    '\n',
    '\x1b[1;4mDetailed Results:\x1b[0m\n',
    '  \x1b[38;5;208mOrange (256-color)\x1b[0m\n',
    '  \x1b[38;2;255;100;150mPink (RGB)\x1b[0m\n',
  ];

  for (const line of lines) {
    if (signal?.aborted) throw new Error('Aborted');
    await sleep(100);
    onChunk(line);
  }

  return {
    success: true,
    stdout: lines.join(''),
    stderr: '',
  };
}

async function simulateInputRequest(code, session, onChunk, signal) {
  // Extract prompt from input() call
  const match = code.match(/input\s*\(\s*["']([^"']*)["']\s*\)/);
  const prompt = match ? match[1] : 'Enter value: ';

  onChunk(prompt);

  // Create a promise that resolves when input is received
  const execId = `exec-${Date.now()}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingInputs.delete(execId);
      reject(new Error('Input timeout'));
    }, 60000);

    pendingInputs.set(execId, {
      resolve: (text) => {
        clearTimeout(timeout);
        pendingInputs.delete(execId);

        // Echo the input
        onChunk(text);
        onChunk(`\nYou entered: ${text.trim()}\n`);

        resolve({
          success: true,
          stdout: `${prompt}${text}You entered: ${text.trim()}\n`,
          stderr: '',
        });
      },
      reject,
      prompt,
      password: prompt.toLowerCase().includes('password'),
    });

    // Send stdin_request event
    onChunk(null, {
      event: 'stdin_request',
      data: { prompt: '', password: false, execId },
    });
  });
}

async function simulateError(onChunk, signal) {
  onChunk('Traceback (most recent call last):\n');
  await sleep(50);
  onChunk('  File "<stdin>", line 1, in <module>\n');
  await sleep(50);
  onChunk('\x1b[31mZeroDivisionError: division by zero\x1b[0m\n');

  return {
    success: false,
    stdout: '',
    stderr: 'ZeroDivisionError: division by zero',
    error: {
      type: 'ZeroDivisionError',
      message: 'division by zero',
      traceback: [
        'Traceback (most recent call last):',
        '  File "<stdin>", line 1, in <module>',
        'ZeroDivisionError: division by zero',
      ],
      line: 1,
    },
  };
}

async function simulateSlowOutput(onChunk, signal) {
  const words = ['This', 'is', 'a', 'slow', 'streaming', 'response...'];

  for (const word of words) {
    if (signal?.aborted) throw new Error('Aborted');
    await sleep(300);
    onChunk(word + ' ');
  }
  onChunk('\n');

  return {
    success: true,
    stdout: words.join(' ') + ' \n',
    stderr: '',
  };
}

async function simulateMultiLineProgress(onChunk, signal) {
  // Simulate rich-style multi-line progress
  const files = ['file1.txt', 'file2.txt', 'file3.txt'];

  onChunk('\x1b[1mDownloading files...\x1b[0m\n\n');

  for (let i = 0; i < files.length; i++) {
    for (let pct = 0; pct <= 100; pct += 20) {
      if (signal?.aborted) throw new Error('Aborted');
      await sleep(100);

      // Move cursor up to overwrite previous lines
      if (pct > 0) {
        onChunk(`\x1b[${files.length}A`);
      }

      for (let j = 0; j < files.length; j++) {
        const filePct = j < i ? 100 : (j === i ? pct : 0);
        const status = filePct === 100 ? '\x1b[32m✓\x1b[0m' : (filePct > 0 ? '\x1b[33m⋯\x1b[0m' : ' ');
        const bar = '█'.repeat(Math.floor(filePct / 20)) + '░'.repeat(5 - Math.floor(filePct / 20));
        onChunk(`${status} ${files[j]}: ${bar} ${filePct}%\x1b[K\n`);
      }
    }
  }

  onChunk('\n\x1b[32mAll downloads complete!\x1b[0m\n');

  return {
    success: true,
    stdout: 'All downloads complete!\n',
    stderr: '',
  };
}

async function simulateSimpleOutput(code, onChunk, signal) {
  // Simple mock "execution"
  let result;

  try {
    // Try to evaluate simple expressions
    if (code.match(/^\d+\s*[+\-*/]\s*\d+$/)) {
      result = eval(code);
    } else if (code.match(/^['"].*['"]$/)) {
      result = eval(code);
    } else if (code.startsWith('print(')) {
      const match = code.match(/print\s*\(\s*(.+)\s*\)/);
      if (match) {
        result = eval(match[1]);
      }
    } else {
      result = `Executed: ${code.split('\n')[0]}...`;
    }
  } catch {
    result = `Mock output for: ${code.substring(0, 50)}`;
  }

  const output = String(result) + '\n';
  onChunk(output);

  return {
    success: true,
    stdout: output,
    stderr: '',
    result: String(result),
  };
}

// ===========================================================================
// HTTP Server
// ===========================================================================

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function sendSSE(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  console.log(`${method} ${path}`);

  try {
    // GET /mrp/v1/capabilities
    if (method === 'GET' && path === '/mrp/v1/capabilities') {
      sendJson(res, capabilities);
      return;
    }

    // GET /mrp/v1/sessions
    if (method === 'GET' && path === '/mrp/v1/sessions') {
      const sessionList = Array.from(sessions.values()).map(s => ({
        id: s.id,
        language: s.language,
        created: s.created,
        lastActivity: s.lastActivity,
        executionCount: s.executionCount,
        variableCount: Object.keys(s.variables).length,
      }));
      sendJson(res, { sessions: sessionList });
      return;
    }

    // POST /mrp/v1/sessions
    if (method === 'POST' && path === '/mrp/v1/sessions') {
      const body = await parseBody(req);
      const id = body.id || `session-${Date.now()}`;
      const session = {
        id,
        language: body.language || 'python',
        created: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        executionCount: 0,
        variableCount: 0,
        variables: {},
      };
      sessions.set(id, session);
      sendJson(res, session);
      return;
    }

    // POST /mrp/v1/execute
    if (method === 'POST' && path === '/mrp/v1/execute') {
      const body = await parseBody(req);
      let output = '';
      const result = await executeCode(
        body.code,
        body.session || 'default',
        (chunk) => { if (chunk) output += chunk; },
        null
      );
      sendJson(res, { ...result, stdout: output });
      return;
    }

    // POST /mrp/v1/execute/stream
    if (method === 'POST' && path === '/mrp/v1/execute/stream') {
      const body = await parseBody(req);

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      const execId = body.execId || `exec-${Date.now()}`;
      const abortController = new AbortController();
      runningExecutions.set(execId, abortController);

      sendSSE(res, 'start', { execId, timestamp: new Date().toISOString() });

      let accumulated = '';

      try {
        const result = await executeCode(
          body.code,
          body.session || 'default',
          (chunk, special) => {
            if (special) {
              // Special event (like stdin_request)
              sendSSE(res, special.event, special.data);
            } else if (chunk) {
              accumulated += chunk;
              sendSSE(res, 'stdout', { content: chunk, accumulated });
            }
          },
          abortController.signal
        );

        sendSSE(res, 'result', result);
      } catch (err) {
        if (err.message === 'Aborted') {
          sendSSE(res, 'error', { type: 'Interrupted', message: 'Execution interrupted' });
        } else {
          sendSSE(res, 'error', { type: 'Error', message: err.message });
        }
      } finally {
        runningExecutions.delete(execId);
        sendSSE(res, 'done', {});
        res.end();
      }
      return;
    }

    // POST /mrp/v1/input
    if (method === 'POST' && path === '/mrp/v1/input') {
      const body = await parseBody(req);
      const pending = pendingInputs.get(body.exec_id);

      if (pending) {
        pending.resolve(body.text);
        sendJson(res, { accepted: true });
      } else {
        sendJson(res, { accepted: false, error: 'No pending input request' }, 400);
      }
      return;
    }

    // POST /mrp/v1/interrupt
    if (method === 'POST' && path === '/mrp/v1/interrupt') {
      const body = await parseBody(req);
      let interrupted = false;

      for (const [execId, controller] of runningExecutions) {
        controller.abort();
        interrupted = true;
      }

      sendJson(res, { interrupted });
      return;
    }

    // POST /mrp/v1/complete
    if (method === 'POST' && path === '/mrp/v1/complete') {
      const body = await parseBody(req);
      const { code, cursor } = body;

      // Find what's being completed
      const beforeCursor = code.substring(0, cursor);
      const match = beforeCursor.match(/(\w+\.?)$/);
      const prefix = match ? match[1] : '';

      let matches = [];
      let cursorStart = cursor - prefix.length;

      // Check mock completions
      for (const [pattern, completions] of Object.entries(mockCompletions)) {
        if (prefix.startsWith(pattern) || pattern.startsWith(prefix)) {
          matches = completions.filter(c =>
            c.label.toLowerCase().startsWith(prefix.replace(/\w+\./, '').toLowerCase())
          );
          if (prefix.includes('.')) {
            cursorStart = cursor - prefix.split('.').pop().length;
          }
          break;
        }
      }

      sendJson(res, {
        matches,
        cursorStart,
        cursorEnd: cursor,
        source: 'runtime',
      });
      return;
    }

    // POST /mrp/v1/inspect
    if (method === 'POST' && path === '/mrp/v1/inspect') {
      const body = await parseBody(req);
      const { code, cursor } = body;

      // Simple symbol extraction
      const beforeCursor = code.substring(0, cursor);
      const match = beforeCursor.match(/(\w+)$/);
      const symbol = match ? match[1] : '';

      const sess = sessions.get(body.session || 'default');
      const variable = sess?.variables[symbol];

      if (variable) {
        sendJson(res, {
          found: true,
          source: 'runtime',
          name: variable.name,
          kind: 'variable',
          type: variable.type,
          value: variable.value,
          docstring: `Mock variable ${variable.name} of type ${variable.type}`,
        });
      } else if (symbol === 'print') {
        sendJson(res, {
          found: true,
          source: 'runtime',
          name: 'print',
          kind: 'function',
          type: 'builtin_function_or_method',
          signature: '(*args, sep=" ", end="\\n", file=None, flush=False)',
          docstring: 'Prints the values to a stream, or to sys.stdout by default.',
        });
      } else {
        sendJson(res, { found: false, source: 'runtime' });
      }
      return;
    }

    // POST /mrp/v1/hover
    if (method === 'POST' && path === '/mrp/v1/hover') {
      const body = await parseBody(req);
      const { code, cursor } = body;

      const beforeCursor = code.substring(0, cursor);
      const match = beforeCursor.match(/(\w+)$/);
      const symbol = match ? match[1] : '';

      const sess = sessions.get(body.session || 'default');
      const variable = sess?.variables[symbol];

      if (variable) {
        sendJson(res, {
          found: true,
          name: variable.name,
          type: variable.type,
          value: variable.value,
        });
      } else {
        sendJson(res, { found: false });
      }
      return;
    }

    // POST /mrp/v1/variables
    if (method === 'POST' && path === '/mrp/v1/variables') {
      const body = await parseBody(req);
      const sess = sessions.get(body.session || 'default');

      sendJson(res, {
        variables: Object.values(sess?.variables || {}),
        count: Object.keys(sess?.variables || {}).length,
        truncated: false,
      });
      return;
    }

    // POST /mrp/v1/variables/:name
    const varMatch = path.match(/^\/mrp\/v1\/variables\/(\w+)$/);
    if (method === 'POST' && varMatch) {
      const varName = varMatch[1];
      const body = await parseBody(req);
      const sess = sessions.get(body.session || 'default');
      const variable = sess?.variables[varName];

      if (variable) {
        const detail = { ...variable };

        if (variable.expandable) {
          if (variable.type === 'list') {
            detail.children = [
              { name: '0', type: 'int', value: '1', expandable: false },
              { name: '1', type: 'int', value: '2', expandable: false },
              { name: '2', type: 'int', value: '3', expandable: false },
              { name: '3', type: 'int', value: '4', expandable: false },
              { name: '4', type: 'int', value: '5', expandable: false },
            ];
          } else if (variable.type === 'DataFrame') {
            detail.children = [
              { name: 'columns', type: 'Index', value: "['a', 'b', 'c', 'd', 'e']", expandable: true },
              { name: 'index', type: 'RangeIndex', value: 'RangeIndex(0, 1000, 1)', expandable: false },
              { name: 'dtypes', type: 'Series', value: '...', expandable: true },
            ];
          }
        }

        sendJson(res, detail);
      } else {
        sendJson(res, { error: 'Variable not found' }, 404);
      }
      return;
    }

    // POST /mrp/v1/is_complete
    if (method === 'POST' && path === '/mrp/v1/is_complete') {
      const body = await parseBody(req);
      const { code } = body;

      // Simple heuristics
      let status = 'complete';
      let indent = '';

      if (code.endsWith(':')) {
        status = 'incomplete';
        indent = '    ';
      } else if (code.includes('(') && !code.includes(')')) {
        status = 'incomplete';
      } else if (code.includes('[') && !code.includes(']')) {
        status = 'incomplete';
      } else if (code.includes('{') && !code.includes('}')) {
        status = 'incomplete';
      } else if (code.trim().endsWith('\\')) {
        status = 'incomplete';
      }

      sendJson(res, { status, indent });
      return;
    }

    // POST /mrp/v1/sessions/:id/reset
    const resetMatch = path.match(/^\/mrp\/v1\/sessions\/(\w+)\/reset$/);
    if (method === 'POST' && resetMatch) {
      const sessionId = resetMatch[1];
      const sess = sessions.get(sessionId);
      if (sess) {
        sess.variables = {};
        sess.variableCount = 0;
        sess.lastActivity = new Date().toISOString();
        sendJson(res, { success: true });
      } else {
        sendJson(res, { error: 'Session not found' }, 404);
      }
      return;
    }

    // 404
    sendJson(res, { error: 'Not found' }, 404);

  } catch (err) {
    console.error('Error:', err);
    sendJson(res, { error: err.message }, 500);
  }
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    Mock MRP Server                            ║
╠═══════════════════════════════════════════════════════════════╣
║  Running on: http://localhost:${PORT}/mrp/v1                     ║
║                                                               ║
║  Test patterns in code:                                       ║
║    "progress"  → Progress bar simulation                      ║
║    "color"     → Colored output with ANSI codes               ║
║    "input("    → Input request simulation                     ║
║    "error"     → Error simulation                             ║
║    "slow"      → Slow streaming output                        ║
║    "download"  → Multi-line progress (rich-style)             ║
║                                                               ║
║  Endpoints:                                                   ║
║    GET  /mrp/v1/capabilities                                  ║
║    GET  /mrp/v1/sessions                                      ║
║    POST /mrp/v1/execute                                       ║
║    POST /mrp/v1/execute/stream                                ║
║    POST /mrp/v1/complete                                      ║
║    POST /mrp/v1/inspect                                       ║
║    POST /mrp/v1/hover                                         ║
║    POST /mrp/v1/variables                                     ║
║    POST /mrp/v1/input                                         ║
║    POST /mrp/v1/interrupt                                     ║
║                                                               ║
║  Press Ctrl+C to stop                                         ║
╚═══════════════════════════════════════════════════════════════╝
`);
});
