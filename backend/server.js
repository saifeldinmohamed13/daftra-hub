const express = require('express');
const cors    = require('cors');
require('dotenv').config();

const authRoutes      = require('./routes/auth');
const financialRoutes = require('./routes/financial');
const productRoutes   = require('./routes/productRoutes');
const currencyRoutes  = require('./routes/currencyRoutes'); // 🎯 إضافة مسارات إعدادات العملات

const { initNightlySyncCron }             = require('./services/cronService');
const { initDistributedSweeperCron }     = require('./services/sweeperService');
const createTables                        = require('./config/initDb');
const { handleDaftraWebhook }             = require('./controllers/webhookController');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ───────────────────────────────────────────────
app.use(cors());          // localhost dev: keep wildcard
app.use(express.json());

// ── DB Schema Init ───────────────────────────────────────────
createTables();

// ── Health Check ─────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({ message: 'Daftra Multi-Account Hub API v2.0 — Running ✅' });
});

// ── Route Mounts ─────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/financial', financialRoutes);
app.use('/api/products',  productRoutes);
app.use('/api/currency',  currencyRoutes); // 🎯 تفعيل API العملات والـ Settings

// Webhook — intentionally public (Daftra must reach this endpoint)
app.post('/api/webhooks/daftra', handleDaftraWebhook);

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    
    // 🔄 تشغيل المجدول الدوّار الموزع (كل 10 دقائق)
    initDistributedSweeperCron();
    
    // ⏰ تشغيل مجدول منتصف الليل الشامل
    initNightlySyncCron();
});