const { HttpStatus } = require('../utils/error-codes');

const responseHandler = (req, res, next) => {
    res.sendSuccess = (data) => {
        return res.status(HttpStatus.OK).json({
            success: true,
            data
        });
    };   
    
    res.sendError = (error) => {
        return res.status(error.status || HttpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: {
                code: error.code,
                message: error.message,
                details: error.details
            }
        });
    };

    next();
};

module.exports = { responseHandler };   

