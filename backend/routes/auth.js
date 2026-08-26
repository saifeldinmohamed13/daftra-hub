const express = require('express');
const router  = express.Router();
const {
    registerUser,
    loginUser,
    daftraLoginHandshake,
    getSyncJobStatus,
    getLinkedAccounts,
    deleteLinkedAccount,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// ── Public routes (no token needed) ──────────────────────────
router.post('/register', registerUser);
router.post('/login',    loginUser);

// ── Protected routes (valid JWT required) ────────────────────
router.post('/daftra-login',                 protect, daftraLoginHandshake);
router.get('/linked-accounts/:userId',       protect, getLinkedAccounts);
router.delete('/linked-accounts/:accountId', protect, deleteLinkedAccount);
router.get('/sync-status/:jobId',            protect, getSyncJobStatus);

module.exports = router;
