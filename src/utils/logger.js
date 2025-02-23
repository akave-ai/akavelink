const winston = require('winston');
const path = require('path');

const levels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};

const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    debug: 'blue',
};

// Create logger
const logger = winston.createLogger({
    levels,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        // Console logging
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            ),
        }),
        // File logging - errors
        new winston.transports.File({
            filename: path.join('logs', 'error.log'),
            level: 'error',
        }),
        // File logging - all levels
        new winston.transports.File({
            filename: path.join('logs', 'combined.log'),
        }),
    ],
});

winston.addColors(colors);

const logError = (requestId, message, error) => {
    logger.error({
        requestId,
        message,
        error: {
            name: error.name,
            code: error.code,
            message: error.message,
            stack: error.stack,
            details: error.details,
        },
        timestamp: new Date().toISOString(),
    });
};

const logInfo = (requestId, message, data = {}) => {
    logger.info({
        requestId,
        message,
        data,
        timestamp: new Date().toISOString(),
    });
};

const logWarning = (requestId, message, data = {}) => {
    logger.warn({
        requestId,
        message,
        data,
        timestamp: new Date().toISOString(),
    });
};

const logDebug = (requestId, message, data = {}) => {
    logger.debug({
        requestId,
        message,
        data,
        timestamp: new Date().toISOString(),
    });
};

module.exports = {
    logError,
    logInfo,
    logWarning,
    logDebug,
}; 