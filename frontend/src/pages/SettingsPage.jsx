import React, { useState, useEffect } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    FormControlLabel,
    Switch,
    TextField,
    Button,
    Snackbar,
    Alert,
    Divider,
    Paper,
    CircularProgress,
    Grid,
    Autocomplete
} from '@mui/material';
import {
    SaveRounded as SaveIcon,
    PaidRounded as CurrencyIcon,
    CurrencyExchangeRounded as ExchangeIcon,
    AccountBalanceRounded as MainAccountIcon
} from '@mui/icons-material';
import API from '../services/api';
import Layout from '../components/Layout';
import { useLanguage } from '../LanguageContext';
import { getCurrencyFullName } from '../i18n/translations';

const worldCurrencies = [
    'USD', 'EUR', 'GBP', 'AED', 'KWD', 'BHD', 'QAR', 'OMR', 'JOD',
    'TRY', 'CAD', 'AUD', 'CHF', 'CNY', 'JPY', 'MAD', 'DZD', 'TND'
];

const SettingsPage = () => {
    const { t, lang } = useLanguage();
    const isRtl = lang === 'ar' || t.dir === 'rtl';
    const userId = localStorage.getItem('userId');

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [isUnifiedEnabled, setIsUnifiedEnabled] = useState(false);
    const [activeAccountCurrencies, setActiveAccountCurrencies] = useState([]);
    const [selectedTargetCurrencies, setSelectedTargetCurrencies] = useState([]);
    const [exchangeRatesMap, setExchangeRatesMap] = useState({});

    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    const fetchData = async () => {
        setLoading(true);
        try {
            const sysCurrRes = await API.get(`/currency/system-currencies/${userId}`);
            const accountCurrs = (sysCurrRes.data?.activeAccountCurrencies || ['EGP']).map(c => c.toUpperCase().trim());
            setActiveAccountCurrencies(accountCurrs);

            const settingsRes = await API.get(`/currency/settings/${userId}`);
            const { is_unified_enabled, rates } = settingsRes.data || {};

            setIsUnifiedEnabled(!!is_unified_enabled);

            const savedRates = rates || [];
            const targetCurrsSet = new Set();
            const initialRatesMap = {};

            savedRates.forEach((r) => {
                const target = r.from_currency.toUpperCase().trim();
                const source = r.to_currency.toUpperCase().trim();

                if (!accountCurrs.includes(target)) {
                    targetCurrsSet.add(target);
                }
                initialRatesMap[`${target}___${source}`] = r.exchange_value;
            });

            setSelectedTargetCurrencies(Array.from(targetCurrsSet));
            setExchangeRatesMap(initialRatesMap);

        } catch (err) {
            console.error('Failed fetching currency settings:', err);
            setSnackbar({ open: true, message: 'Failed loading settings', severity: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (userId) fetchData();
    }, [userId]);

    const handleRateChange = (targetCurr, sourceCurr, val) => {
        setExchangeRatesMap(prev => ({
            ...prev,
            [`${targetCurr}___${sourceCurr}`]: val
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const ratesArray = [];

            Object.entries(exchangeRatesMap).forEach(([key, val]) => {
                const [targetCurr, sourceCurr] = key.split('___');
                const numVal = parseFloat(val);

                const isMainConversion = activeAccountCurrencies.includes(targetCurr);
                const isSelectedAdditional = selectedTargetCurrencies.includes(targetCurr);

                // 🎯 حفظ أسعار تحويل عملات الحسابات المربوطة دائماً + أسعار العملات الخارجية الإضافية
                if ((isMainConversion || (isUnifiedEnabled && isSelectedAdditional)) && targetCurr && sourceCurr && !isNaN(numVal) && numVal > 0) {
                    ratesArray.push({
                        from_currency: targetCurr,
                        to_currency: sourceCurr,
                        exchange_value: numVal
                    });
                }
            });

            const payload = {
                userId,
                is_unified_enabled: isUnifiedEnabled, // 👈 يحدد فقط تفعيل القائمة المنسدلة للتوحيد كـ Feature باللوحات
                active_currency: isUnifiedEnabled ? (selectedTargetCurrencies[0] || activeAccountCurrencies[0] || 'DEFAULT') : 'DEFAULT',
                rates: ratesArray
            };

            await API.post('/currency/settings', payload);
            setSnackbar({ open: true, message: 'Currency settings saved successfully', severity: 'success' });
            
            fetchData();
        } catch (err) {
            console.error('Failed saving currency settings:', err);
            setSnackbar({ open: true, message: 'Failed saving settings', severity: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const availableAdditionalCurrencies = worldCurrencies.filter(
        c => !activeAccountCurrencies.includes(c)
    );

    return (
        <Layout title={t.settingsTitle || 'System Settings'}>
            <Box sx={{ maxWidth: 680, mx: 'auto', mt: 3, mb: 4 }}>
                <Card sx={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)', borderRadius: 3 }}>
                    <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                                <CurrencyIcon color="primary" sx={{ fontSize: 24 }} />
                                <Typography variant="h6" fontWeight={700} fontSize="17px">
                                    {t.settingsTitle || 'Unified Currency Settings'}
                                </Typography>
                            </Box>
                            
                            {/* 🎯 المفتاح مسئول فقط عن إظهار/إخفاء خيار "التوحيد الإجباري" كـ Feature باللوحة */}
                            <FormControlLabel
                                control={
                                    <Switch
                                        size="small"
                                        checked={isUnifiedEnabled}
                                        onChange={(e) => setIsUnifiedEnabled(e.target.checked)}
                                        color="primary"
                                    />
                                }
                                label={
                                    <Typography fontWeight={600} variant="body2" fontSize="13px">
                                        {t.enableUnifiedCurrency || 'Enable Unified Currency Reporting'}
                                    </Typography>
                                }
                                sx={{ mr: 0 }}
                            />
                        </Box>

                        <Divider sx={{ mb: 2.5 }} />

                        {loading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                <CircularProgress size={28} />
                            </Box>
                        ) : (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                                {/* 🟢 SECTION 1: التحويل المباشر بين عملات الحسابات المربوطة (يعمل ويحفظ دائماً بشكل مستقل عن الـ Switch) */}
                                {activeAccountCurrencies.length > 1 && (
                                    <Paper
                                        elevation={0}
                                        sx={{
                                            p: 2,
                                            borderRadius: 2,
                                            border: `1px solid`,
                                            borderColor: 'primary.light',
                                            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'action.hover' : '#f0f9ff'
                                        }}
                                    >
                                        <Typography variant="subtitle2" fontWeight={700} color="primary.main" fontSize="13px" sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.8 }}>
                                            <MainAccountIcon fontSize="small" />
                                            Primary Connected Accounts Conversion:
                                        </Typography>

                                        <Grid container spacing={2}>
                                            {activeAccountCurrencies.slice(1).map((subCurr) => {
                                                const mainCurr = activeAccountCurrencies[0];
                                                const key = `${subCurr}___${mainCurr}`;
                                                const val = exchangeRatesMap[key] || '';

                                                return (
                                                    <Grid item xs={12} sm={8} key={key}>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                            <Typography variant="body2" fontWeight={600} fontSize="13px" sx={{ minWidth: 70 }}>
                                                                1 {subCurr} =
                                                            </Typography>
                                                            <TextField
                                                                size="small"
                                                                type="number"
                                                                placeholder="e.g. 13.50"
                                                                value={val}
                                                                onChange={(e) => handleRateChange(subCurr, mainCurr, e.target.value)}
                                                                inputProps={{ step: 'any', min: '0' }}
                                                                sx={{ width: 120, bgcolor: 'background.paper', '& input': { py: 0.8, fontSize: '13px', fontWeight: 600 } }}
                                                            />
                                                            <Typography variant="body2" fontWeight={600} fontSize="13px">
                                                                {mainCurr}
                                                            </Typography>
                                                        </Box>
                                                    </Grid>
                                                );
                                            })}
                                        </Grid>
                                    </Paper>
                                )}

                                {/* 🔵 SECTION 2: إضافة عملات عرض إضافية خارجية (تظهر عند تشغيل خيار التقرير الموحد) */}
                                {isUnifiedEnabled && (
                                    <>
                                        <Box>
                                            <Typography variant="subtitle2" fontWeight={700} fontSize="13px" sx={{ mb: 1 }}>
                                                Select Additional Display Currencies (Not in your accounts):
                                            </Typography>
                                            <Autocomplete
                                                multiple
                                                options={availableAdditionalCurrencies}
                                                value={selectedTargetCurrencies}
                                                getOptionLabel={(code) => `${code} - ${getCurrencyFullName(code, lang)}`}
                                                onChange={(e, newValues) => {
                                                    setSelectedTargetCurrencies(newValues);

                                                    setExchangeRatesMap(prev => {
                                                        const updatedMap = { ...prev };
                                                        Object.keys(updatedMap).forEach(key => {
                                                            const [targetCurr] = key.split('___');
                                                            if (!newValues.includes(targetCurr) && !activeAccountCurrencies.includes(targetCurr)) {
                                                                delete updatedMap[key];
                                                            }
                                                        });
                                                        return updatedMap;
                                                    });
                                                }}
                                                renderInput={(params) => (
                                                    <TextField
                                                        {...params}
                                                        variant="outlined"
                                                        placeholder={selectedTargetCurrencies.length === 0 ? "Add External Currency (e.g. USD, EUR)" : ""}
                                                        size="small"
                                                        sx={{ '& input': { fontSize: '13px' } }}
                                                    />
                                                )}
                                                sx={{ borderRadius: 2 }}
                                            />
                                        </Box>

                                        {selectedTargetCurrencies.length > 0 && (
                                            <Box sx={{ mt: 0.5 }}>
                                                <Typography variant="subtitle2" fontWeight={700} fontSize="13px" sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.8 }}>
                                                    <ExchangeIcon fontSize="small" color="primary" />
                                                    External Currencies Rates Matrix:
                                                </Typography>

                                                {selectedTargetCurrencies.map((targetCurr) => (
                                                    <Paper
                                                        key={targetCurr}
                                                        elevation={0}
                                                        sx={{
                                                            p: 2,
                                                            mb: 1.5,
                                                            borderRadius: 2,
                                                            border: `1px solid`,
                                                            borderColor: 'divider',
                                                            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'action.hover' : '#f8fafc'
                                                        }}
                                                    >
                                                        <Typography variant="subtitle2" fontWeight={700} color="primary.main" fontSize="12px" sx={{ mb: 1 }}>
                                                            Rates for {getCurrencyFullName(targetCurr, lang)} ({targetCurr}):
                                                        </Typography>

                                                        <Grid container spacing={1.5}>
                                                            {activeAccountCurrencies.map((sourceCurr) => {
                                                                const key = `${targetCurr}___${sourceCurr}`;
                                                                const val = exchangeRatesMap[key] || '';

                                                                return (
                                                                    <Grid item xs={12} sm={6} key={sourceCurr}>
                                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                            <Typography variant="body2" fontWeight={600} fontSize="12px" sx={{ minWidth: 80 }}>
                                                                                1 {targetCurr} =
                                                                            </Typography>
                                                                            <TextField
                                                                                size="small"
                                                                                type="number"
                                                                                placeholder="e.g. 50"
                                                                                value={val}
                                                                                onChange={(e) => handleRateChange(targetCurr, sourceCurr, e.target.value)}
                                                                                inputProps={{ step: 'any', min: '0' }}
                                                                                sx={{ width: 110, bgcolor: 'background.paper', '& input': { py: 0.6, fontSize: '12px', fontWeight: 600 } }}
                                                                            />
                                                                            <Typography variant="body2" fontWeight={600} fontSize="12px">
                                                                                {sourceCurr}
                                                                            </Typography>
                                                                        </Box>
                                                                    </Grid>
                                                                );
                                                            })}
                                                        </Grid>
                                                    </Paper>
                                                ))}
                                            </Box>
                                        )}
                                    </>
                                )}

                                {/* زر الحفظ */}
                                <Box sx={{ display: 'flex', justifyContent: isRtl ? 'flex-start' : 'flex-end', mt: 1 }}>
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        size="small"
                                        disabled={saving}
                                        startIcon={!isRtl && !saving ? <SaveIcon fontSize="small" /> : undefined}
                                        endIcon={isRtl && !saving ? <SaveIcon fontSize="small" /> : undefined}
                                        onClick={handleSave}
                                        sx={{ px: 3, py: 0.8, borderRadius: 2, textTransform: 'none', fontWeight: 700, fontSize: '13px' }}
                                    >
                                        {saving ? <CircularProgress size={20} color="inherit" /> : 'Save Currency Settings'}
                                    </Button>
                                </Box>
                            </Box>
                        )}
                    </CardContent>
                </Card>
            </Box>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={3000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity={snackbar.severity} variant="filled" onClose={() => setSnackbar({ ...snackbar, open: false })}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Layout>
    );
};

export default SettingsPage;