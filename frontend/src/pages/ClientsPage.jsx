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
    Chip,
    CircularProgress,
    Pagination,
    Select,
    MenuItem,
    Typography,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    IconButton,
    TextField,
    InputAdornment,
    Grid,
    useTheme,
    alpha
} from '@mui/material';
import { 
    ArrowBackRounded as ArrowBackIcon,
    DescriptionRounded as StatementIcon,
    PhoneRounded as PhoneIcon,
    EmailRounded as EmailIcon,
    CloseRounded as CloseIcon,
    Search as SearchIcon
} from '@mui/icons-material';
import API from '../services/api';
import Layout from '../components/Layout';
import CurrencyDisplay from '../components/CurrencyDisplay';
import { useLanguage } from '../LanguageContext';
import { getCurrencyFullName } from '../i18n/currencies';

const ClientsPage = () => {
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
    const [clients, setClients] = useState([]);

    const [searchTerm, setSearchTerm] = useState('');
    const [accountOrBranchFilter, setAccountOrBranchFilter] = useState('ALL');

    const [statementModal, setStatementModal] = useState({
        open: false,
        clientName: '',
        statementUrl: '',
    });

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

    const fetchClients = useCallback(async () => {
        setLoading(true);
        try {
            const currentTargetCurr = await fetchCurrencySettings();

            const params = {
                userId: accountId ? undefined : userId,
                accountId: accountId || undefined,
                targetCurrency: currentTargetCurr !== 'DEFAULT' ? currentTargetCurr : undefined,
                limit: 1000
            };

            const response = await API.get('/financial/clients/paginated', { params });
            if (response.data) {
                setClients(response.data.data || []);
            }
        } catch (err) {
            console.error('Failed compiling matrix directory node for clients:', err);
        } finally {
            setLoading(false);
        }
    }, [accountId, userId, fetchCurrencySettings]);

    useEffect(() => {
        if (userId) {
            if (!searchParams.get('page') || !searchParams.get('limit')) {
                setSearchParams({
                    accountId: accountId || '',
                    page: String(page),
                    limit: String(rowsPerPage)
                }, { replace: true });
            }
            fetchClients();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, userId, fetchClients, accountId, page, rowsPerPage]);

    const availableAccountsOrBranches = useMemo(() => {
        const map = new Map();
        clients.forEach(cli => {
            if (accountId) {
                const branchKey = cli.branch_name || cli.branch_id || 'Main Branch';
                if (!map.has(branchKey)) {
                    map.set(branchKey, cli.branch_name || (lang === 'ar' ? 'الفرع الرئيسي' : 'Main Branch'));
                }
            } else {
                if (cli.account_id && !map.has(String(cli.account_id))) {
                    map.set(String(cli.account_id), cli.account_name || `Account #${cli.account_id}`);
                }
            }
        });
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [clients, accountId, lang]);

    const filteredClients = useMemo(() => {
        let result = [...clients];

        if (accountOrBranchFilter !== 'ALL') {
            if (accountId) {
                result = result.filter(cli => (cli.branch_name || 'Main Branch') === accountOrBranchFilter);
            } else {
                result = result.filter(cli => String(cli.account_id) === String(accountOrBranchFilter));
            }
        }

        if (searchTerm.trim() !== '') {
            const term = searchTerm.toLowerCase();
            result = result.filter(cli =>
                (cli.client_name && cli.client_name.toLowerCase().includes(term)) ||
                (cli.client_email && cli.client_email.toLowerCase().includes(term)) ||
                (cli.client_phone && cli.client_phone.toLowerCase().includes(term)) ||
                (cli.account_name && cli.account_name.toLowerCase().includes(term)) ||
                (cli.branch_name && cli.branch_name.toLowerCase().includes(term))
            );
        }

        return result;
    }, [clients, accountOrBranchFilter, searchTerm, accountId]);

    const totalRows = filteredClients.length;
    const totalPages = Math.ceil(totalRows / rowsPerPage) || 1;
    const paginatedClients = filteredClients.slice((page - 1) * rowsPerPage, page * rowsPerPage);

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

    const handleOpenStatement = (client, e) => {
        if (e) e.stopPropagation();

        const baseURL = API.defaults.baseURL || '/api';
        const proxyUrl = `${baseURL}/financial/client-statement-proxy/${client.account_id}/${client.daftra_client_id}`;

        setStatementModal({
            open: true,
            clientName: client.client_name,
            statementUrl: proxyUrl
        });
    };

    const backArrow = <ArrowBackIcon sx={isRtl ? { transform: 'scaleX(-1)' } : undefined} />;

    const getStickyCellStyle = (isHeader = false) => ({
        position: 'sticky',
        insetInlineStart: 0,
        zIndex: isHeader ? 10 : 5,
        backgroundColor: theme.palette.background.paper,
        backgroundImage: 'none',
        borderInlineEnd: `1px solid ${theme.palette.divider}`,
        minWidth: 230,
    });

    return (
        <Layout title={t.allClientsTitle || 'Master Clients Directory'}>
            <Box sx={{ mb: 2 }}>
                <Button 
                    size="small" 
                    startIcon={!isRtl ? backArrow : undefined}
                    endIcon={isRtl ? backArrow : undefined}
                    onClick={handleBackNavigation}
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                    {accountId ? t.backToBranch : t.backToGlobalWorkspace}
                </Button>
            </Box>

            <Card sx={{ mb: 2.5, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Grid container spacing={1.5} alignItems="center">
                        <Grid item xs={12} sm={8} md={8}>
                            <TextField
                                fullWidth
                                placeholder={lang === 'ar' ? 'البحث باسم العميل، الهاتف، البريد الإلكتروني...' : 'Search by Client Name, Phone, Email...'}
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

                        <Grid item xs={12} sm={4} md={4}>
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
                                <Table size="medium" sx={{ minWidth: 1100 }}>
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
                                                {t.clientName}
                                            </TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 170 }}>
                                                {!accountId ? t.accountAndBranch : t.branchLabel}
                                            </TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 180 }}>
                                                {t.clientTotalInvoiced}
                                            </TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 200 }}>
                                                {t.clientFinancialSummary}
                                            </TableCell>
                                            <TableCell align="center" sx={{ fontWeight: 700, py: 2, minWidth: 160 }}>
                                                {t.status}
                                            </TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, minWidth: 120 }}>
                                                {t.currency}
                                            </TableCell>
                                            <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontWeight: 700, py: 2, px: 2, minWidth: 130 }}>
                                                {t.createdAt}
                                            </TableCell>
                                            <TableCell align="center" sx={{ fontWeight: 700, py: 2, px: 2, minWidth: 120 }}>
                                                {t.action}
                                            </TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {paginatedClients.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                                                    {t.noClients}
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            paginatedClients.map((cli) => {
                                                const overdueCount = parseInt(cli.overdue_count || 0, 10);
                                                const returnedVal = parseFloat(cli.total_returned || 0);

                                                return (
                                                    <TableRow 
                                                        key={cli.id} 
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
                                                                py: 2, 
                                                                px: 2,
                                                                color: 'text.primary',
                                                                ...getStickyCellStyle(false)
                                                            }}
                                                        >
                                                            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                                                <Typography 
                                                                    variant="subtitle2" 
                                                                    fontWeight={700}
                                                                    sx={{ color: 'text.primary' }}
                                                                >
                                                                    {cli.client_name}
                                                                </Typography>
                                                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3, mt: 0.5 }}>
                                                                    {cli.client_email && (
                                                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '11px' }}>
                                                                            <EmailIcon sx={{ fontSize: '12px' }} /> <bdi>{cli.client_email}</bdi>
                                                                        </Typography>
                                                                    )}
                                                                    {cli.client_phone && (
                                                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '11px' }}>
                                                                            <PhoneIcon sx={{ fontSize: '12px' }} /> <bdi>{cli.client_phone}</bdi>
                                                                        </Typography>
                                                                    )}
                                                                </Box>
                                                            </Box>
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 2 }}>
                                                            {!accountId ? (
                                                                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                                                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '13px', color: 'text.primary' }}>
                                                                        {cli.account_name}
                                                                    </Typography>
                                                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '11px' }}>
                                                                        {cli.branch_name || t.defaultBranchName}
                                                                    </Typography>
                                                                </Box>
                                                            ) : (
                                                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '13px' }}>
                                                                    {cli.branch_name || t.defaultBranchName}
                                                                </Typography>
                                                            )}
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 2 }}>
                                                            <CurrencyDisplay
                                                                amount={cli.orig_total_invoiced || cli.total_invoiced}
                                                                baseAmount={cli.total_invoiced}
                                                                currencyCode={cli.currency}
                                                                baseCurrencyCode={cli.account_base_currency}
                                                                isUnified={cli.is_unified}
                                                                displayCurrency={cli.display_currency}
                                                                lang={lang}
                                                                isBold
                                                            />
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 2 }}>
                                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                    <Typography variant="caption" color="success.main" sx={{ fontWeight: 600, fontSize: '11px' }}>
                                                                        {t.paidLabel}:
                                                                    </Typography>
                                                                    <CurrencyDisplay
                                                                        amount={cli.orig_total_paid || cli.total_paid}
                                                                        baseAmount={cli.total_paid}
                                                                        currencyCode={cli.currency}
                                                                        baseCurrencyCode={cli.account_base_currency}
                                                                        isUnified={cli.is_unified}
                                                                        displayCurrency={cli.display_currency}
                                                                        lang={lang}
                                                                        size="caption"
                                                                        color="success.main"
                                                                    />
                                                                </Box>

                                                                {returnedVal > 0 && (
                                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                        <Typography variant="caption" color="error.main" sx={{ fontWeight: 600, fontSize: '11px' }}>
                                                                            {t.statusReturned}:
                                                                        </Typography>
                                                                        <CurrencyDisplay
                                                                            amount={returnedVal}
                                                                            baseAmount={returnedVal}
                                                                            currencyCode={cli.account_base_currency}
                                                                            baseCurrencyCode={cli.account_base_currency}
                                                                            isUnified={cli.is_unified}
                                                                            displayCurrency={cli.display_currency}
                                                                            lang={lang}
                                                                            size="caption"
                                                                            color="error.main"
                                                                        />
                                                                    </Box>
                                                                )}

                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                    <Typography variant="caption" color="warning.main" sx={{ fontWeight: 600, fontSize: '11px' }}>
                                                                        {t.unpaidLabel}:
                                                                    </Typography>
                                                                    <CurrencyDisplay
                                                                        amount={cli.orig_total_unpaid || cli.total_unpaid}
                                                                        baseAmount={cli.total_unpaid}
                                                                        currencyCode={cli.currency}
                                                                        baseCurrencyCode={cli.account_base_currency}
                                                                        isUnified={cli.is_unified}
                                                                        displayCurrency={cli.display_currency}
                                                                        lang={lang}
                                                                        size="caption"
                                                                        color="warning.main"
                                                                    />
                                                                </Box>
                                                            </Box>
                                                        </TableCell>

                                                        <TableCell align="center" sx={{ py: 2 }}>
                                                            {overdueCount > 0 ? (
                                                                <Chip 
                                                                    label={typeof t.overdueInvoicesBadge === 'function' ? t.overdueInvoicesBadge(overdueCount) : `${overdueCount} Overdue`}
                                                                    color="error"
                                                                    size="small"
                                                                    variant="filled"
                                                                    sx={{ fontSize: '10.5px', fontWeight: 700, height: 22 }}
                                                                />
                                                            ) : (
                                                                <Chip 
                                                                    label={t.noOverdueInvoices}
                                                                    color="success"
                                                                    size="small"
                                                                    variant="outlined"
                                                                    sx={{ fontSize: '10.5px', fontWeight: 600, height: 22 }}
                                                                />
                                                            )}
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ py: 2 }}>
                                                            <Chip 
                                                                label={getCurrencyFullName(cli.currency || 'EGP', lang)} 
                                                                size="small" 
                                                                variant="outlined" 
                                                                sx={{ fontSize: '11px', fontWeight: 600 }} 
                                                            />
                                                        </TableCell>

                                                        <TableCell align={isRtl ? 'right' : 'left'} sx={{ fontSize: '12px', color: 'text.secondary', px: 2 }}>
                                                            <bdi>{cli.daftra_created_at ? new Date(cli.daftra_created_at).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : '—'}</bdi>
                                                        </TableCell>

                                                        <TableCell align="center" sx={{ px: 2 }}>
                                                            <Tooltip title={t.viewClientStatement}>
                                                                <Button
                                                                    size="small"
                                                                    variant="outlined"
                                                                    color="primary"
                                                                    startIcon={<StatementIcon fontSize="small" />}
                                                                    onClick={(e) => handleOpenStatement(cli, e)}
                                                                    sx={{ fontSize: '11px', fontWeight: 600, textTransform: 'none', py: 0.3 }}
                                                                >
                                                                    {t.viewClientStatement}
                                                                </Button>
                                                            </Tooltip>
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
                                    justifyContent: 'space-between', 
                                    p: 2, 
                                    flexWrap: 'wrap',
                                    gap: 2,
                                    borderTop: `1px solid ${theme.palette.divider}`,
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                                        {t.rowsPerPage}
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
                                        <bdi>{totalRows > 0 ? `${((page - 1) * rowsPerPage) + 1}-${Math.min(page * rowsPerPage, totalRows)} ${t.of} ${totalRows}` : '0-0 of 0'}</bdi>
                                    </Typography>

                                    <Pagination
                                        count={totalPages}
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

            <Dialog
                open={statementModal.open}
                onClose={() => setStatementModal({ open: false, clientName: '', statementUrl: '' })}
                maxWidth="lg"
                fullWidth
                dir={t.dir}
                PaperProps={{
                    sx: { height: '85vh', borderRadius: 3 }
                }}
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
                    <Typography variant="h6" fontWeight={700}>
                        {t.clientStatementTitle}: {statementModal.clientName}
                    </Typography>
                    <IconButton onClick={() => setStatementModal({ open: false, clientName: '', statementUrl: '' })}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ p: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {statementModal.statementUrl ? (
                        <iframe
                            src={statementModal.statementUrl}
                            title="Daftra Client Statement"
                            style={{
                                width: '100%',
                                height: '100%',
                                border: 'none',
                            }}
                        />
                    ) : (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                            <CircularProgress />
                        </Box>
                    )}
                </DialogContent>
            </Dialog>
        </Layout>
    );
};

export default ClientsPage;