const rateLimit = require('express-rate-limit');
const logger = require('./logger');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP, please try again later.",
  statusCode: 429,
  onLimit: (req, res) => {
    logger.error(req.ip, 'Rate limit exceeded', {
      path: req.path,
      method: req.method
    });
  }
});

module.exports = apiLimiter;