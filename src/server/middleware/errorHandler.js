/**
 * errorHandler.js
 * ===============
 * Global exception handler middleware.
 * Port of main.py global_exception_handler.
 */

export function errorHandler(logger) {
  return (err, req, res, _next) => {
    const requestId = req.requestId || 'unknown';

    if (logger) {
      logger.error({ requestId, path: req.path, error: err.message, stack: err.stack }, 'Unhandled exception');
    }

    // If headers already sent, delegate to Express default handler
    if (res.headersSent) {
      return _next(err);
    }

    const status = err.statusCode || err.status || 500;
    res.status(status).json({
      error: {
        message: status === 500 ? 'Internal server error' : err.message,
        type: 'server_error',
        code: status,
        request_id: requestId,
      },
    });
  };
}

export default errorHandler;
