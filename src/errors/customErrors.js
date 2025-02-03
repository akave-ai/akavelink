class AkaveError extends Error {
    constructor(message, code, details = {}) {
      super(message);
      this.name = this.constructor.name;
      this.code = code;
      this.details = details;
      Error.captureStackTrace(this, this.constructor);
    }
  
    toJSON() {
      return {
        error: {
          name: this.name,
          message: this.message,
          code: this.code,
          details: this.details
        }
      };
    }
  }
  
  class ValidationError extends AkaveError {
    constructor(message, details = {}) {
      super(message, 'VALIDATION_ERROR', details);
    }
  }
  
  class BucketOperationError extends AkaveError {
    constructor(message, details = {}) {
      super(message, 'BUCKET_OPERATION_ERROR', details);
    }
  }
  
  class FileOperationError extends AkaveError {
    constructor(message, details = {}) {
      super(message, 'FILE_OPERATION_ERROR', details);
    }
  }
  
  class TransactionError extends AkaveError {
    constructor(message, details = {}) {
      super(message, 'TRANSACTION_ERROR', details);
    }
  }
  
  class NetworkError extends AkaveError {
    constructor(message, details = {}) {
      super(message, 'NETWORK_ERROR', details);
    }
  }
  
  module.exports = {
    AkaveError,
    ValidationError,
    BucketOperationError,
    FileOperationError,
    TransactionError,
    NetworkError
  };