/**
 * Validation helper functions for backend input validation
 */

/**
 * Validates UUID format
 * @param {string} uuid - UUID to validate
 * @returns {boolean} True if valid UUID
 */
function isValidUUID(uuid) {
  if (!uuid || typeof uuid !== 'string') {
    return false;
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validates date string or Date object
 * @param {string|Date} date - Date to validate
 * @returns {boolean} True if valid date
 */
function isValidDate(date) {
  if (!date) return false;
  const dateObj = date instanceof Date ? date : new Date(date);
  return dateObj instanceof Date && !isNaN(dateObj.getTime());
}

/**
 * Validates price value (positive number)
 * @param {any} price - Price value to validate
 * @returns {boolean} True if valid price
 */
function isValidPrice(price) {
  const num = Number(price);
  return !isNaN(num) && isFinite(num) && num >= 0;
}

/**
 * Validates quantity (positive integer)
 * @param {any} quantity - Quantity to validate
 * @returns {boolean} True if valid quantity
 */
function isValidQuantity(quantity) {
  const num = Number(quantity);
  return !isNaN(num) && isFinite(num) && num >= 0 && Number.isInteger(num);
}

/**
 * Sanitizes numeric input, removing non-numeric characters
 * @param {any} value - Value to sanitize
 * @param {number} radix - Radix for parseInt (default 10)
 * @returns {number|null} Parsed number or null if invalid
 */
function sanitizeNumeric(value, radix = 10) {
  if (value === null || value === undefined) return null;
  const num = parseInt(value, radix);
  return isNaN(num) ? null : num;
}

/**
 * Validates phone number (basic check for digits and length)
 * @param {string} phone - Phone number to validate
 * @param {number} minLength - Minimum digit length (default 10)
 * @param {number} maxLength - Maximum digit length (default 15)
 * @returns {boolean} True if valid phone
 */
function isValidPhone(phone, minLength = 10, maxLength = 15) {
  if (!phone || typeof phone !== 'string') return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= minLength && digits.length <= maxLength;
}

/**
 * Validates PIN (numeric string of specific length)
 * @param {string} pin - PIN to validate
 * @param {number} length - Expected PIN length (default 4)
 * @returns {boolean} True if valid PIN
 */
function isValidPIN(pin, length = 4) {
  if (!pin || typeof pin !== 'string') return false;
  const digits = pin.replace(/\D/g, '');
  return digits.length === length && /^\d+$/.test(pin);
}

/**
 * Sanitizes and validates string input
 * @param {any} value - Value to sanitize
 * @param {number} maxLength - Maximum allowed length
 * @returns {string|null} Trimmed string or null if invalid
 */
function sanitizeString(value, maxLength = 500) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

/**
 * Validates email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates percentage value (0-100)
 * @param {any} percent - Percentage to validate
 * @returns {boolean} True if valid percentage
 */
function isValidPercentage(percent) {
  const num = Number(percent);
  return !isNaN(num) && isFinite(num) && num >= 0 && num <= 100;
}

/**
 * Validates array contains only valid UUIDs
 * @param {Array} arr - Array to validate
 * @returns {boolean} True if all elements are valid UUIDs
 */
function isUUIDArray(arr) {
  return Array.isArray(arr) && arr.length > 0 && arr.every(isValidUUID);
}

module.exports = {
  isValidUUID,
  isValidDate,
  isValidPrice,
  isValidQuantity,
  sanitizeNumeric,
  isValidPhone,
  isValidPIN,
  sanitizeString,
  isValidEmail,
  isValidPercentage,
  isUUIDArray
};
