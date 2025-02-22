const { HttpStatus, SDKErrors, ErrorMessages } = require("../utils/error-codes");

const validateBucketName = (req, res, next) => {
    const { bucketName } = req.body;

    if (!bucketName || typeof bucketName !== 'string' || bucketName.trim().length === 0) {
        return res.sendError({
            code: SDKErrors.BUCKET_INVALID,
            message: ErrorMessages[SDKErrors.BUCKET_INVALID],
            status: HttpStatus.BAD_REQUEST,
            details: { field: 'bucketName', type: 'required' }
        });
    };
    
    next();
};

const validateFileUpload = (req, res, next) => {
    if (!req.files && !req.body.filePath) {
        return res.sendError({
            code: SDKErrors.FILE_INVALID,
            message: 'No file uploaded',
            status: HttpStatus.BAD_REQUEST,
            details: { field: 'file' }
        });
    }

    next();
};

module.exports = { validateBucketName, validateFileUpload };