/**
 * 🛠️ SHARED FRONTEND FORMATTERS
 * Import from here instead of copy-pasting formatCurrency into every page.
 */

/**
 * Formats a numeric value as a localised decimal string with 2 decimal places.
 * @param {number|string} val
 * @returns {string}
 */
export const formatCurrency = (val) => {
    const num = parseFloat(val || 0);
    return num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};
