export const notFound = (req, res, next) => {
  res.status(404);
  next(new Error(`Route not found: ${req.originalUrl}`));
};

export const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  let message = err.message || "Internal Server Error";

  // Errors raised by Express itself carry their own 4xx status (e.g. a
  // malformed JSON body) — that's a client error, not a server failure.
  if (statusCode === 500 && err.status >= 400 && err.status < 500) {
    statusCode = err.status;
    if (err.type === "entity.parse.failed") message = "Request body is not valid JSON";
  }

  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(", ");
  }

  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0];
    message = `${field} already exists`;
  }

  const production = process.env.NODE_ENV === "production";

  // Unexpected server errors: logged for the operator; in production the
  // visitor gets a generic message instead of internal details. 4xx messages
  // are written for users and shown as before.
  if (statusCode >= 500) {
    console.error(err);
    if (production) message = "Something went wrong. Please try again.";
  }

  res.status(statusCode).json({
    success: false,
    message,
    stack: production ? undefined : err.stack,
  });
};
