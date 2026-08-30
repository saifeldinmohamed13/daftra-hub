const pool = require('../config/db');
const { getUserCurrencyContext, convertToActiveCurrency } = require('../utils/currencyHelper');

/**
 * 📊 1. Top 5 Sold Products in Last 30 Days (للرسم البياني - يدعم العملة الموحدة)
 * GET /api/products/account/:accountId/top-5
 */
const getTopSoldProducts = async (req, res) => {
    try {
        const { accountId } = req.params;
        const userId = req.user.userId; // 🎯 تأمين
        const { targetCurrency } = req.query;

        // جلب سياق العملة للحساب التابع للمستخدم
        const accUserRes = await pool.query('SELECT user_id, currency_code FROM linked_accounts WHERE id = $1 AND user_id = $2', [accountId, userId]); // 🎯 تأمين
        if (accUserRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Linked account not found or unauthorized' });
        }

        const accountBaseCurrency = (accUserRes.rows[0].currency_code || 'EGP').toUpperCase().trim();

        const currencyContext = await getUserCurrencyContext(userId);
        const isUnified = !!(targetCurrency && targetCurrency !== 'DEFAULT');
        const activeCurrency = isUnified ? targetCurrency.toUpperCase().trim() : accountBaseCurrency;

        const query = `
            SELECT 
                p.daftra_product_id,
                p.name AS product_name,
                COALESCE(SUM(dps.net_quantity), 0) AS total_sold_qty,
                COALESCE(SUM(dps.net_sales_amount), 0) AS total_revenue
            FROM products_cache p
            LEFT JOIN daily_product_sales_cache dps 
                ON p.account_id = dps.account_id 
                AND p.daftra_product_id = dps.daftra_product_id
                AND dps.sale_date >= CURRENT_DATE - INTERVAL '30 days'
            WHERE p.account_id = $1
            GROUP BY p.id, p.daftra_product_id, p.name
            HAVING COALESCE(SUM(dps.net_quantity), 0) > 0
            ORDER BY total_sold_qty DESC
            LIMIT 5;
        `;

        const result = await pool.query(query, [accountId]);

        const processedRows = result.rows.map(p => {
            const rawRev = parseFloat(p.total_revenue || 0);

            return {
                ...p,
                is_unified: isUnified,
                display_currency: isUnified ? activeCurrency : accountBaseCurrency,
                account_base_currency: accountBaseCurrency,
                total_revenue: isUnified ? convertToActiveCurrency(rawRev, accountBaseCurrency, activeCurrency, currencyContext.exchangeRates) : rawRev
            };
        });

        return res.status(200).json({
            success: true,
            data: processedRows
        });
    } catch (err) {
        console.error('❌ Error fetching top sold products:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * 📦 2. Products Directory List (للجدول بالداش بورد وللصفحة الجديدة - يدعم العملة الموحدة)
 * GET /api/products/account/:accountId/list
 * Query Params: ?limit=5&page=1&targetCurrency=USD
 */
const getAccountProductsList = async (req, res) => {
    try {
        const { accountId } = req.params;
        const userId = req.user.userId; // 🎯 تأمين
        const { targetCurrency } = req.query;
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;
        const page = req.query.page ? parseInt(req.query.page, 10) : 1;
        const offset = limit ? (page - 1) * limit : 0;

        // جلب سياق العملة للحساب
        const accUserRes = await pool.query('SELECT user_id, currency_code FROM linked_accounts WHERE id = $1 AND user_id = $2', [accountId, userId]); // 🎯 تأمين
        if (accUserRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Linked account not found or unauthorized' });
        }

        const accountBaseCurrency = (accUserRes.rows[0].currency_code || 'EGP').toUpperCase().trim();

        const currencyContext = await getUserCurrencyContext(userId);
        const isUnified = !!(targetCurrency && targetCurrency !== 'DEFAULT');
        const activeCurrency = isUnified ? targetCurrency.toUpperCase().trim() : accountBaseCurrency;

        // استعلام جلب إجمالي عدد المنتجات للصفحة الجديدة (Pagination)
        const countQuery = `SELECT COUNT(*) FROM products_cache WHERE account_id = $1;`;
        const countResult = await pool.query(countQuery, [accountId]);
        const totalProducts = parseInt(countResult.rows[0].count, 10);

        // بناء استعلام جلب البيانات المفصلة للمنتجات
        let dataQuery = `
            SELECT 
                p.daftra_product_id,
                p.product_code,
                p.barcode,
                p.name AS product_name,
                p.unit_price,
                COALESCE(b.name, 'الفرع الرئيسي') AS branch_name,
                COALESCE(SUM(dps.net_quantity), 0) AS total_sold_qty,
                COALESCE(SUM(dps.net_sales_amount), 0) AS total_revenue,
                COALESCE(SUM(dps.pending_quantity), 0) AS pending_stock,
                p.stock_balance AS total_stock,
                (p.stock_balance - COALESCE(SUM(dps.pending_quantity), 0)) AS available_stock,
                p.created_at
            FROM products_cache p
            LEFT JOIN branches_cache b 
                ON p.account_id = b.account_id 
                AND p.branch_id = b.daftra_branch_id
            LEFT JOIN daily_product_sales_cache dps 
                ON p.account_id = dps.account_id 
                AND p.daftra_product_id = dps.daftra_product_id
            WHERE p.account_id = $1
            GROUP BY p.id, p.daftra_product_id, p.product_code, p.barcode, p.name, p.unit_price, b.name, p.stock_balance, p.created_at
            ORDER BY p.id DESC
        `;

        const queryParams = [accountId];

        if (limit) {
            queryParams.push(limit, offset);
            dataQuery += ` LIMIT $2 OFFSET $3;`;
        } else {
            dataQuery += `;`;
        }

        const dataResult = await pool.query(dataQuery, queryParams);

        const processedRows = dataResult.rows.map(p => {
            const rawRev = parseFloat(p.total_revenue || 0);

            return {
                ...p,
                is_unified: isUnified,
                display_currency: isUnified ? activeCurrency : accountBaseCurrency,
                account_base_currency: accountBaseCurrency,
                total_revenue: isUnified ? convertToActiveCurrency(rawRev, accountBaseCurrency, activeCurrency, currencyContext.exchangeRates) : rawRev
            };
        });

        return res.status(200).json({
            success: true,
            pagination: {
                total_records: totalProducts,
                page: page,
                limit: limit || totalProducts,
                total_pages: limit ? Math.ceil(totalProducts / limit) : 1
            },
            data: processedRows
        });
    } catch (err) {
        console.error('❌ Error fetching account products list:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};

module.exports = {
    getTopSoldProducts,
    getAccountProductsList
};