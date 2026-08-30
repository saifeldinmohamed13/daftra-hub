const pool = require('../config/db');

/**
 * 🎯 1. جلب العملات المستخدمة فعلياً في أكونتات المستخدم المربوطة
 */
const getSystemCurrencies = async (req, res) => {
    try {
        const userId = req.user.userId; // 🎯 تأمين

        const query = `
            SELECT DISTINCT UPPER(currency_code) AS currency_code 
            FROM linked_accounts 
            WHERE user_id = $1 AND currency_code IS NOT NULL AND currency_code != '';
        `;
        const result = await pool.query(query, [userId]);
        
        const currencies = result.rows.map(r => r.currency_code.trim());
        
        if (currencies.length === 0) {
            currencies.push('EGP');
        }

        res.json({ activeAccountCurrencies: currencies });
    } catch (err) {
        console.error("❌ [getSystemCurrencies] Error:", err.message);
        res.status(500).json({ error: err.message });
    }
};

/**
 * 🎯 2. جلب إعدادات العملة وأسعار الصرف الحالية للمستخدم
 */
const getCurrencySettings = async (req, res) => {
    try {
        const userId = req.user.userId; // 🎯 تأمين

        const prefQuery = `
            SELECT is_unified_enabled, active_currency 
            FROM user_dashboard_preferences 
            WHERE user_id = $1;
        `;
        const prefRes = await pool.query(prefQuery, [userId]);
        const preferences = prefRes.rows[0] || { is_unified_enabled: false, active_currency: 'DEFAULT' };

        const ratesQuery = `
            SELECT id, from_currency, to_currency, exchange_value 
            FROM user_exchange_rates 
            WHERE user_id = $1 
            ORDER BY id ASC;
        `;
        const ratesRes = await pool.query(ratesQuery, [userId]);

        res.json({
            is_unified_enabled: preferences.is_unified_enabled,
            active_currency: preferences.active_currency,
            rates: ratesRes.rows || []
        });
    } catch (err) {
        console.error("❌ [getCurrencySettings] Error:", err.message);
        res.status(500).json({ error: err.message });
    }
};

/**
 * 🎯 3. حفظ إعدادات العملة الموحدة وأسعار الصرف الصريحة (دون مسح البيانات بالخطأ)
 */
const saveCurrencySettings = async (req, res) => {
    const client = await pool.connect();
    try {
        const { is_unified_enabled, active_currency, rates } = req.body;
        const userId = req.user.userId; // 🎯 تأمين

        await client.query('BEGIN');

        const prefQuery = `
            INSERT INTO user_dashboard_preferences (user_id, is_unified_enabled, active_currency, updated_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id)
            DO UPDATE SET 
                is_unified_enabled = EXCLUDED.is_unified_enabled,
                active_currency = EXCLUDED.active_currency,
                updated_at = CURRENT_TIMESTAMP;
        `;
        await client.query(prefQuery, [userId, is_unified_enabled ?? false, active_currency || 'DEFAULT']);

        if (Array.isArray(rates) && rates.length > 0) {
            for (const rateItem of rates) {
                const { from_currency, to_currency, exchange_value } = rateItem;
                const val = parseFloat(exchange_value);

                if (from_currency && to_currency && !isNaN(val) && val > 0) {
                    const target = from_currency.toUpperCase().trim();
                    const source = to_currency.toUpperCase().trim();

                    const insertRateQuery = `
                        INSERT INTO user_exchange_rates (user_id, from_currency, to_currency, exchange_value, updated_at)
                        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                        ON CONFLICT (user_id, from_currency, to_currency)
                        DO UPDATE SET exchange_value = EXCLUDED.exchange_value, updated_at = CURRENT_TIMESTAMP;
                    `;
                    await client.query(insertRateQuery, [userId, target, source, val]);
                }
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'Currency settings saved successfully.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ [saveCurrencySettings] Error:", err.message);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};

/**
 * 🎯 4. تحديث العملة النشطة بجدول التفضيلات فورياً (مع الإبقاء التام على حالة المفتاح is_unified_enabled)
 */
const setActiveCurrencyPreference = async (req, res) => {
    try {
        const userId = req.user.userId; // 🎯 تأمين
        const activeCurrInput = req.body.active_currency || req.body.activeCurrency;
        const targetCurr = (activeCurrInput || 'DEFAULT').toUpperCase().trim();

        // 🎯 الحفاظ على قيمة is_unified_enabled الموجودة دون إعادة كتابتها بـ false
        const prefQuery = `
            INSERT INTO user_dashboard_preferences (user_id, is_unified_enabled, active_currency, updated_at)
            VALUES ($1, false, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id)
            DO UPDATE SET 
                active_currency = EXCLUDED.active_currency,
                is_unified_enabled = user_dashboard_preferences.is_unified_enabled,
                updated_at = CURRENT_TIMESTAMP;
        `;
        await pool.query(prefQuery, [userId, targetCurr]);

        res.json({ success: true, active_currency: targetCurr });
    } catch (err) {
        console.error("❌ [setActiveCurrencyPreference] Error:", err.message);
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getSystemCurrencies,
    getCurrencySettings,
    saveCurrencySettings,
    setActiveCurrencyPreference
};