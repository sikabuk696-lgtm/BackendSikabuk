/**
 * Error utilities — keeps internal DB / schema details out of API responses
 * in production while preserving helpful messages in development.
 */

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Returns a safe message string to send to the client.
 *
 * Rules:
 *  - 4xx errors carry developer-written, intentional messages → always pass through
 *  - 5xx / unexpected errors → return the generic fallback in production
 *    so that raw DB messages, column names, or stack traces are never exposed
 *
 * @param {any}    error    - The caught error (may be a plain object or Error)
 * @param {string} fallback - Generic message shown for 5xx in production
 * @returns {string}
 */
function safeMessage(error, fallback = 'An unexpected error occurred. Please try again.') {
  const status = error?.status || error?.statusCode || 500;
  if (status < 500) {
    // Client/business-logic error — message is intentional and safe to expose
    return error?.message || fallback;
  }
  // Server error: only expose the detailed message in development
  if (!IS_PROD) {
    return error?.message || fallback;
  }
  return fallback;
}

/**
 * Central Express error-handler middleware.
 * Mount LAST in index.js:  app.use(globalErrorHandler)
 *
 * Catches any error passed via next(err) that wasn't handled inline.
 */
function globalErrorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err?.status || err?.statusCode || 500;
  const message = safeMessage(err, 'Internal server error');

  // Always log 5xx with full detail server-side
  if (status >= 500) {
    console.error('[GlobalErrorHandler]', req.method, req.url, err);
  }

  if (res.headersSent) return next(err);

  res.status(status).json({ success: false, message });
}

module.exports = { safeMessage, globalErrorHandler };
