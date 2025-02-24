// HTTP Status codes
const HttpStatus = {
    OK: 200,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_SERVER_ERROR: 500,
    RANGE_NOT_SATISFIABLE: 416,
};

// SDK Error codes from akavesdk/private/ipc/errors.go
const SDKErrors = {
    // Bucket related errors
    BUCKET_ALREADY_EXISTS: '0x497ef2c2',
    BUCKET_INVALID: '0x4f4b202a',
    BUCKET_INVALID_OWNER: '0xdc64d0ad',
    BUCKET_NONEXISTS: '0x938a92b7',
    BUCKET_NONEMPTY: '0x89fddc00',

    // File related errors
    FILE_ALREADY_EXISTS: '0x6891dde0',
    FILE_INVALID: '0x77a3cbd8',
    FILE_NONEXISTS: '0x21584586',
    FILE_NONEMPTY: '0xc4a3b6f1',
    FILE_NAME_DUPLICATE: '0xd09ec7af',
    FILE_FULLY_UPLOADED: '0xd96b03b1',
    FILE_CHUNK_DUPLICATE: '0x702cf740',

    // Block related errors
    BLOCK_ALREADY_EXISTS: '0xc1edd16a',
    BLOCK_INVALID: '0xcb20e88c',
    BLOCK_NONEXISTS: '0x15123121',

    // Other errors
    INVALID_ARRAY_LENGTH: '0x856b300d',
    INVALID_FILE_BLOCKS_COUNT: '0x17ec8370',
    INVALID_LAST_BLOCK_SIZE: '0x5660ebd2',
    INVALID_ENCODED_SIZE: '0x1b6fdfeb',
    INVALID_FILE_CID: '0xfe33db92',
    INDEX_MISMATCH: '0x37c7f255',
    NO_POLICY: '0xcefa6b05'
};

// Error messages mapping
const ErrorMessages = {
    [SDKErrors.BUCKET_ALREADY_EXISTS]: "Bucket already exists",
    [SDKErrors.BUCKET_INVALID]: "Invalid bucket name",
    [SDKErrors.BUCKET_INVALID_OWNER]: 'Invalid bucket owner',
    [SDKErrors.BUCKET_NONEXISTS]: "Bucket does not exist",
    [SDKErrors.BUCKET_NONEMPTY]: "Bucket is not empty",
    [SDKErrors.FILE_ALREADY_EXISTS]: "File already exists",
    [SDKErrors.FILE_INVALID]: "Invalid file name",
    [SDKErrors.FILE_NONEXISTS]: "File does not exist",
    [SDKErrors.FILE_NONEMPTY]: 'File is not empty',
    [SDKErrors.FILE_NAME_DUPLICATE]: 'Duplicate file name',
    [SDKErrors.FILE_FULLY_UPLOADED]: 'File is already fully uploaded',
    [SDKErrors.FILE_CHUNK_DUPLICATE]: 'Duplicate file chunk',
    [SDKErrors.BLOCK_ALREADY_EXISTS]: 'Block already exists',
    [SDKErrors.BLOCK_INVALID]: 'Invalid block',
    [SDKErrors.BLOCK_NONEXISTS]: 'Block not found',
    [SDKErrors.INVALID_ARRAY_LENGTH]: 'Invalid array length',
    [SDKErrors.INVALID_FILE_BLOCKS_COUNT]: 'Invalid file blocks count',
    [SDKErrors.INVALID_LAST_BLOCK_SIZE]: 'Invalid last block size',
    [SDKErrors.INVALID_ENCODED_SIZE]: 'Invalid encoded size',
    [SDKErrors.INVALID_FILE_CID]: 'Invalid file CID',
    [SDKErrors.INDEX_MISMATCH]: 'Index mismatch',
    [SDKErrors.NO_POLICY]: 'No policy found',
    'RANGE_ERROR': 'Requested range not satisfiable',
    'STREAM_ERROR': 'Error occurred while streaming file',
};

// HTTP Status mapping for SDK errors
const ErrorHttpStatus = {
    [SDKErrors.BUCKET_ALREADY_EXISTS]: HttpStatus.CONFLICT,
    [SDKErrors.BUCKET_INVALID]: HttpStatus.BAD_REQUEST,
    [SDKErrors.BUCKET_INVALID_OWNER]: HttpStatus.FORBIDDEN,
    [SDKErrors.BUCKET_NONEXISTS]: HttpStatus.NOT_FOUND,
    [SDKErrors.BUCKET_NONEMPTY]: HttpStatus.BAD_REQUEST,
    [SDKErrors.FILE_ALREADY_EXISTS]: HttpStatus.CONFLICT,
    [SDKErrors.FILE_INVALID]: HttpStatus.BAD_REQUEST,
    [SDKErrors.FILE_NONEXISTS]: HttpStatus.NOT_FOUND,
    [SDKErrors.FILE_FULLY_UPLOADED]: HttpStatus.CONFLICT,
    [SDKErrors.FILE_NAME_DUPLICATE]: HttpStatus.CONFLICT,
    [SDKErrors.FILE_CHUNK_DUPLICATE]: HttpStatus.CONFLICT,
    [SDKErrors.BLOCK_ALREADY_EXISTS]: HttpStatus.CONFLICT,
    [SDKErrors.BLOCK_INVALID]: HttpStatus.BAD_REQUEST,
    [SDKErrors.BLOCK_NONEXISTS]: HttpStatus.NOT_FOUND,
    [SDKErrors.INVALID_ARRAY_LENGTH]: HttpStatus.BAD_REQUEST,
    [SDKErrors.INVALID_FILE_BLOCKS_COUNT]: HttpStatus.BAD_REQUEST,
    [SDKErrors.INVALID_LAST_BLOCK_SIZE]: HttpStatus.BAD_REQUEST,
    [SDKErrors.INVALID_ENCODED_SIZE]: HttpStatus.BAD_REQUEST,
    [SDKErrors.INVALID_FILE_CID]: HttpStatus.BAD_REQUEST,
    [SDKErrors.NO_POLICY]: HttpStatus.NOT_FOUND,
    'VALIDATION_ERROR': HttpStatus.BAD_REQUEST,
    'SYSTEM_ERROR': HttpStatus.INTERNAL_SERVER_ERROR,
    'UNKNOWN_ERROR': HttpStatus.INTERNAL_SERVER_ERROR,
    'RANGE_ERROR': HttpStatus.RANGE_NOT_SATISFIABLE,
    'STREAM_ERROR': HttpStatus.INTERNAL_SERVER_ERROR,
};

module.exports = { HttpStatus, SDKErrors, ErrorMessages, ErrorHttpStatus };