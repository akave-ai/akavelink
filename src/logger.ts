interface LogLevel {
  level: string
  color: string
}

const levels: Record<string, LogLevel> = {
  error: { level: "ERROR", color: "\x1b[31m" }, // Red
  warn: { level: "WARN", color: "\x1b[33m" }, // Yellow
  info: { level: "INFO", color: "\x1b[36m" }, // Cyan
  debug: { level: "DEBUG", color: "\x1b[35m" }, // Magenta
}

const resetColor = "\x1b[0m"

function formatMessage(
  level: string,
  message: string,
  meta?: Record<string, any>
): string {
  const timestamp = new Date().toISOString()
  const levelInfo = levels[level] || {
    level: level.toUpperCase(),
    color: resetColor,
  }
  let logMessage = `${timestamp} ${levelInfo.color}${levelInfo.level}${resetColor}: ${message}`

  if (meta) {
    logMessage += `\n${JSON.stringify(meta, null, 2)}`
  }

  return logMessage
}

const logger = {
  error(message: string, meta?: Record<string, any>): void {
    console.error(formatMessage("error", message, meta))
  },

  warn(message: string, meta?: Record<string, any>): void {
    console.warn(formatMessage("warn", message, meta))
  },

  info(message: string, meta?: Record<string, any>): void {
    console.info(formatMessage("info", message, meta))
  },

  debug(message: string, meta?: Record<string, any>): void {
    console.debug(formatMessage("debug", message, meta))
  },
}

export default logger
