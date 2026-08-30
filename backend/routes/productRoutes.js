const express = require('express');
const router  = express.Router();
const { getTopSoldProducts, getAccountProductsList } = require('../controllers/productController');
const { protect } = require('../middleware/authMiddleware');

// All product endpoints require authentication
router.use(protect);

// 📊 Top 5 sold products (last 30 days) — used by branch dashboard chart
router.get('/account/:accountId/top-5', getTopSoldProducts);

// 📦 Paginated full products list — used by ProductsPage
router.get('/account/:accountId/list',  getAccountProductsList);

module.exports = router;