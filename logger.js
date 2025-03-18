const LOG_LEVELS = {
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
  DEBUG: "DEBUG",
};

function formatDate() {
  return new Date().toISOString();
}

function formatMessage(level, message, details = {}) {
  const timestamp = formatDate();
  const detailsStr =
    Object.keys(details).length > 0 ? JSON.stringify(details) : "";
  return `${timestamp} ${level.padEnd(5)} ${message}${
    detailsStr ? " " + detailsStr : ""
  }`;
}

const logger = {
  info: (message, details) => {
    console.log(formatMessage(LOG_LEVELS.INFO, message, details));
  },

  warn: (message, details) => {
    console.warn(formatMessage(LOG_LEVELS.WARN, message, details));
  },

  error: (message, details) => {
    console.error(formatMessage(LOG_LEVELS.ERROR, message, details));
  },

  debug: (message, details) => {
    if (process.env.DEBUG !== "false") {
      console.debug(formatMessage(LOG_LEVELS.DEBUG, message, details));
    }
  },
};

module.exports = logger;
