//Not Found

const notFound = (req, res, next) => {
    const error = new Error(`Not Found: ${req.originalUrl}`);
    res.status(404);
    next(error);
  };

const errorHandler = (err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode).json({
      message: err?.message || 'Internal Server Error',
      error: err?.stack || 'No stack trace available',
    });
  };

module.exports = {
    notFound,errorHandler
}