/**
 * Middleware: UUID parameter validation
 *
 * Rejects requests early when a route parameter or expected query param
 * does not look like a valid UUID v4.  This prevents malformed or
 * injection-crafted values from ever reaching the database layer.
 *
 * Usage – single param:
 *   router.get('/:id', validateParam('id'), handler)
 *
 * Usage – multiple params:
 *   router.put('/:id/location/:locationId',
 *     validateParam('id'),
 *     validateParam('locationId'),
 *     handler)
 *
 * Usage – query param:
 *   router.get('/', validateQuery('locationId', { optional: true }), handler)
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate a route parameter (req.params[name]).
 * @param {string} name  The param name, e.g. 'id'
 */
function validateParam(name) {
  return (req, res, next) => {
    const value = req.params[name];
    if (!value || !UUID_RE.test(value)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${name}: must be a valid UUID`
      });
    }
    next();
  };
}

/**
 * Validate a query-string parameter (req.query[name]).
 * @param {string} name             The query param name, e.g. 'locationId'
 * @param {{ optional?: boolean }}  opts  When optional=true the param is
 *                                        only validated if it is present.
 */
function validateQuery(name, opts = {}) {
  return (req, res, next) => {
    const value = req.query[name];
    if (!value) {
      if (opts.optional) return next();
      return res.status(400).json({
        success: false,
        message: `Missing required query parameter: ${name}`
      });
    }
    if (!UUID_RE.test(value)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${name}: must be a valid UUID`
      });
    }
    next();
  };
}

module.exports = { validateParam, validateQuery };
