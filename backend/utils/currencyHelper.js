const pool = require('../config/db');

/**
 * 🎯 1. جلب إعدادات العملة وأسعار الصرف الخاصة بالمستخدم
 */
const getUserCurrencyContext = async (userId) => {
    try {
        const prefRes = await pool.query(
            'SELECT is_unified_enabled, active_currency FROM user_dashboard_preferences WHERE user_id = $1;',
            [userId]
        );

        const prefs = prefRes.rows[0] || { is_unified_enabled: false, active_currency: 'DEFAULT' };

        const ratesRes = await pool.query(
            'SELECT from_currency, to_currency, exchange_value FROM user_exchange_rates WHERE user_id = $1;',
            [userId]
        );

        return {
            // 💡 يُستخدم فقط لمعرفة تفعيل مفتاح العرض الموحد باللوحات
            isUnifiedEnabled: prefs.is_unified_enabled && prefs.active_currency !== 'DEFAULT',
            activeCurrency: prefs.active_currency,
            // 👈 قائمة أسعار الصرف متاحة دائماً للتحويل المباشر للعملات المشتركة
            exchangeRates: ratesRes.rows || []
        };
    } catch (err) {
        console.error('❌ Error fetching user currency context:', err.message);
        return { isUnifiedEnabled: false, activeCurrency: 'DEFAULT', exchangeRates: [] };
    }
};

/**
 * 🎯 2. دالة التحويل المالي المباشرة والدقيقة
 */
const convertToActiveCurrency = (amount, fromCurrency, targetCurrency, ratesList = []) => {
    const num = parseFloat(amount || 0);
    if (!fromCurrency || !targetCurrency || fromCurrency.toUpperCase().trim() === targetCurrency.toUpperCase().trim()) {
        return num;
    }

    const fromCurr = fromCurrency.toUpperCase().trim();
    const targetCurr = targetCurrency.toUpperCase().trim();

    // 1. بحث عن سعر تحويل مباشر مسجل بالداتابيز من fromCurr إلى targetCurr
    const directRate = ratesList.find(
        r => r.from_currency.toUpperCase().trim() === fromCurr && r.to_currency.toUpperCase().trim() === targetCurr
    );
    if (directRate) {
        const val = parseFloat(directRate.exchange_value || directRate.exchange_rate || 0);
        if (val > 0) return num * val;
    }

    // 2. بحث عن السعر بالاتجاه الآخر وإدارته بالقسمة (1 targetCurr = X fromCurr)
    const reverseRate = ratesList.find(
        r => r.from_currency.toUpperCase().trim() === targetCurr && r.to_currency.toUpperCase().trim() === fromCurr
    );
    if (reverseRate) {
        const val = parseFloat(reverseRate.exchange_value || reverseRate.exchange_rate || 0);
        if (val > 0) return num / val;
    }

    return num;
};

module.exports = {
    getUserCurrencyContext,
    convertToActiveCurrency
};