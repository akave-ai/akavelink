const { parseSDKError } = require('../utils/error-parser');
const { HttpStatus, SDKErrors, ErrorMessages, ErrorHttpStatus } = require('../utils/error-codes');

const errorHandler = (err, req, res, next) => {
    // If error is already an AkaveError
    if (err.name === 'AkaveError') {
        console.log('AkaveError::: ', err.code, err);
        return res.status(err.status).json({
            success: false,
            error: {
                code: err.code,
                message: err.message,
                details: err.details
            }
        });
    }

    // Handling validation errors
    if (err.type === 'validation') {
        return res.status(HttpStatus.BAD_REQUEST).json({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: err.message,
                details: err.details
            }
        });
    }

    // Handling SDK errors
    if (err.message && err.message.includes('sdk:')) {
        const { code, message, details } = parseSDKError(err);
        const status = ErrorHttpStatus[code] || HttpStatus.INTERNAL_SERVER_ERROR;

        return res.status(status).json({
            success: false,
            error: {
                code,
                message,
                details
            }
        });
    }

    // Add FILE_FULLY_UPLOADED to ErrorHttpStatus in error-codes.js
    if (err.message && err.message.includes('FileFullyUploaded')) {
        console.log('FileFullyUploaded::: ', err.message);
        return res.status(ErrorHttpStatus[SDKErrors.FILE_FULLY_UPLOADED]).json({
            success: false,
            error: {
                code: SDKErrors.FILE_FULLY_UPLOADED,
                message: ErrorMessages[SDKErrors.FILE_FULLY_UPLOADED]
            }
        });
    }

    // System errors (like ENOENT)
    if (err.code === 'ENOENT') {
        return res.status(ErrorHttpStatus['SYSTEM_ERROR']).json({
            success: false,
            error: {
                code: 'SYSTEM_ERROR',
                message: 'Internal system error',
                details: err.message
            }
        });
    }

    // Default error handler
    return res.status(ErrorHttpStatus['UNKNOWN_ERROR']).json({
        success: false,
        error: {
            code: 'UNKNOWN_ERROR',
            message: err.message || 'An unexpected error occurred'
        }
    });
};

module.exports = { errorHandler };