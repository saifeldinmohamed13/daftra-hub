const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const pool   = require('../config/db');
const axios  = require('axios');
const { executeFullAccountSync, recalculateGlobalUserRollup } = require('../services/syncService');
const { checkDaftraAppActive } = require('../services/daftraService');

// ─────────────────────────────────────────────
// 👤 1. Platform User Registration
// ─────────────────────────────────────────────
const registerUser = async (req, res) => {
    const { name, email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email;',
            [name || null, email, hashedPassword]
        );
        const newUser = result.rows[0];
        return res.status(201).json({
            message: 'User registered successfully!',
            user: { id: newUser.id, name: newUser.name, email: newUser.email }
        });
    } catch (error) {
        console.error('❌ [authController] Registration Error:', error.message);
        return res.status(500).json({ error: 'An error occurred during account creation. Please try again.' });
    }
};

// ─────────────────────────────────────────────
// 🔑 2. Platform User Login — issues a signed JWT
// ─────────────────────────────────────────────
const loginUser = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1;', [email]);
        if (result.rows.length === 0) return res.status(400).json({ error: 'Invalid email or password' });

        const user    = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.status(400).json({ error: 'Invalid email or password' });

        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.status(200).json({
            message: 'Logged in successfully',
            token,
            user: { id: user.id, name: user.name, email: user.email }
        });
    } catch (error) {
        console.error('❌ [authController] Login Error:', error.message);
        return res.status(500).json({ error: 'Server error during login' });
    }
};

// ─────────────────────────────────────────────
// 🤝 3. Daftra Multi-Account Connection & Handshake
// ─────────────────────────────────────────────
const daftraLoginHandshake = async (req, res) => {
    const { subdomain, email, password, userId } = req.body;

    if (!subdomain || !email || !password || !userId) {
        return res.status(400).json({ error: 'All credentials and user context are required' });
    }

    const cleanSubdomain = subdomain.replace('https://', '').replace('http://', '').split('.')[0];
    const daftraAuthUrl  = `https://${cleanSubdomain}.daftra.com/v2/oauth/token`;

    try {
        // 1. Authenticate with Daftra OAuth
        const authResponse = await axios.post(daftraAuthUrl, {
            grant_type:    'password',
            client_id:     process.env.DAFTRA_CLIENT_ID,
            client_secret: process.env.DAFTRA_CLIENT_SECRET,
            username:      email,
            password:      password,
        }, { headers: { 'Content-Type': 'application/json' } });

        const accessToken = authResponse.data.access_token;
        if (!accessToken) {
            return res.status(401).json({ error: 'Failed to retrieve live session token from Daftra' });
        }

        const config = { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } };

        // 🎯 2. فحص هل التطبيق (641) مفعل في حساب دفترة هذا أم لا
        const isAppActive = await checkDaftraAppActive(cleanSubdomain, config);
        if (!isAppActive) {
            return res.status(403).json({ 
                error: 'تطبيق Hub غير مفعل على حساب دفترة الخاص بك. يرجى تفعيله أولاً للاستفادة من خدمات المزامنة.' 
            });
        }

        // 3. Fetch Daftra site info
        const siteInfoResponse = await axios.get(`https://${cleanSubdomain}.daftra.com/api2/site_info`, config);

        const siteData = siteInfoResponse.data?.data?.Site;
        if (!siteData || !siteData.id) {
            return res.status(400).json({ error: 'Failed to resolve Daftra site identification profile.' });
        }

        const daftraSiteId      = siteData.id.toString();
        const businessName      = siteData.business_name || `${cleanSubdomain.toUpperCase()} Live Branch`;
        const accountCurrency   = siteData.currency_code || siteData.currency || 'EGP';

        // Prevent duplicate connections
        const duplicateCheck = await pool.query(
            'SELECT id FROM linked_accounts WHERE user_id = $1 AND daftra_site_id = $2;',
            [userId, daftraSiteId]
        );
        if (duplicateCheck.rows.length > 0) {
            return res.status(409).json({ error: 'This Daftra account is already connected to your workspace.' });
        }

        // Persist the linked account with sync_status = 'connected'
        const accountResult = await pool.query(`
            INSERT INTO linked_accounts
            (user_id, daftra_subdomain, daftra_site_id, encrypted_access_token, account_name, currency_code, sync_status)
            VALUES ($1, $2, $3, $4, $5, $6, 'connected')
            ON CONFLICT (user_id, daftra_subdomain)
            DO UPDATE SET
                daftra_site_id          = EXCLUDED.daftra_site_id,
                encrypted_access_token  = EXCLUDED.encrypted_access_token,
                account_name            = EXCLUDED.account_name,
                currency_code           = EXCLUDED.currency_code,
                sync_status             = 'connected'
            RETURNING id, daftra_subdomain, daftra_site_id, account_name, currency_code, sync_status;
        `, [userId, `${cleanSubdomain}.daftra.com`, daftraSiteId, accessToken, businessName, accountCurrency]);

        const accountId = accountResult.rows[0].id;

        // Create sync progress job
        const jobResult = await pool.query(
            "INSERT INTO sync_jobs (user_id, account_id, status) VALUES ($1, $2, 'pending') RETURNING id;",
            [userId, accountId]
        );
        const jobId = jobResult.rows[0].id;

        // Kick off background full sync
        setImmediate(() => {
            executeFullAccountSync(userId, accountId, cleanSubdomain, config, jobId);
        });

        return res.status(200).json({
            success: true,
            backgroundJobLaunched: true,
            jobId,
            account: accountResult.rows[0]
        });
    } catch (error) {
        console.error('❌ [authController] Daftra Handshake Error:', error.response ? error.response.data : error.message);
        return res.status(error.response ? error.response.status : 500).json({
            error: error.response?.data?.error || error.response?.data?.error_description || error.message || 'Authentication or sync failure.'
        });
    }
};

// ─────────────────────────────────────────────
// 📊 4. Get Sync Job Progress Status
// ─────────────────────────────────────────────
const getSyncJobStatus = async (req, res) => {
    try {
        const { jobId } = req.params;
        const result = await pool.query(
            'SELECT id, status, current_step, total_records, processed_records, progress_percentage, error_message FROM sync_jobs WHERE id = $1;',
            [jobId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Sync job not found.' });
        }
        return res.status(200).json(result.rows[0]);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// ─────────────────────────────────────────────
// 🏢 5. Fetch Linked Accounts for a User
// ─────────────────────────────────────────────
const getLinkedAccounts = async (req, res) => {
    const { userId } = req.params;
    try {
        const result = await pool.query(
            'SELECT id, daftra_subdomain, daftra_site_id, account_name, currency_code, sync_status, created_at FROM linked_accounts WHERE user_id = $1;',
            [userId]
        );
        return res.status(200).json(result.rows);
    } catch (error) {
        console.error('❌ [authController] Fetch Linked Accounts Error:', error.message);
        return res.status(500).json({ error: 'Failed to retrieve connected accounts.' });
    }
};

// ─────────────────────────────────────────────
// 🗑️ 6. Unlink & Delete Account
// ─────────────────────────────────────────────
const deleteLinkedAccount = async (req, res) => {
    const { accountId } = req.params;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const accountResult = await client.query(
            'SELECT user_id FROM linked_accounts WHERE id = $1;',
            [accountId]
        );
        if (accountResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Account not found' });
        }
        const userId = accountResult.rows[0].user_id;

        await client.query('DELETE FROM daily_product_sales_cache  WHERE account_id = $1;', [accountId]);
        await client.query('DELETE FROM products_cache             WHERE account_id = $1;', [accountId]);
        await client.query('DELETE FROM processed_cogs_entries     WHERE account_id = $1;', [accountId]);
        await client.query('DELETE FROM returns_cache              WHERE account_id = $1;', [accountId]);
        await client.query('DELETE FROM invoices_cache             WHERE account_id = $1;', [accountId]);
        await client.query('DELETE FROM clients_cache              WHERE account_id = $1;', [accountId]);
        await client.query('DELETE FROM daily_treasury_totals      WHERE account_id = $1;', [accountId]);
        await client.query('DELETE FROM treasury_transactions_cache WHERE account_id = $1;', [accountId]);
        await client.query('DELETE FROM treasuries_cache           WHERE account_id = $1;', [accountId]);
        await client.query('DELETE FROM branches_cache             WHERE account_id = $1;', [accountId]);
        await client.query('DELETE FROM sync_jobs                  WHERE account_id = $1;', [accountId]);

        const deleteResult = await client.query(
            'DELETE FROM linked_accounts WHERE id = $1 RETURNING id, account_name;',
            [accountId]
        );

        await client.query('COMMIT');
        await recalculateGlobalUserRollup(userId);

        return res.status(200).json({
            message: 'Account unlinked and global financial metrics updated successfully.',
            deletedAccount: deleteResult.rows[0]
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ [authController] Delete Account Error — rolled back:', error.message);
        return res.status(500).json({ error: 'Server error during account deletion. No data was changed.' });
    } finally {
        client.release();
    }
};

module.exports = {
    registerUser,
    loginUser,
    daftraLoginHandshake,
    getSyncJobStatus,
    getLinkedAccounts,
    deleteLinkedAccount,
};