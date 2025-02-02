const { AkaveError } = require('../errors/customErrors');

function errorHandler(err, req, res, next) {
  const requestId = req.requestId || 'UNKNOWN';
  const logger = req.app.get('logger'); 


  if (err instanceof AkaveError) {
    logger.error(requestId, `${err.name}: ${err.message}`, err.details);
    return res.status(getHttpStatusCode(err.code)).json(err.toJSON());
  }

  // Handle multer errors
  if (err.name === 'MulterError') {
    logger.error(requestId, 'File Upload Error', { error: err });
    return res.status(400).json({
      error: {
        name: 'FileUploadError',
        message: getMulterErrorMessage(err),
        code: 'FILE_UPLOAD_ERROR',
        details: { field: err.field }
      }
    });
  }

  // Default error handling
  logger.error(requestId, 'Unhandled Error', { error: err });
  res.status(500).json({
    error: {
      name: 'InternalServerError',
      message: 'An unexpected error occurred',
      code: 'INTERNAL_SERVER_ERROR'
    }
  });
}

function getHttpStatusCode(errorCode) {
  const statusCodes = {
    'VALIDATION_ERROR': 400,
    'BUCKET_OPERATION_ERROR': 400,
    'FILE_OPERATION_ERROR': 400,
    'TRANSACTION_ERROR': 400,
    'NETWORK_ERROR': 503,
    'INTERNAL_SERVER_ERROR': 500
  };
  return statusCodes[errorCode] || 500;
}

function getMulterErrorMessage(err) {
  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      return 'File size exceeds the limit of 50MB';
    case 'LIMIT_FILE_COUNT':
      return 'Too many files uploaded';
    default:
      return 'File upload error occurred';
  }
}

module.exports = errorHandler;