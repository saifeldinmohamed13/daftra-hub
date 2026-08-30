import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
    Box,
    Card,
    CardContent,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    TableContainer,
    Paper,
    Button,
    CircularProgress,
    Pagination,
    Select,
    MenuItem,
    Typography,
    Chip,
    TextField,
    InputAdornment,
    Grid,
    useTheme,
    alpha
} from '@mui/material';
import {
    Search as SearchIcon,
    ArrowBackRounded as ArrowBackIcon
} from '@mui/icons-material';
import API from '../services/api';
import Layout from '../components/Layout';
import CurrencyDisplay from '../components/CurrencyDisplay'; // 👈 المكون الخارجي الموحد
import { useLanguage } from '../LanguageContext';
import { getCurrencySymbol } from '../i18n/currencies';
import { formatCurrency } from '../utils/formatters';

const getPaymentStatusMap = (t) => ({
    0: { label: t.statusUnpaid || 'غير مدفوع', color: 'warning' },
    1: { label: t.statusPartial || 'مدفوع جزئياً', color: 'info' },
    2: { label: t.statusPaid || 'مدفوع', color: 'success' },
    3: { label: t.statusReturned || 'مرتجع', color: 'error' },
});

const PaymentStatusChip = ({ statusId, t }) => {
    const statusMap = getPaymentStatusMap(t);
    const status = statusMap[parseInt(statusId, 10)] || { label: t.statusUnknown || 'غير محدد', color: 'default' };
    return <Chip label={status.label} color={status.color} size="small" variant="filled" sx={{ fontSize: '11px', fontWeight: 700, height: 22 }} />;
};

const getDeliveryStatusMap = (t) => ({
    1: { label: t.deliveryReceived || 'مُسلَّم', color: 'success' },
    2: { label: t.deliveryRejected || 'مرفوض', color: 'error' },
    3: { label: t.deliveryPending || 'تحت التسليم', color: 'warning' },
    4: { label: t.deliveryPartialReceived || 'مُسلَّم جزئياً', color: 'info' },
    5: { label: t.deliveryPartialRejected || 'مرفوض جزئياً', color: 'default' },
});

const DeliveryStatusChip = ({ statusId, t }) => {
    if (statusId === null || statusId === undefined || statusId === 0) {
        return <Chip label={t.deliveryDirect || 'تسليم مباشر'} size="small" variant="outlined" color="primary" sx={{ fontSize: '11px', fontWeight: 600, height: 22 }} />;
    }
    const statusMap = getDeliveryStatusMap(t);
    const status = statusMap[parseInt(statusId, 10)] || { label: t.statusUnknown || 'غير محدد', color: 'default' };
    return <Chip label={status.label} color={status.color} size="small" variant="outlined" sx={{ fontSize: '11px', fontWeight: 600, height: 22 }} />;
};

const InvoicesPage = () => {
    const navigate = useNavigate();
    const theme = useTheme();
    const [searchParams, setSearchParams] = useSearchParams();
    const { t, lang } = useLanguage();
    const isRtl = lang === 'ar' || t.dir === 'rtl';

    const accountId = searchParams.get('accountId'); 
    const userId = localStorage.getItem('userId');

    const page = parseInt(searchParams.get('page') || '1', 10); 
    const rowsPerPage = parseInt(searchParams.get('limit') || '10', 10);

    const [loading, setLoading] = useState(true);
    const [invoices, setInvoices] = useState([]);
    
    // 🎯 حالات الفلترة والسيرش المحلية
    const [searchTerm, setSearchTerm] = useState('');
    const [paymentStatusFilter, setPaymentStatusFilter] = useState('ALL');
    const [deliveryStatusFilter, setDeliveryStatusFilter] = useState('ALL');
    const [accountOrBranchFilter, setAccountOrBranchFilter] = useState('ALL');

    const fetchCurrencySettings = useCallback(async () => {
        try {
            const res = await API.get(`/currency/settings/${userId}`);
            const { is_unified_enabled, active_currency } = res.data || {};
            const savedLocalCurr = localStorage.getItem('hub_active_currency');

            if (is_unified_enabled) {
                return savedLocalCurr || active_currency || 'DEFAULT';
            } else {
                return 'DEFAULT';
            }
        } catch (err) {
            console.error('Error fetching currency settings:', err);
            return 'DEFAULT';
        }
    }, [userId]);

    const fetchInvoices = useCallback(async () => {
        setLoading(true);
        try {
            const currentTargetCurr = await fetchCurrencySettings();

            const params = {
                userId: accountId ? undefined : userId,
                accountId: accountId || undefined,
                targetCurrency: currentTargetCurr !== 'DEFAULT' ? currentTargetCurr : undefined
            };

            const response = await API.get('/financial/ledgers/paginated', { params: { ...params, limit: 1000 } });
            if (response.data) {
                const invoiceData = response.data.data || [];
                
                const sortedInvoices = [...invoiceData].sort((a, b) => {
                    const numA = parseInt(a.invoice_no, 10) || 0;
                    const numB = parseInt(b.invoice_no, 10) || 0;
                    if (numA !== 0 && numB !== 0) {
                        return numB - numA;
                    }
                    return String(b.invoice_no || '').localeCompare(String(a.invoice_no || ''), undefined, { numeric: true, sensitivity: 'base' });
                });

                setInvoices(sortedInvoices);
            }
        } catch (err) {
            console.error('Failed compiling core invoice node ledger:', err);
        } finally {
            setLoading(false);
        }
    }, [accountId, userId, fetchCurrencySettings]);

    // 🎯 جلب البيانات من السيرفر مرة واحدة عند تغيير المعلمات الأساسية
    useEffect(() => {
        if (userId) {
            fetchInvoices();
        }
    }, [userId, accountId, fetchInvoices]);

    // 🎯 تهيئة الـ URL بدون التسبب في إعادة طلب API مع كل صفحة
    useEffect(() => {
        if (!searchParams.get('page') || !searchParams.get('limit')) {
            setSearchParams({
                accountId: accountId || '',
                page: String(page),
                limit: String(rowsPerPage)
            }, { replace: true });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 🎯 استخراج الحسابات / الفروع المتاحة ديناميكياً من الداتا
    const availableAccountsOrBranches = useMemo(() => {
        const map = new Map();
        invoices.forEach(inv => {
            if (accountId) {
                const branchKey = inv.branch_name || inv.branch_id || 'Main Branch';
                if (!map.has(branchKey)) {
                    map.set(branchKey, inv.branch_name || (lang === 'ar' ? 'الفرع الرئيسي' : 'Main Branch'));
                }
            } else {
                if (inv.account_id && !map.has(String(inv.account_id))) {
                    map.set(String(inv.account_id), inv.account_name || `Account #${inv.account_id}`);
                }
            }
        });
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [invoices, accountId, lang]);

    // 🎯 تصفية الفواتير بناءً على الفلاتر والسيرش
    const filteredInvoices = useMemo(() => {
        let result = [...invoices];

        if (paymentStatusFilter !== 'ALL') {
            result = result.filter(inv => String(inv.payment_status) === String(paymentStatusFilter));
        }

        if (deliveryStatusFilter !== 'ALL') {
            result = result.filter(inv => {
                const delStatus = inv.requisition_delivery_status ?? 0;
                return String(delStatus) === String(deliveryStatusFilter);
            });
        }

        if (accountOrBranchFilter !== 'ALL') {
            if (accountId) {
                result = result.filter(inv => (inv.branch_name || 'Main Branch') === accountOrBranchFilter);
            } else {
                result = result.filter(inv => String(inv.account_id) === String(accountOrBranchFilter));
            }
        }

        if (searchTerm.trim() !== '') {
            const term = searchTerm.toLowerCase();
            result = result.filter(inv =>
                (inv.invoice_no && inv.invoice_no.toString().toLowerCase().includes(term)) ||
                (inv.account_name && inv.account_name.toLowerCase().includes(term)) ||
                (inv.branch_name && inv.branch_name.toLowerCase().includes(term))
            );
        }

        return result;
    }, [invoices, paymentStatusFilter, deliveryStatusFilter, accountOrBranchFilter, searchTerm, accountId]);

    const totalRows = filteredInvoices.length;
    const totalPages = Math.ceil(totalRows / rowsPerPage) || 1;
    const paginatedInvoices = filteredInvoices.slice((page - 1) * rowsPerPage, page * rowsPerPage);

    const updateParamsOnFilter = () => {
        setSearchParams({
            accountId: accountId || '',
            page: '1',
            limit: String(rowsPerPage)
        });
    };

    const handlePageNumberChange = (event, newPage) => {
        setSearchParams({
            accountId: accountId || '',
            page: String(newPage),
            limit: String(rowsPerPage)
        });
    };

    const handleChangeRowsPerPage = (event) => {
        const newLimit = event.target.value;
        setSearchParams({
            accountId: accountId || '',
            page: '1', 
            limit: String(newLimit)
        });
    };

    const handleBackNavigation = () => {
        if (accountId) {
            navigate(`/dashboard/branch/${accountId}`);
        } else {
            navigate('/dashboard');
        }
    };

    const backArrow = <ArrowBackIcon sx={isRtl ? { transform: 'scaleX(-1)' } : undefined} />;

    const getStickyCellStyle = (isHeader = false) => ({
        position: 'sticky',
        insetInlineStart: 0,
        zIndex: isHeader ? 10 : 5,
        backgroundColor: theme.palette.background.paper,
        backgroundImage: 'none',
        borderInlineEnd: `1px solid ${theme.palette.divider}`,
        minWidth: 160,
    });

    return (
        <Layout title={t.allInvoicesTitle || (lang === 'ar' ? 'سجل الفواتير الشامل' : 'Master Invoices Ledger')}>
            <Box sx={{ mb: 2 }}>
                <Button 
                    size="small" 
                    startIcon={!isRtl ? backArrow : undefined}
                    endIcon={isRtl ? backArrow : undefined}
                    onClick={handleBackNavigation}
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                    {accountId ? (t.backToBranch || (lang === 'ar' ? 'العودة للفرع' : 'Back to Branch')) : (t.backToGlobalWorkspace || (lang === 'ar' ? 'العودة للوحة الرئيسية' : 'Back to Dashboard'))}
                </Button>
            </Box>

            {/* 🎯 شريط السيرش والفلترة */}
            <Card sx={{ mb: 2.5, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Grid container spacing={1.5} alignItems="center">
                        <Grid item xs={12} md={3.5}>
                            <TextField
                                fullWidth
                                placeholder={lang === 'ar' ? 'البحث برقم الفاتورة، الحساب أو الفرع...' : 'Search by Invoice #, Account, Branch...'}
                                value={searchTerm}
                                onChange={(e) => { 
                                    setSearchTerm(e.target.value); 
                                    updateParamsOnFilter();
                                }}
                                size="small"
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                                        </InputAdornment>
                                    ),
                                    sx: { height: 36, fontSize: '13px' }
                                }}
                            />
                        </Grid>

                        {/* 🎯 فلتر حالة الدفع */}
                        <Grid item xs={6} sm={4} md={2.5}>
                            <Select
                                fullWidth
                                value={paymentStatusFilter}
                                onChange={(e) => { 
                                    setPaymentStatusFilter(e.target.value); 
                                    updateParamsOnFilter();
                                }}
                                size="small"
                                sx={{ height: 36, fontSize: '13px' }}
                            >
                                <MenuItem value="ALL">{lang === 'ar' ? 'جميع حالات التحصيل' : 'All Payment Statuses'}</MenuItem>
                                <MenuItem value="2">{t.statusPaid || (lang === 'ar' ? 'مدفوع' : 'Paid')}</MenuItem>
                                <MenuItem value="1">{t.statusPartial || (lang === 'ar' ? 'مدفوع جزئياً' : 'Partially Paid')}</MenuItem>
                                <MenuItem value="0">{t.statusUnpaid || (lang === 'ar' ? 'غير مدفوع' : 'Unpaid')}</MenuItem>
                                <MenuItem value="3">{t.statusReturned || (lang === 'ar' ? 'مرتجع' : 'Returned')}</MenuItem>
                            </Select>
                        </Grid>

                        {/* 🎯 فلتر حالة التسليم */}
                        <Grid item xs={6} sm={4} md={2.5}>
                            <Select
                                fullWidth
                                value={deliveryStatusFilter}
                                onChange={(e) => { 
                                    setDeliveryStatusFilter(e.target.value); 
                                    updateParamsOnFilter();
                                }}
                                size="small"
                                sx={{ height: 36, fontSize: '13px' }}
                            >
                                <MenuItem value="ALL">{lang === 'ar' ? 'جميع حالات التسليم' : 'All Delivery Statuses'}</MenuItem>
                                <MenuItem value="0">{t.deliveryDirect || (lang === 'ar' ? 'تسليم مباشر' : 'Immediate')}</MenuItem>
                                <MenuItem value="3">{t.deliveryPending || (lang === 'ar' ? 'تحت التسليم' : 'Pending')}</MenuItem>
                                <MenuItem value="1">{t.deliveryReceived || (lang === 'ar' ? 'مُسلَّم' : 'Received')}</MenuItem>
                                <MenuItem value="4">{t.deliveryPartialReceived || (lang === 'ar' ? 'مُسلَّم جزئياً' : 'Partially Received')}</MenuItem>
                                <MenuItem value="2">{t.deliveryRejected || (lang === 'ar' ? 'مرفوض' : 'Rejected')}</MenuItem>
                            </Select>
                        </Grid>

                        {/* 🎯 فلتر الفروع أو الحسابات */}
                        <Grid item xs={12} sm={4} md={3.5}>
                            <Select
                                fullWidth
                                value={accountOrBranchFilter}
                                onChange={(e) => { 
                                    setAccountOrBranchFilter(e.target.value); 
                                    updateParamsOnFilter();
                                }}
                                size="small"
                                sx={{ height: 36, fontSize: '13px' }}
                            >
                                <MenuItem value="ALL">
                                    {accountId 
                                        ? (lang === 'ar' ? 'جميع الفروع' : 'All Branches')
                                        : (lang === 'ar' ? 'جميع الحسابات' : 'All Accounts')}
                                </MenuItem>
                                {availableAccountsOrBranches.map(item => (
                                    <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>
                                ))}
                            </Select>
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            <Card sx={{ boxShadow: '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
                    ) : (
                        <>
                            <TableContainer 
                                component={Paper} 
                                elevation={0} 
                                sx={{ 
                                    borderRadius: 0, 
                                    overflowX: 'auto', 
                                    position: 'relative',
                                    '& .MuiTable-root': {
                                        borderCollapse: 'separate',
                                        borderSpacing: 0,
                                    }
                                }}
                            >
                                <Table size="small" sx={{ minWidth: 1250 }}>
                                    <TableHead sx={{ bgcolor: alpha(theme.palette.action.hover, 0.05) }}>
                                        <TableRow>
                                            <TableCell 
                                                align={isRtl ? 'right' : 'left'}
                                                sx={{ 
                                                    fontWeight: 700, 
                                                    py: 2, 
                                                    px: 2,
                                                    color: 'text.primary',
                                                    ...getStickyCellStyle(true)
                                                }}
                                            >
                                                {t.documentId}
                                            </TableCell>

                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 180 }}>
                                                {!accountId ? (t.accountAndBranch || 'Account / Branch') : (t.branchLabel || 'Branch')}
                                            </TableCell>

                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 150 }}>{t.grossSubtotal || 'Gross Subtotal'}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 140 }}>{t.netRevenueLabel || 'Net Revenue'}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 120 }}>{t.taxLabel || 'Tax'}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 170 }}>{t.totalLabel || 'Gross Total'}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 140 }}>{t.cogsCostLabel || 'COGS Cost'}</TableCell>
                                            <TableCell sx={{ fontWeight: 700, py: 2, minWidth: 130 }} align="center">{t.paymentStatusLabel || 'Payment'}</TableCell>
                                            <TableCell sx={{ fontWeight: 700, py: 2, minWidth: 140 }} align="center">{t.deliveryStatusLabel || 'Delivery'}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, px: 2, minWidth: 130 }}>{t.createdAt}</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {paginatedInvoices.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={10} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                                                    {t.noTransactions || (lang === 'ar' ? 'لا توجد فواتير مطابقة للبحث.' : 'No matching invoices found.')}
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            paginatedInvoices.map((inv) => {
                                                const returnedAmount = parseFloat(inv.total_returned || 0);

                                                return (
                                                    <TableRow 
                                                        key={inv.id} 
                                                        hover 
                                                        sx={{ 
                                                            '&:hover .sticky-cell': { 
                                                                backgroundColor: theme.palette.mode === 'dark' ? '#1e293b' : '#f1f5f9'
                                                            } 
                                                        }}
                                                    >
                                                        <TableCell 
                                                            align={isRtl ? 'right' : 'left'}
                                                            className="sticky-cell"
                                                            sx={{ 
                                                                fontWeight: 700, 
                                                                py: 1.8, 
                                                                px: 2,
                                                                color: 'text.primary',
                                                                ...getStickyCellStyle(false)
                                                            }}
                                                        >
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                #{inv.invoice_no || 'N/A'}
                                                                {inv.is_return === 1 && (
                                                                    <Chip 
                                                                        label={t.statusReturned || (lang === 'ar' ? 'مرتجع' : 'Returned')} 
                                                                        size="small" 
                                                                        color="error" 
                                                                        variant="filled" 
                                                                        sx={{ height: 18, fontSize: '10px', fontWeight: 700 }} 
                                                                    />
                                                                )}
                                                                {inv.is_return === 2 && (
                                                                    <Chip 
                                                                        label={t.statusPartialReturned || (lang === 'ar' ? 'مرتجع جزئياً' : 'Partially Returned')} 
                                                                        size="small" 
                                                                        color="warning" 
                                                                        variant="filled" 
                                                                        sx={{ height: 18, fontSize: '10px', fontWeight: 700 }} 
                                                                    />
                                                                )}
                                                            </Box>
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ color: 'text.secondary', fontSize: '13px', py: 1.8 }}>
                                                            {!accountId ? (
                                                                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                                                    <Typography variant="body2" sx={{ fontSize: '13px', fontWeight: 600, color: 'text.primary' }}>
                                                                        {inv.account_name || '—'}
                                                                    </Typography>
                                                                    {inv.branch_name && (
                                                                        <Typography variant="caption" sx={{ fontSize: '11px', color: 'primary.main', fontWeight: 500 }}>
                                                                            {inv.branch_name}
                                                                        </Typography>
                                                                    )}
                                                                </Box>
                                                            ) : (
                                                                <Typography variant="body2" sx={{ fontSize: '13px', fontWeight: 600, color: 'text.primary' }}>
                                                                    {inv.branch_name || '—'}
                                                                </Typography>
                                                            )}
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 1.8 }}>
                                                            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                                                <CurrencyDisplay
                                                                    amount={inv.gross_subtotal}
                                                                    baseAmount={inv.base_gross_subtotal}
                                                                    currencyCode={inv.currency_code}
                                                                    baseCurrencyCode={inv.account_base_currency}
                                                                    exchangeRate={inv.exchange_rate}
                                                                    isUnified={inv.is_unified}
                                                                    displayCurrency={inv.display_currency}
                                                                    lang={lang}
                                                                />
                                                                {parseFloat(inv.total_discount || 0) > 0 && (
                                                                    <Typography variant="caption" color="error.main" sx={{ fontSize: '11px', fontWeight: 600, mt: 0.2 }}>
                                                                        -<bdi>{formatCurrency(inv.total_discount)}</bdi> {t.discount || 'Discount'}
                                                                    </Typography>
                                                                )}
                                                            </Box>
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 1.8 }}>
                                                            <CurrencyDisplay
                                                                amount={inv.net_revenue}
                                                                baseAmount={inv.base_net_revenue}
                                                                currencyCode={inv.currency_code}
                                                                baseCurrencyCode={inv.account_base_currency}
                                                                exchangeRate={inv.exchange_rate}
                                                                isUnified={inv.is_unified}
                                                                displayCurrency={inv.display_currency}
                                                                lang={lang}
                                                                isBold
                                                            />
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 1.8 }}>
                                                            <CurrencyDisplay
                                                                amount={inv.tax_amount}
                                                                baseAmount={inv.base_tax_amount}
                                                                currencyCode={inv.currency_code}
                                                                baseCurrencyCode={inv.account_base_currency}
                                                                exchangeRate={inv.exchange_rate}
                                                                isUnified={inv.is_unified}
                                                                displayCurrency={inv.display_currency}
                                                                lang={lang}
                                                                color="text.secondary"
                                                            />
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 1.8 }}>
                                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                                                                <CurrencyDisplay
                                                                    amount={inv.total_amount}
                                                                    baseAmount={inv.base_total_amount}
                                                                    currencyCode={inv.currency_code}
                                                                    baseCurrencyCode={inv.account_base_currency}
                                                                    exchangeRate={inv.exchange_rate}
                                                                    isUnified={inv.is_unified}
                                                                    displayCurrency={inv.display_currency}
                                                                    lang={lang}
                                                                    isBold
                                                                />

                                                                {returnedAmount > 0 && (
                                                                    <Typography variant="caption" color="error.main" sx={{ fontSize: '11px', fontWeight: 700, mt: 0.2 }}>
                                                                        -<bdi>{formatCurrency(returnedAmount)}</bdi> {getCurrencySymbol(inv.display_currency || inv.account_base_currency, lang)} ({lang === 'ar' ? 'مرتجع' : 'Returned'})
                                                                    </Typography>
                                                                )}

                                                                {parseInt(inv.payment_status, 10) === 1 && (
                                                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.1, mt: 0.2 }}>
                                                                        <CurrencyDisplay
                                                                            amount={inv.summary_paid}
                                                                            baseAmount={inv.base_summary_paid}
                                                                            currencyCode={inv.currency_code}
                                                                            baseCurrencyCode={inv.account_base_currency}
                                                                            exchangeRate={inv.exchange_rate}
                                                                            isUnified={inv.is_unified}
                                                                            displayCurrency={inv.display_currency}
                                                                            lang={lang}
                                                                            size="caption"
                                                                            color="success.main"
                                                                        />
                                                                        <CurrencyDisplay
                                                                            amount={inv.summary_unpaid}
                                                                            baseAmount={inv.base_summary_unpaid}
                                                                            currencyCode={inv.currency_code}
                                                                            baseCurrencyCode={inv.account_base_currency}
                                                                            exchangeRate={inv.exchange_rate}
                                                                            isUnified={inv.is_unified}
                                                                            displayCurrency={inv.display_currency}
                                                                            lang={lang}
                                                                            size="caption"
                                                                            color="warning.main"
                                                                        />
                                                                    </Box>
                                                                )}
                                                            </Box>
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 1.8 }}>
                                                            <CurrencyDisplay
                                                                amount={inv.total_cogs}
                                                                baseAmount={inv.total_cogs}
                                                                currencyCode={inv.account_base_currency || inv.currency_code}
                                                                baseCurrencyCode={inv.account_base_currency}
                                                                exchangeRate={1}
                                                                isUnified={inv.is_unified}
                                                                displayCurrency={inv.display_currency}
                                                                lang={lang}
                                                            />
                                                        </TableCell>

                                                        <TableCell align="center"><PaymentStatusChip statusId={inv.payment_status} t={t} /></TableCell>
                                                        <TableCell align="center"><DeliveryStatusChip statusId={inv.requisition_delivery_status} t={t} /></TableCell>
                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontSize: '12px', color: 'text.secondary', px: 2 }}>
                                                            <bdi>{new Date(inv.issue_date).toLocaleDateString()}</bdi>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>

                            {/* 🎯 FOOTER PAGINATION */}
                            <Box 
                                sx={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'space-between', 
                                    p: 2, 
                                    flexWrap: 'wrap',
                                    gap: 2,
                                    borderTop: `1px solid ${theme.palette.divider}`,
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                                        {t.rowsPerPage || (lang === 'ar' ? 'عدد الصفوف لكل صفحة:' : 'Rows per page:')}
                                    </Typography>
                                    <Select
                                        value={rowsPerPage}
                                        onChange={handleChangeRowsPerPage}
                                        size="small"
                                        variant="outlined"
                                        sx={{ height: 30, fontSize: '0.75rem', borderRadius: '4px', '.MuiOutlinedInput-input': { py: 0.5 } }}
                                    >
                                        {[5, 10, 20, 50].map((option) => (
                                            <MenuItem key={option} value={option} sx={{ fontSize: '0.75rem' }}>
                                                {option}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </Box>

                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                                        <bdi>{totalRows > 0 ? `${((page - 1) * rowsPerPage) + 1}-${Math.min(page * rowsPerPage, totalRows)} ${t.of || (lang === 'ar' ? 'من' : 'of')} ${totalRows}` : '0-0 of 0'}</bdi>
                                    </Typography>

                                    <Pagination
                                        count={totalPages || 1}
                                        page={page}
                                        onChange={handlePageNumberChange}
                                        color="primary"
                                        size="small"
                                        shape="rounded"
                                        showFirstButton
                                        showLastButton
                                        dir={isRtl ? 'rtl' : 'ltr'}
                                    />
                                </Box>
                            </Box>
                        </>
                    )}
                </CardContent>
            </Card>
        </Layout>
    );
};

export default InvoicesPage;