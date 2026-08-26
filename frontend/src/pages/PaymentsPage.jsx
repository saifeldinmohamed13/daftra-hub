import React, { useState, useEffect, useCallback } from 'react';
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
    Tooltip,
    TextField,
    InputAdornment,
    Stack,
    useTheme,
    alpha
} from '@mui/material';
import {
    Search as SearchIcon,
    ArrowBackRounded as ArrowBackIcon,
    ReceiptLongRounded as InvoiceIcon,
    PersonRounded as ClientIcon,
    AccountBalanceWalletRounded as TreasuryIcon
} from '@mui/icons-material';
import API from '../services/api';
import Layout from '../components/Layout';
import { useLanguage } from '../LanguageContext';
import { getCurrencySymbol, getCurrencyFullName } from '../i18n/currencies';

const formatCurrency = (val) => {
    const num = parseFloat(val || 0);
    return num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

const CurrencyDisplay = ({
    amount,
    baseAmount,
    currencyCode,
    baseCurrencyCode,
    exchangeRate,
    isUnified = false,
    displayCurrency,
    lang,
    isBold = false,
    color = 'text.primary',
    size = 'body2'
}) => {
    const rate = parseFloat(exchangeRate || 1);
    const activeCurr = (isUnified ? displayCurrency : (baseCurrencyCode || 'EGP')).toUpperCase();
    const invCurr = (currencyCode || 'EGP').toUpperCase();

    const isForeign = !isUnified && (invCurr !== activeCurr && rate !== 1);

    const origVal = parseFloat(amount || 0);
    const baseVal = baseAmount !== undefined && baseAmount !== null 
        ? parseFloat(baseAmount || 0) 
        : origVal * rate;

    const origFullName = getCurrencyFullName(invCurr, lang);
    const activeFullName = getCurrencyFullName(activeCurr, lang);

    const origSymbol = getCurrencySymbol(invCurr, lang);
    const activeSymbol = getCurrencySymbol(activeCurr, lang);

    const fontSize = size === 'caption' ? '11px' : '13px';
    const subFontSize = size === 'caption' ? '9.5px' : '11px';

    if (!isForeign) {
        return (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant={size} sx={{ fontSize, fontWeight: isBold ? 700 : 500, color }}>
                    <bdi>{formatCurrency(baseVal)}</bdi>
                </Typography>
                <Tooltip title={activeFullName} arrow placement="top">
                    <Typography
                        component="span"
                        variant={size}
                        sx={{
                            fontSize,
                            fontWeight: isBold ? 700 : 600,
                            color: color !== 'text.primary' ? color : 'text.secondary',
                            cursor: 'pointer',
                        }}
                    >
                        ({activeSymbol})
                    </Typography>
                </Tooltip>
            </Box>
        );
    }

    const tooltipTitle = `1 ${origSymbol} = ${formatCurrency(rate)} ${activeSymbol} (${activeFullName})`;

    return (
        <Box sx={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant={size} sx={{ fontSize, fontWeight: isBold ? 700 : 600, color }}>
                    <bdi>{formatCurrency(baseVal)}</bdi>
                </Typography>
                <Tooltip title={activeFullName} arrow placement="top">
                    <Typography
                        component="span"
                        variant={size}
                        sx={{ fontSize, fontWeight: 700, color: color !== 'text.primary' ? color : 'text.secondary', cursor: 'pointer' }}
                    >
                        ({activeSymbol})
                    </Typography>
                </Tooltip>
            </Box>

            <Tooltip title={tooltipTitle} arrow placement="top">
                <Typography
                    variant="caption"
                    sx={{
                        fontSize: subFontSize,
                        color: color !== 'text.primary' ? color : 'text.secondary',
                        fontWeight: 500,
                        cursor: 'pointer',
                        width: 'fit-content',
                        mt: 0.1
                    }}
                >
                    <bdi>{formatCurrency(origVal)}</bdi> ({origSymbol})
                </Typography>
            </Tooltip>
        </Box>
    );
};

const PaymentsPage = () => {
    const navigate = useNavigate();
    const theme = useTheme();
    const [searchParams, setSearchParams] = useSearchParams();
    const { t, lang } = useLanguage();
    const isRtl = lang === 'ar' || t.dir === 'rtl';

    const userId = localStorage.getItem('userId');

    // 🎯 قراءة accountId من الـ Query Params للتصفية بناءً على الفرع عند التحويل
    const accountId = searchParams.get('accountId');

    const page = parseInt(searchParams.get('page') || '1', 10);
    const rowsPerPage = parseInt(searchParams.get('limit') || '10', 10);

    const [loading, setLoading] = useState(true);
    const [payments, setPayments] = useState([]);
    const [filteredPayments, setFilteredPayments] = useState([]);

    const [searchTerm, setSearchTerm] = useState('');
    const [paymentTypeFilter, setPaymentTypeFilter] = useState('ALL');
    const [methodFilter, setMethodFilter] = useState('ALL');

    const fetchCurrencySettings = useCallback(async () => {
        try {
            const res = await API.get(`/currency/settings/${userId}`);
            const { is_unified_enabled, active_currency } = res.data || {};
            const savedLocalCurr = localStorage.getItem('hub_active_currency');

            if (is_unified_enabled) {
                return savedLocalCurr || active_currency || 'DEFAULT';
            }
            return 'DEFAULT';
        } catch (err) {
            console.error('Error fetching currency settings:', err);
            return 'DEFAULT';
        }
    }, [userId]);

    const fetchPayments = useCallback(async () => {
        setLoading(true);
        try {
            const currentTargetCurr = await fetchCurrencySettings();
            const params = {};
            if (currentTargetCurr !== 'DEFAULT') {
                params.targetCurrency = currentTargetCurr;
            }
            
            // 🎯 إضافة accountId للبارامترات لو متواجد للفلترة بالفرع
            if (accountId) {
                params.accountId = accountId;
            }

            const response = await API.get(`/financial/payments/${userId}`, { params });
            if (response.data) {
                let validPayments = (response.data || []).filter(
                    p => p.payment_method?.toLowerCase() !== 'starting_balance'
                );

                // 🎯 تصفية الفرع بداخل الفرونت إند لضمان العرض الدقيق فقط للفرع المحدد
                if (accountId) {
                    validPayments = validPayments.filter(p => String(p.account_id) === String(accountId));
                }

                setPayments(validPayments);
            }
        } catch (err) {
            console.error('Failed fetching payments list:', err);
        } finally {
            setLoading(false);
        }
    }, [userId, accountId, fetchCurrencySettings]);

    useEffect(() => {
        if (userId) {
            if (!searchParams.get('page') || !searchParams.get('limit')) {
                const newParams = { page: String(page), limit: String(rowsPerPage) };
                if (accountId) newParams.accountId = accountId;
                setSearchParams(newParams, { replace: true });
            }
            fetchPayments();
        }
    }, [searchParams, userId, accountId, page, rowsPerPage, fetchPayments, setSearchParams]);

    useEffect(() => {
        let result = [...payments];

        if (paymentTypeFilter !== 'ALL') {
            result = result.filter(p => p.payment_type === paymentTypeFilter);
        }

        if (methodFilter !== 'ALL') {
            result = result.filter(p => p.payment_method?.toLowerCase() === methodFilter.toLowerCase());
        }

        if (searchTerm.trim() !== '') {
            const term = searchTerm.toLowerCase();
            result = result.filter(p =>
                (p.invoice_no && p.invoice_no.toLowerCase().includes(term)) ||
                (p.client_name && p.client_name.toLowerCase().includes(term)) ||
                (p.daftra_payment_id && p.daftra_payment_id.toString().includes(term)) ||
                (p.notes && p.notes.toLowerCase().includes(term)) ||
                (p.treasury_name && p.treasury_name.toLowerCase().includes(term))
            );
        }

        result.sort((a, b) => {
            const timeA = new Date(a.payment_date).getTime();
            const timeB = new Date(b.payment_date).getTime();
            if (timeA !== timeB) return timeB - timeA;
            return parseInt(b.daftra_payment_id || b.id, 10) - parseInt(a.daftra_payment_id || a.id, 10);
        });

        setFilteredPayments(result);
    }, [searchTerm, paymentTypeFilter, methodFilter, payments]);

    const totalRows = filteredPayments.length;
    const totalPages = Math.ceil(totalRows / rowsPerPage) || 1;
    const paginatedPayments = filteredPayments.slice((page - 1) * rowsPerPage, page * rowsPerPage);

    const handlePageNumberChange = (event, newPage) => {
        const newParams = { page: String(newPage), limit: String(rowsPerPage) };
        if (accountId) newParams.accountId = accountId;
        setSearchParams(newParams);
    };

    const handleChangeRowsPerPage = (event) => {
        const newLimit = event.target.value;
        const newParams = { page: '1', limit: String(newLimit) };
        if (accountId) newParams.accountId = accountId;
        setSearchParams(newParams);
    };

    const handleBackNavigation = () => {
        if (accountId) {
            navigate(`/dashboard/branch/${accountId}`);
        } else {
            navigate('/dashboard');
        }
    };

    const renderPaymentTypeBadge = (type) => {
        switch (type) {
            case 'invoice_payment':
                return <Chip label={t.typeInvoicePayment || (lang === 'ar' ? 'تحصيل فاتورة' : 'Invoice Payment')} color="success" size="small" sx={{ fontWeight: 700, fontSize: '11px', height: 22 }} />;
            case 'invoice_return':
                return <Chip label={t.typeInvoiceReturn || (lang === 'ar' ? 'مرتجع فاتورة' : 'Invoice Return')} color="error" size="small" sx={{ fontWeight: 700, fontSize: '11px', height: 22 }} />;
            case 'client_credit_plus':
                return <Chip label={t.typeClientCreditPlus || (lang === 'ar' ? 'رصيد دائن (+)' : 'Client Credit (+)')} color="info" size="small" sx={{ fontWeight: 700, fontSize: '11px', height: 22 }} />;
            case 'client_debit_minus':
                return <Chip label={t.typeClientDebitMinus || (lang === 'ar' ? 'رصيد مدين (-)' : 'Client Due (-)')} color="warning" size="small" sx={{ fontWeight: 700, fontSize: '11px', height: 22 }} />;
            default:
                return <Chip label={type} color="default" size="small" sx={{ fontWeight: 700, fontSize: '11px', height: 22 }} />;
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
        minWidth: 140,
    });

    return (
        <Layout title={t.navPayments || (lang === 'ar' ? 'المدفوعات والمقبوضات' : 'Payments & Receipts')}>
            <Box sx={{ mb: 3 }}>
                <Button 
                    size="small" 
                    startIcon={!isRtl ? backArrow : undefined}
                    endIcon={isRtl ? backArrow : undefined}
                    onClick={handleBackNavigation}
                >
                    {accountId 
                        ? (lang === 'ar' ? 'العودة للوحة الفرع' : 'Back to Branch Dashboard') 
                        : (t.backToGlobalWorkspace || (lang === 'ar' ? 'العودة للوحة الرئيسية' : 'Back to Dashboard'))}
                </Button>
            </Box>

            <Card sx={{ mb: 3, boxShadow: '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                <CardContent sx={{ p: 2 }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems="center">
                        <TextField
                            placeholder={t.searchPaymentsPlaceholder || (lang === 'ar' ? 'البحث برقم العملية، الفاتورة، العميل أو الملاحظات...' : 'Search by ID, Invoice #, or Client Name...')}
                            value={searchTerm}
                            onChange={(e) => { 
                                setSearchTerm(e.target.value); 
                                const newParams = { page: '1', limit: String(rowsPerPage) };
                                if (accountId) newParams.accountId = accountId;
                                setSearchParams(newParams); 
                            }}
                            size="small"
                            sx={{ minWidth: 320, flexGrow: 1 }}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon fontSize="small" />
                                    </InputAdornment>
                                ),
                            }}
                        />

                        <Select
                            value={paymentTypeFilter}
                            onChange={(e) => { 
                                setPaymentTypeFilter(e.target.value); 
                                const newParams = { page: '1', limit: String(rowsPerPage) };
                                if (accountId) newParams.accountId = accountId;
                                setSearchParams(newParams); 
                            }}
                            size="small"
                            sx={{ minWidth: 180 }}
                        >
                            <MenuItem value="ALL">{t.allPaymentTypes || (lang === 'ar' ? 'جميع أنواع المدفوعات' : 'All Payment Types')}</MenuItem>
                            <MenuItem value="invoice_payment">{t.typeInvoicePayment || (lang === 'ar' ? 'تحصيل فاتورة' : 'Invoice Payment')}</MenuItem>
                            <MenuItem value="invoice_return">{t.typeInvoiceReturn || (lang === 'ar' ? 'مرتجع فاتورة' : 'Invoice Return')}</MenuItem>
                            <MenuItem value="client_credit_plus">{t.typeClientCreditPlus || (lang === 'ar' ? 'رصيد دائن (+)' : 'Client Credit (+)')}</MenuItem>
                            <MenuItem value="client_debit_minus">{t.typeClientDebitMinus || (lang === 'ar' ? 'رصيد مدين (-)' : 'Client Due (-)')}</MenuItem>
                        </Select>

                        <Select
                            value={methodFilter}
                            onChange={(e) => { 
                                setMethodFilter(e.target.value); 
                                const newParams = { page: '1', limit: String(rowsPerPage) };
                                if (accountId) newParams.accountId = accountId;
                                setSearchParams(newParams); 
                            }}
                            size="small"
                            sx={{ minWidth: 150 }}
                        >
                            <MenuItem value="ALL">{t.allMethods || (lang === 'ar' ? 'طريقة الدفع' : 'Payment Method')}</MenuItem>
                            <MenuItem value="cash">{lang === 'ar' ? 'نقداً (Cash)' : 'Cash'}</MenuItem>
                            <MenuItem value="bank">{lang === 'ar' ? 'تحويل بنكي' : 'Bank Transfer'}</MenuItem>
                            <MenuItem value="client_credit">{lang === 'ar' ? 'رصيد دائن' : 'Client Credit'}</MenuItem>
                        </Select>
                    </Stack>
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
                                <Table size="small" sx={{ minWidth: 1200 }}>
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
                                                # {t.paymentId || (lang === 'ar' ? 'رقم العملية' : 'Payment ID')}
                                            </TableCell>

                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 140 }}>{t.paymentType || (lang === 'ar' ? 'النوع' : 'Type')}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 170 }}>{t.referenceDoc || (lang === 'ar' ? 'الفاتورة / العميل' : 'Invoice / Client')}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 170 }}>{t.treasuryName || (lang === 'ar' ? 'اسم الخزينة / الحساب' : 'Treasury / Account')}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 170 }}>{t.accountAndBranch || (lang === 'ar' ? 'الحساب والفرع' : 'Account & Branch')}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 130 }}>{t.paymentMethod || (lang === 'ar' ? 'طريقة الدفع' : 'Method')}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 120 }}>{t.paymentDate || (lang === 'ar' ? 'تاريخ العملية' : 'Date')}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 150 }}>{t.amount || (lang === 'ar' ? 'المبلغ' : 'Amount')}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 180 }}>{t.notes || (lang === 'ar' ? 'الملاحظات' : 'Notes')}</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {paginatedPayments.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={9} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                                                    {t.noPaymentsFound || (lang === 'ar' ? 'لا توجد عمليات مدفوعات مسجلة لهذا الفرع.' : 'No payment transactions recorded for this branch.')}
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            paginatedPayments.map((p) => {
                                                const amountVal = parseFloat(p.amount || 0);

                                                return (
                                                    <TableRow 
                                                        key={p.id} 
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
                                                            #{p.daftra_payment_id || p.id}
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 1.8 }}>
                                                            {renderPaymentTypeBadge(p.payment_type)}
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 600, py: 1.8 }}>
                                                            {p.invoice_no ? (
                                                                <Stack direction="row" spacing={0.5} alignItems="center">
                                                                    <InvoiceIcon fontSize="small" color="action" />
                                                                    <Typography variant="body2" sx={{ fontSize: '13px', fontWeight: 600 }}>
                                                                        {lang === 'ar' ? `فاتورة #${p.invoice_no}` : `Invoice #${p.invoice_no}`}
                                                                    </Typography>
                                                                </Stack>
                                                            ) : p.client_name ? (
                                                                <Stack direction="row" spacing={0.5} alignItems="center">
                                                                    <ClientIcon fontSize="small" color="action" />
                                                                    <Typography variant="body2" sx={{ fontSize: '13px', fontWeight: 600 }}>
                                                                        {p.client_name}
                                                                    </Typography>
                                                                </Stack>
                                                            ) : p.client_id ? (
                                                                <Typography variant="body2" sx={{ fontSize: '13px', fontWeight: 600 }}>
                                                                    {lang === 'ar' ? `عميل #${p.client_id}` : `Client #${p.client_id}`}
                                                                </Typography>
                                                            ) : '—'}
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 1.8 }}>
                                                            {p.treasury_name ? (
                                                                <Stack direction="row" spacing={0.5} alignItems="center">
                                                                    <TreasuryIcon fontSize="small" color="action" />
                                                                    <Typography variant="body2" sx={{ fontSize: '12.5px', fontWeight: 600, color: 'text.primary' }}>
                                                                        {p.treasury_name}
                                                                    </Typography>
                                                                </Stack>
                                                            ) : (
                                                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '12px' }}>
                                                                    —
                                                                </Typography>
                                                            )}
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 1.8 }}>
                                                            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                                                <Typography variant="body2" sx={{ fontSize: '13px', fontWeight: 600, color: 'text.primary' }}>
                                                                    {p.account_name || '—'}
                                                                </Typography>
                                                                {p.branch_name && (
                                                                    <Typography variant="caption" sx={{ fontSize: '11px', color: 'primary.main', fontWeight: 500 }}>
                                                                        {p.branch_name}
                                                                    </Typography>
                                                                )}
                                                            </Box>
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 1.8 }}>
                                                            <Chip 
                                                                label={p.payment_method || 'cash'} 
                                                                variant="outlined" 
                                                                size="small" 
                                                                sx={{ textTransform: 'capitalize', fontSize: '11px', fontWeight: 600, height: 22 }} 
                                                            />
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontSize: '12px', color: 'text.secondary', py: 1.8 }}>
                                                            <bdi>{p.payment_date ? new Date(p.payment_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : '—'}</bdi>
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 1.8 }}>
                                                            <CurrencyDisplay
                                                                amount={p.amount}
                                                                baseAmount={p.base_amount}
                                                                currencyCode={p.currency_code}
                                                                baseCurrencyCode={p.account_base_currency || 'EGP'}
                                                                exchangeRate={p.exchange_rate}
                                                                isUnified={p.is_unified}
                                                                displayCurrency={p.display_currency}
                                                                lang={lang}
                                                                isBold
                                                                color={amountVal < 0 ? 'error.main' : 'success.main'}
                                                            />
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 1.8, color: 'text.secondary', fontSize: '12px' }}>
                                                            {p.notes || '—'}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>

                            <Box 
                                sx={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justify: 'space-between', 
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

export default PaymentsPage;