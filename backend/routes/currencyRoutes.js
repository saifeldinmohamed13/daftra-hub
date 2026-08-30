const express = require('express');
const router = express.Router();
const currencyController = require('../controllers/currencyController');
const { protect } = require('../middleware/authMiddleware'); // 🎯 إضافة ميدل وير الحماية

// 🔒 تأمين جميع مسارات إعدادات العملة باستخدام التوكن
router.use(protect);

// 🎯 جلب العملات المستخرجة من أكونتات الدفترة المربوطة
router.get('/system-currencies/:userId', currencyController.getSystemCurrencies);

// 🎯 جلب إعدادات العملة وأسعار الصرف الحالية للمستخدم
router.get('/settings/:userId', currencyController.getCurrencySettings);

// 🎯 حفظ/تحديث إعدادات العملة وأسعار الصرف
router.post('/settings', currencyController.saveCurrencySettings);

// 🎯 تحديث وتثبيت العملة النشطة بجدول التفضيلات فورياً (دعم PUT و POST مع الـ Params والـ Body)
router.put('/active-currency/:userId', currencyController.setActiveCurrencyPreference);
router.post('/active-preference', currencyController.setActiveCurrencyPreference);

module.exports = router;