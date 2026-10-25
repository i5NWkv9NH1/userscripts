type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'debug';

const LEVEL_COLORS: Record<LogLevel, string> = {
  info: '#6366f1',
  success: '#10b981',
  warn: '#f59e0b',
  error: '#ef4444',
  debug: '#8b5cf6',
};

const hostConsole: Console = globalThis.console;

const rawLog = Function.prototype.bind.call(hostConsole.log, hostConsole);
const rawWarn = Function.prototype.bind.call(hostConsole.warn, hostConsole);
const rawError = Function.prototype.bind.call(hostConsole.error, hostConsole);

export class SoraLogger {
  readonly #scope: string;

  constructor(scope: string) {
    this.#scope = scope;
  }

  #print(level: LogLevel, args: unknown[]): void {
    const color = LEVEL_COLORS[level];
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const badgeLeft =
      'background:#18181b;color:#f4f4f5;padding:2px 6px;border-radius:4px 0 0 4px;font-weight:600;font-size:11px;';
    const badgeRight = `background:${color};color:#ffffff;padding:2px 6px;border-radius:0 4px 4px 0;font-weight:600;font-size:11px;`;
    const timeStyle = 'color:#71717a;font-size:11px;margin-left:4px;';

    const printer = level === 'error' ? rawError : level === 'warn' ? rawWarn : rawLog;

    printer(`%cSora%c${this.#scope}%c ${time}`, badgeLeft, badgeRight, timeStyle, ...args);
  }

  info(...args: unknown[]): void {
    this.#print('info', args);
  }

  success(...args: unknown[]): void {
    this.#print('success', args);
  }

  warn(...args: unknown[]): void {
    this.#print('warn', args);
  }

  error(...args: unknown[]): void {
    this.#print('error', args);
  }

  debug(...args: unknown[]): void {
    this.#print('debug', args);
  }

  time(label: string): () => void {
    const start = performance.now();
    return () => {
      const cost = (performance.now() - start).toFixed(2);
      this.debug(`${label} 耗时 ${cost}ms`);
    };
  }
}

export function createLogger(scope: string): SoraLogger {
  return new SoraLogger(scope);
}
