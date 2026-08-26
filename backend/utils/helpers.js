/**
 * 🛠️ SHARED UTILITY HELPERS
 * Centralised helpers used across syncService, webhookController, and other modules.
 * Single source of truth — import from here instead of duplicating.
 */

/**
 * Safely parses or calculates a due date from a raw Daftra invoice object.
 * Handles 0000-00-00 sentinel values, falls back to issue_date + due_after days.
 * @param {object} inv - Raw invoice object from Daftra API
 * @returns {string|null} ISO date string (YYYY-MM-DD) or null
 */
const parseDaftraDueDate = (inv) => {
    if (!inv) return null;

    const raw = inv.due_date || inv.stored_due_date || inv.due_date_formatted;
    if (raw) {
        const str = String(raw).trim();
        if (str !== '' && !str.startsWith('0000-00-00') && str !== 'null' && str !== 'undefined') {
            const match = str.match(/\d{4}-\d{2}-\d{2}/);
            if (match) return match[0];
        }
    }

    const dueAfterDays = (inv.due_after !== undefined && inv.due_after !== null)
        ? parseInt(inv.due_after, 10)
        : null;

    const issueDateRaw = inv.date || inv.issue_date || inv.created;

    if (dueAfterDays !== null && !isNaN(dueAfterDays) && dueAfterDays > 0 && issueDateRaw) {
        const issueDate = new Date(issueDateRaw);
        if (!isNaN(issueDate.getTime())) {
            issueDate.setDate(issueDate.getDate() + dueAfterDays);
            return issueDate.toISOString().split('T')[0];
        }
    }

    return null;
};

module.exports = { parseDaftraDueDate };
