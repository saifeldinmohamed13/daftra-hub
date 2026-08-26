const jwt = require('jsonwebtoken');

/**
 * 🔒 JWT Authentication Middleware
 * Attach to any route that requires a logged-in user.
 * The frontend must send: Authorization: Bearer <token>
 */
const protect = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { userId, email }
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }
};

module.exports = { protect };
