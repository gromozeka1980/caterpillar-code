// Pyodide integration — lazy-load and evaluate Python boolean expressions

declare global {
  interface Window {
    loadPyodide: (config?: { indexURL?: string }) => Promise<PyodideInterface>;
  }
}

interface PyodideInterface {
  runPythonAsync(code: string): Promise<unknown>;
  globals: { get(name: string): unknown };
}

let pyodide: PyodideInterface | null = null;
let loading = false;
let loadPromise: Promise<PyodideInterface> | null = null;

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.27.5/full/';

function ensureScript(): Promise<void> {
  if (typeof window.loadPyodide === 'function') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PYODIDE_CDN + 'pyodide.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Pyodide script'));
    document.head.appendChild(script);
  });
}

export async function getPyodide(): Promise<PyodideInterface> {
  if (pyodide) return pyodide;
  if (loadPromise) return loadPromise;

  loading = true;
  loadPromise = (async () => {
    await ensureScript();
    pyodide = await window.loadPyodide({ indexURL: PYODIDE_CDN });
    loading = false;
    return pyodide;
  })();

  return loadPromise;
}

export function isPyodideLoading(): boolean {
  return loading;
}

export function isPyodideReady(): boolean {
  return pyodide !== null;
}

export interface EvalResult {
  /** True/False/null for each caterpillar (null = exception) */
  results: (boolean | null)[];
  /** Index of first caterpillar that threw an exception, or -1 */
  firstErrorIndex: number;
  /** Total number of caterpillars that threw */
  errorCount: number;
  /** Short error message from the first exception, e.g. "NameError: name 'x' is not defined" */
  errorMessage: string | null;
}

/**
 * Evaluate a Python boolean expression on all caterpillars.
 *
 * Variables available in the expression:
 *   c — color list, e.g. [0, 1, 1, 2, 3]
 *   f — frequency dict with all 4 keys, e.g. {0: 1, 1: 2, 2: 1, 3: 1}
 *   s — run-length segments as list of tuples, e.g. [(0, 1), (1, 2), (2, 1), (3, 1)]
 */
export async function evaluateExpression(
  expr: string,
  allSeqs: number[][],
): Promise<EvalResult> {
  const py = await getPyodide();

  const seqsJson = JSON.stringify(allSeqs);

  // Escape the expression for safe embedding in a Python string
  const escaped = expr.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  const code = `
import json

ALL = json.loads('''${seqsJson}''')
_expr = compile('${escaped}', '<expr>', 'eval')

_results = []
_first_err_idx = -1
_err_count = 0
_err_msg = None
for _i, c in enumerate(ALL):
    f = {0: 0, 1: 0, 2: 0, 3: 0}
    for x in c:
        f[x] += 1
    s = []
    _prev = None
    for x in c:
        if x == _prev:
            s[-1] = (s[-1][0], s[-1][1] + 1)
        else:
            s.append((x, 1))
        _prev = x
    try:
        _results.append(bool(eval(_expr)))
    except Exception as _e:
        _results.append(None)
        _err_count += 1
        if _first_err_idx < 0:
            _first_err_idx = _i
            _err_msg = type(_e).__name__ + ': ' + str(_e)

[_results, _first_err_idx, _err_count, _err_msg]
`;

  const result = await py.runPythonAsync(code);

  const pyList = result as { toJs(): unknown[] };
  let arr: unknown[];
  if (typeof pyList.toJs === 'function') {
    arr = pyList.toJs() as unknown[];
  } else {
    const globals = py.globals.get('_results') as { toJs(): unknown[] };
    arr = [globals.toJs(), -1, 0, null];
  }

  const rawResults = Array.from(arr[0] as Iterable<unknown>);
  return {
    results: rawResults.map(v => v === null ? null : Boolean(v)),
    firstErrorIndex: arr[1] as number,
    errorCount: arr[2] as number,
    errorMessage: arr[3] as string | null,
  };
}
