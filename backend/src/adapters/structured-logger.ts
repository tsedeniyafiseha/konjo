import type { Clock, OperationalLogger } from '../application/ports.ts';

export type OperationalLogLevel = 'info' | 'error' | 'silent';

interface StructuredLoggerConfig {
  level: OperationalLogLevel;
  clock: Clock;
  write?: (level: Exclude<OperationalLogLevel, 'silent'>, line: string) => void;
}

export function createStructuredLogger(config: StructuredLoggerConfig): OperationalLogger {
  const write = config.write ?? ((level, line) => {
    const stream = level === 'error' ? process.stderr : process.stdout;
    stream.write(`${line}\n`);
  });

  function emit(
    level: Exclude<OperationalLogLevel, 'silent'>,
    event: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    if (config.level === 'silent' || (config.level === 'error' && level === 'info')) return;
    write(level, JSON.stringify({
      timestamp: config.clock.now().toISOString(),
      level,
      event,
      ...(details ? { details } : {}),
    }));
  }

  return {
    info: (event, details) => emit('info', event, details),
    error: (event, details) => emit('error', event, details),
  };
}
