export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

const SECRET_KEY = /(private[_-]?key|password|secret|authorization|cookie|api[_-]?key|access[_-]?token|bearer|rpc[_-]?url|rpcurl|token$)/i;
const ENV_SECRET = /\b(?:ORACLE_PRIVATE_KEY|SUBMITTER_PRIVATE_KEY|DEPLOYER_PRIVATE_KEY|BIRTH_PRIVATE_KEY|PRIVATE_KEY|PASSWORD|SECRET|API_KEY|ACCESS_TOKEN|AUTHORIZATION|COOKIE|TOKEN)\s*=\s*([^\s,;]+)/gi;
const INLINE_SECRET = /\b(?:api[_-]?key|access[_-]?token|authorization|bearer|password|secret|token)\s*[:=]\s*([^\s,;]+)/gi;

function redactString(value: string): string {
  let redacted = value.replace(ENV_SECRET, (match) => {
    const separator = match.indexOf("=");
    return `${match.slice(0, separator + 1)}[REDACTED]`;
  });
  redacted = redacted.replace(INLINE_SECRET, (match) => {
    const separator = Math.max(match.indexOf("="), match.indexOf(":"));
    if (separator < 0) return "[REDACTED]";
    return `${match.slice(0, separator + 1)}[REDACTED]`;
  });
  return redacted;
}

export function redactLogValue(value: unknown, key?: string): unknown {
  if (key !== undefined && SECRET_KEY.test(key)) return "[REDACTED]";
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
    };
  }
  if (Array.isArray(value)) return value.map((item) => redactLogValue(item));
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
      result[entryKey] = redactLogValue(entryValue, entryKey);
    }
    return result;
  }
  return String(value);
}

export function errorLogFields(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: redactString(error.message),
    };
  }
  return { errorMessage: redactLogValue(String(error)) };
}

export const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

export class JsonLogger implements Logger {
  readonly #write: (line: string) => void;
  readonly #now: () => Date;

  constructor(
    write: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
    now: () => Date = () => new Date(),
  ) {
    this.#write = write;
    this.#now = now;
  }

  debug(event: string, fields?: LogFields): void { this.#emit("debug", event, fields); }
  info(event: string, fields?: LogFields): void { this.#emit("info", event, fields); }
  warn(event: string, fields?: LogFields): void { this.#emit("warn", event, fields); }
  error(event: string, fields?: LogFields): void { this.#emit("error", event, fields); }

  #emit(level: LogLevel, event: string, fields?: LogFields): void {
    const record: Record<string, unknown> = {
      timestamp: this.#now().toISOString(),
      level,
      event,
    };
    if (fields !== undefined) record.fields = redactLogValue(fields);
    this.#write(JSON.stringify(record));
  }
}
