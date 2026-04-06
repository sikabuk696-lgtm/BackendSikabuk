'use strict';

/**
 * Global input sanitization middleware.
 *
 * Defends against:
 *  - Prototype-pollution attacks  (blocks __proto__ / constructor / prototype keys)
 *  - Null-byte injection          (\x00 chars that can bypass filters in some DBs)
 *  - Dangerous ASCII control chars (strips \x01-\x08, \x0b, \x0c, \x0e-\x1f)
 *  - Excessively deep nesting     (caps recursion depth to prevent DoS)
 *  - Oversized per-field strings  (caps each string to 5 000 chars)
 *  - Oversized arrays             (caps each array to 500 items)
 *
 * NOTE: SQL injection is already prevented by Supabase's parameterized query builder.
 * This middleware adds a defence-in-depth layer at the HTTP boundary.
 *
 * Apply globally in index.js AFTER body parsing middleware.
 */

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_STRING_LENGTH = 5000;
const MAX_ARRAY_LENGTH  = 500;
const MAX_DEPTH         = 8;

/**
 * Recursively sanitize a single value.
 * @param {*}      value  The value to sanitize.
 * @param {number} depth  Current recursion depth.
 * @returns {*} Sanitized value.
 */
function sanitizeValue(value, depth) {
  if (depth > MAX_DEPTH) return undefined;

  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return value
      .replace(/\x00/g, '')                             // null bytes
      .replace(/[\x01-\x08\x0b\x0c\x0e-\x1f]/g, '')   // dangerous control chars
      // \x09 (tab), \x0a (LF), \x0d (CR) are intentionally kept — they appear  
      // in legitimate multiline text and addresses.
      .trim()
      .slice(0, MAX_STRING_LENGTH);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map(item => sanitizeValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    const clean = {};
    for (const key of Object.keys(value)) {
      if (DANGEROUS_KEYS.has(key)) {
        // Prototype-pollution attempt — drop the key entirely
        continue;
      }
      const sanitizedKey   = sanitizeValue(key, depth + 1);
      const sanitizedValue = sanitizeValue(value[key], depth + 1);
      if (sanitizedKey !== undefined && sanitizedValue !== undefined) {
        clean[sanitizedKey] = sanitizedValue;
      }
    }
    return clean;
  }

  // Functions, symbols, etc. — drop them
  return undefined;
}

/**
 * Express middleware: sanitizes req.body and req.query in-place.
 * Leaves req.params untouched — UUID param validation handles those separately.
 */
function sanitizeRequest(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body, 0) || {};
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeValue(req.query, 0) || {};
  }
  next();
}

module.exports = { sanitizeRequest };
