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
import CurrencyDisplay from '../components/CurrencyDisplay';
import { useLanguage } from '../LanguageContext';

const PaymentsPage = () => {
    const navigate = useNavigate();
    const theme = useTheme();
    const [searchParams, setSearchParams] = useSearchParams();
    const { t, lang } = useLanguage();
    const isRtl = lang === 'ar' || t.dir === 'rtl';

    const userId = localStorage.getItem('userId');
    const accountId = searchParams.get('accountId');

    const page = parseInt(searchParams.get('page') || '1', 10);
    const rowsPerPage = parseInt(searchParams.get('limit') || '10', 10);

    const [loading, setLoading] = useState(true);
    const [payments, setPayments] = useState([]);
    const [filteredPayments, setFilteredPayments] = useState([]);

    const [searchTerm, setSearchTerm] = useState('');
    const [paymentTypeFilter, setPaymentTypeFilter] = useState('ALL');
    const [methodFilter, setMethodFilter] = useState('ALL');
    const [treasuryFilter, setTreasuryFilter] = useState('ALL');
    const [accountOrBranchFilter, setAccountOrBranchFilter] = useState('ALL');

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
            
            if (accountId) {
                params.accountId = accountId;
            }

            const response = await API.get(`/financial/payments/${userId}`, { params });
            if (response.data) {
                let validPayments = (response.data || []).filter(
                    p => p.payment_method?.toLowerCase() !== 'starting_balance'
                );

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
            fetchPayments();
        }
    }, [userId, accountId, fetchPayments]);

    useEffect(() => {
        if (!searchParams.get('page') || !searchParams.get('limit')) {
            const newParams = { page: String(page), limit: String(rowsPerPage) };
            if (accountId) newParams.accountId = accountId;
            setSearchParams(newParams, { replace: true });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const availablePaymentTypes = useMemo(() => {
        const set = new Set();
        payments.forEach(p => {
            if (p.payment_type) set.add(p.payment_type);
        });
        return Array.from(set);
    }, [payments]);

    const availableTreasuries = useMemo(() => {
        const set = new Set();
        payments.forEach(p => {
            if (p.treasury_name) set.add(p.treasury_name);
        });
        return Array.from(set);
    }, [payments]);

    const availableMethods = useMemo(() => {
        const set = new Set();
        payments.forEach(p => {
            if (p.payment_method) set.add(p.payment_method.toLowerCase());
        });
        return Array.from(set);
    }, [payments]);

    const availableAccountsOrBranches = useMemo(() => {
        const map = new Map();
        payments.forEach(p => {
            if (accountId) {
                const branchKey = p.branch_name || p.branch_id || 'Main Branch';
                if (!map.has(branchKey)) {
                    map.set(branchKey, p.branch_name || (lang === 'ar' ? 'الفرع الرئيسي' : 'Main Branch'));
                }
            } else {
                if (p.account_id && !map.has(String(p.account_id))) {
                    map.set(String(p.account_id), p.account_name || `Account #${p.account_id}`);
                }
            }
        });
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [payments, accountId, lang]);

    useEffect(() => {
        let result = [...payments];

        if (paymentTypeFilter !== 'ALL') {
            result = result.filter(p => p.payment_type === paymentTypeFilter);
        }

        if (methodFilter !== 'ALL') {
            result = result.filter(p => p.payment_method?.toLowerCase() === methodFilter.toLowerCase());
        }

        if (treasuryFilter !== 'ALL') {
            result = result.filter(p => p.treasury_name === treasuryFilter);
        }

        if (accountOrBranchFilter !== 'ALL') {
            if (accountId) {
                result = result.filter(p => (p.branch_name || 'Main Branch') === accountOrBranchFilter);
            } else {
                result = result.filter(p => String(p.account_id) === String(accountOrBranchFilter));
            }
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
    }, [searchTerm, paymentTypeFilter, methodFilter, treasuryFilter, accountOrBranchFilter, payments, accountId]);

    const totalRows = filteredPayments.length;
    const totalPages = Math.ceil(totalRows / rowsPerPage) || 1;
    const paginatedPayments = filteredPayments.slice((page - 1) * rowsPerPage, page * rowsPerPage);

    const updateParamsOnFilter = () => {
        const newParams = { page: '1', limit: String(rowsPerPage) };
        if (accountId) newParams.accountId = accountId;
        setSearchParams(newParams);
    };

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

    const getPaymentTypeLabel = (type) => {
        switch (type) {
            case 'invoice_payment': return t.typeInvoicePayment || (lang === 'ar' ? 'تحصيل فاتورة' : 'Invoice Payment');
            case 'invoice_return': return t.typeInvoiceReturn || (lang === 'ar' ? 'مرتجع فاتورة' : 'Invoice Refund');
            case 'client_credit_plus': return t.typeClientCreditPlus || (lang === 'ar' ? 'إيداع من عميل (+)' : 'Client Credit (+)');
            case 'client_debit_minus': return t.typeClientDebitMinus || (lang === 'ar' ? 'سحب من عميل (-)' : 'Client Due (-)');
            default: return type;
        }
    };

    const renderPaymentTypeBadge = (type) => {
        switch (type) {
            case 'invoice_payment':
                return <Chip label={getPaymentTypeLabel(type)} color="success" size="small" sx={{ fontWeight: 700, fontSize: '11px', height: 22 }} />;
            case 'invoice_return':
                return <Chip label={getPaymentTypeLabel(type)} color="error" size="small" sx={{ fontWeight: 700, fontSize: '11px', height: 22 }} />;
            case 'client_credit_plus':
                return <Chip label={getPaymentTypeLabel(type)} color="info" size="small" sx={{ fontWeight: 700, fontSize: '11px', height: 22 }} />;
            case 'client_debit_minus':
                return <Chip label={getPaymentTypeLabel(type)} color="warning" size="small" sx={{ fontWeight: 700, fontSize: '11px', height: 22 }} />;
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
            <Box sx={{ mb: 2 }}>
                <Button 
                    size="small" 
                    startIcon={!isRtl ? backArrow : undefined}
                    endIcon={isRtl ? backArrow : undefined}
                    onClick={handleBackNavigation}
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                    {accountId 
                        ? (lang === 'ar' ? 'العودة للوحة الفرع' : 'Back to Branch Dashboard') 
                        : (t.backToGlobalWorkspace || (lang === 'ar' ? 'العودة للوحة الرئيسية' : 'Back to Dashboard'))}
                </Button>
            </Box>

            <Card sx={{ mb: 2.5, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Grid container spacing={1.5} alignItems="center">
                        <Grid item xs={12} md={3.5}>
                            <TextField
                                fullWidth
                                placeholder={t.searchPaymentsPlaceholder || (lang === 'ar' ? 'البحث برقم العملية، الفاتورة، العميل...' : 'Search by ID, Invoice #, or Client...')}
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

                        <Grid item xs={6} sm={3} md={2}>
                            <Select
                                fullWidth
                                value={paymentTypeFilter}
                                onChange={(e) => { 
                                    setPaymentTypeFilter(e.target.value); 
                                    updateParamsOnFilter();
                                }}
                                size="small"
                                sx={{ height: 36, fontSize: '13px' }}
                            >
                                <MenuItem value="ALL">{t.allPaymentTypes || (lang === 'ar' ? 'جميع أنواع المدفوعات' : 'All Types')}</MenuItem>
                                {availablePaymentTypes.map(typeKey => (
                                    <MenuItem key={typeKey} value={typeKey}>
                                        {getPaymentTypeLabel(typeKey)}
                                    </MenuItem>
                                ))}
                            </Select>
                        </Grid>

                        <Grid item xs={6} sm={3} md={2}>
                            <Select
                                fullWidth
                                value={methodFilter}
                                onChange={(e) => { 
                                    setMethodFilter(e.target.value); 
                                    updateParamsOnFilter();
                                }}
                                size="small"
                                sx={{ height: 36, fontSize: '13px' }}
                            >
                                <MenuItem value="ALL">{t.allMethods || (lang === 'ar' ? 'طريقة الدفع' : 'Payment Method')}</MenuItem>
                                {availableMethods.map(m => (
                                    <MenuItem key={m} value={m} sx={{ textTransform: 'capitalize' }}>
                                        {m === 'cash' ? (lang === 'ar' ? 'نقداً (Cash)' : 'Cash') :
                                         m === 'bank' ? (lang === 'ar' ? 'تحويل بنكي' : 'Bank Transfer') :
                                         m === 'client_credit' ? (lang === 'ar' ? 'رصيد دائن' : 'Client Credit') : m}
                                    </MenuItem>
                                ))}
                            </Select>
                        </Grid>

                        <Grid item xs={6} sm={3} md={2.25}>
                            <Select
                                fullWidth
                                value={treasuryFilter}
                                onChange={(e) => { 
                                    setTreasuryFilter(e.target.value); 
                                    updateParamsOnFilter();
                                }}
                                size="small"
                                sx={{ height: 36, fontSize: '13px' }}
                            >
                                <MenuItem value="ALL">{lang === 'ar' ? 'جميع الخزائن' : 'All Treasuries'}</MenuItem>
                                {availableTreasuries.map(tName => (
                                    <MenuItem key={tName} value={tName}>{tName}</MenuItem>
                                ))}
                            </Select>
                        </Grid>

                        <Grid item xs={6} sm={3} md={2.25}>
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
                                <Table size="small" sx={{ minWidth: 1100 }}>
                                    <TableHead sx={{ bgcolor: alpha(theme.palette.action.hover, 0.05) }}>
                                        <TableRow>
                                            <TableCell 
                                                align={isRtl ? 'right' : 'left'}
                                                sx={{ 
                                                    fontWeight: 700, 
                                                    py: 1.5, 
                                                    px: 2,
                                                    color: 'text.primary',
                                                    ...getStickyCellStyle(true)
                                                }}
                                            >
                                                # {t.paymentId || (lang === 'ar' ? 'رقم العملية' : 'Payment ID')}
                                            </TableCell>

                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 1.5, minWidth: 130 }}>{t.paymentType || (lang === 'ar' ? 'النوع' : 'Type')}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 1.5, minWidth: 160 }}>{t.referenceDoc || (lang === 'ar' ? 'الفاتورة / العميل' : 'Invoice / Client')}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 1.5, minWidth: 160 }}>{t.treasuryName || (lang === 'ar' ? 'اسم الخزينة / الحساب' : 'Treasury / Account')}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 1.5, minWidth: 160 }}>{t.accountAndBranch || (lang === 'ar' ? 'الحساب والفرع' : 'Account & Branch')}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 1.5, minWidth: 120 }}>{t.paymentMethod || (lang === 'ar' ? 'طريقة الدفع' : 'Method')}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 1.5, minWidth: 110 }}>{t.paymentDate || (lang === 'ar' ? 'التاريخ' : 'Date')}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 1.5, minWidth: 140 }}>{t.amount || (lang === 'ar' ? 'المبلغ' : 'Amount')}</TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 1.5, minWidth: 160 }}>{t.notes || (lang === 'ar' ? 'الملاحظات' : 'Notes')}</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {paginatedPayments.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={9} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                                                    {t.noPaymentsFound || (lang === 'ar' ? 'لا توجد عمليات مدفوعات مسجلة.' : 'No payment transactions recorded.')}
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
                                                                py: 1.5, 
                                                                px: 2,
                                                                color: 'text.primary',
                                                                ...getStickyCellStyle(false)
                                                            }}
                                                        >
                                                            #{p.daftra_payment_id || p.id}
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 1.5 }}>
                                                            {renderPaymentTypeBadge(p.payment_type)}
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 600, py: 1.5 }}>
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

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 1.5 }}>
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

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 1.5 }}>
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

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 1.5 }}>
                                                            <Chip 
                                                                label={p.payment_method || 'cash'} 
                                                                variant="outlined" 
                                                                size="small" 
                                                                sx={{ textTransform: 'capitalize', fontSize: '11px', fontWeight: 600, height: 22 }} 
                                                            />
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontSize: '12px', color: 'text.secondary', py: 1.5 }}>
                                                            <bdi>{p.payment_date ? new Date(p.payment_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : '—'}</bdi>
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 1.5 }}>
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

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 1.5, color: 'text.secondary', fontSize: '12px' }}>
                                                            {p.notes || '—'}
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

export default PaymentsPage;