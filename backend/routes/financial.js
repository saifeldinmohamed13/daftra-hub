const express     = require('express');
const router      = express.Router();
const financialController = require('../controllers/financialController');
const { protect } = require('../middleware/authMiddleware');

// 🌐 Client Statement HTML Proxy (الخاص بالعملاء فقط)
router.get('/client-statement-proxy/:accountId/:clientId', financialController.getClientStatementHtml);

// 🔒 All financial endpoints below require authentication
router.use(protect);

// 💳 Payments Endpoint
router.get('/payments/:userId', financialController.getUserPayments);

// 📊 Sales & Collections Widget (أحدث المبيعات والنسب البيانية)
router.get('/widgets/sales', financialController.getRecentSalesWidget);

// ⚡ Recent Widgets
router.get('/global/recent-widgets/:userId',   financialController.getGlobalRecentWidgets);
router.get('/branch/recent-widgets/:accountId', financialController.getBranchRecentWidgets);

// 📇 Server-Side Pagination
router.get('/ledgers/paginated',  financialController.getLedgersPaginated);
router.get('/clients/paginated',  financialController.getClientsPaginated);

// 📊 Analytics & Visualization
router.get('/global/analytics/:userId',       financialController.getGlobalAnalytics);
router.get('/branch/:accountId/analytics',   financialController.getBranchAnalytics);

// 📈 Summary & Transactions
router.get('/summary/:userId',               financialController.getSummary);
router.get('/branch/:accountId/summary',     financialController.getBranchSummary);
router.get('/branch/:accountId/transactions', financialController.getBranchTransactions);

// 🏦 Treasuries & Bank Accounts
router.get('/treasuries/user/:userId',                                 financialController.getUserTreasuries);
router.get('/treasuries/:accountId/:journalAccountId/header',             financialController.getTreasuryHeader);
router.get('/treasuries/:accountId/:journalAccountId/transactions',       financialController.getTreasuryTransactionsPaginated);

// 🔁 Background Sync Triggers
router.post('/sync-branch/:accountId', financialController.syncBranch);
router.post('/sync-all/:userId',       financialController.syncAll);

// 📊 Fast Financial Report / Chart of Accounts Sync
router.post('/branch/:accountId/sync-chart', financialController.syncFinancialReportOnly);

module.exports = router;