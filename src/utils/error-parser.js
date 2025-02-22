const { ErrorMessages, ErrorHttpStatus, HttpStatus } = require('./error-codes');

const parseSDKError = (error) => {
    // Extract error code from SDK error message
    const codeMatch = error.message.match(/0x[a-fA-F0-9]{8}/);
    if (codeMatch) {
        const errorCode = codeMatch[0];
        return {
            code: errorCode,
            message: ErrorMessages[errorCode] || error.message,
            status: ErrorHttpStatus[errorCode] || HttpStatus.INTERNAL_SERVER_ERROR,
            details: error.message
        };
    }

    // Handle non-SDK errors or errors without codes
    return {
        code: 'UNKNOWN_ERROR',
        message: error.message,
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        details: error.stack
    };
};

module.exports = { parseSDKError };