type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

const LOG_LEVELS: Record<LogLevel, LogLevel> = {
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
  DEBUG: "DEBUG",
};

function formatDate(): string {
  return new Date().toISOString();
}

function formatMessage(
  level: LogLevel,
  message: string,
  details: Record<string, unknown> = {}
): string {
  const timestamp = formatDate();
  const detailsStr =
    Object.keys(details).length > 0 ? JSON.stringify(details) : "";
  return `${timestamp} ${level.padEnd(5)} ${message}${
    detailsStr ? " " + detailsStr : ""
  }`;
}

const logger = {
  info(message: string, details: Record<string, unknown> = {}): void {
    console.log(formatMessage(LOG_LEVELS.INFO, message, details));
  },

  warn(message: string, details: Record<string, unknown> = {}): void {
    console.warn(formatMessage(LOG_LEVELS.WARN, message, details));
  },

  error(message: string, details: Record<string, unknown> = {}): void {
    console.error(formatMessage(LOG_LEVELS.ERROR, message, details));
  },

  debug(message: string, details: Record<string, unknown> = {}): void {
    if (process.env.DEBUG !== "false") {
      console.debug(formatMessage(LOG_LEVELS.DEBUG, message, details));
    }
  },
};

export default logger;
