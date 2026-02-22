// TODO: Implement logger (will wrap pino later)

export interface Logger {
  debug: (msg: string, ...args: unknown[]) => void;
  info: (msg: string, ...args: unknown[]) => void;
  warn: (msg: string, ...args: unknown[]) => void;
  error: (msg: string, ...args: unknown[]) => void;
}

export function createLogger(_name: string): Logger {
  return {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
}
