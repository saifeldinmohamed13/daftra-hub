import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Box, Card, CardContent, Table, TableHead, TableBody, TableRow, TableCell,
    TableContainer, Paper, Button, IconButton, CircularProgress, Dialog, 
    DialogTitle, DialogContent, DialogContentText, DialogActions, Snackbar, 
    Alert, Pagination, Select, MenuItem, Typography, Chip, Stack
} from '@mui/material';
import {
    DeleteOutlineRounded as DeleteOutlineIcon,
    ArrowBackRounded as ArrowBackIcon,
    ArrowForwardRounded as ArrowForwardIcon,
    WarningAmberRounded as WarningIcon,
    LaunchRounded as LaunchIcon
} from '@mui/icons-material';
import API from '../services/api';
import Layout from '../components/Layout';
import { useLanguage } from '../LanguageContext';

const ConnectedAccountsPage = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { t } = useLanguage();
    const isRtl = t.dir === 'rtl';
    const userId = localStorage.getItem('userId');

    // Clean 1-based index setup
    const page = parseInt(searchParams.get('page') || '1', 10);
    const rowsPerPage = parseInt(searchParams.get('limit') || '10', 10);

    const [loading, setLoading] = useState(true);
    const [accounts, setAccounts] = useState([]);
    const [allRawAccounts, setAllRawAccounts] = useState([]);
    const [totalRows, setTotalRows] = useState(0);

    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [deleteDialog, setDeleteDialog] = useState({ open: false, accountId: null, accountName: '' });

    const totalPages = Math.ceil(totalRows / rowsPerPage);

    const fetchPaginatedAccounts = async () => {
        setLoading(true);
        try {
            const response = await API.get(`/auth/linked-accounts/${userId}`);
            if (response.data) {
                const rawData = response.data || [];
                setAllRawAccounts(rawData);
                setTotalRows(rawData.length);
                
                const startIndex = (page - 1) * rowsPerPage;
                const endIndex = startIndex + rowsPerPage;
                setAccounts(rawData.slice(startIndex, endIndex));
            }
        } catch (err) {
            console.error('Failed compiling paginated master account listing node:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!userId) {
            navigate('/login');
        } else {
            if (!searchParams.get('page') || !searchParams.get('limit')) {
                setSearchParams({ page: String(page), limit: String(rowsPerPage) }, { replace: true });
            }
            fetchPaginatedAccounts();
        }
    }, [searchParams, userId, page, rowsPerPage]);

    const handlePageNumberChange = (event, newPage) => {
        setSearchParams({ page: String(newPage), limit: String(rowsPerPage) });
    };

    const handleChangeRowsPerPage = (event) => {
        const newLimit = event.target.value;
        setSearchParams({ page: '1', limit: String(newLimit) });
    };

    const executeDeleteAccount = async () => {
        const { accountId } = deleteDialog;
        setDeleteDialog({ open: false, accountId: null, accountName: '' });
        try {
            await API.delete(`/auth/linked-accounts/${accountId}`);
            await fetchPaginatedAccounts();
            setSnackbar({ open: true, message: t.deletedSuccess || 'Account unlinked cleanly.', severity: 'success' });
        } catch (err) {
            setSnackbar({ open: true, message: err.response?.data?.error || t.errorTitle || 'An error occurred.', severity: 'error' });
        }
    };

    const renderStatusChip = (status) => {
        switch (status) {
            case 'connected':
                return <Chip label={t.statusConnected || 'متصل ونشط'} color="success" size="small" sx={{ fontWeight: 600 }} />;
            case 'app_deactivated':
                return <Chip label={t.statusDeactivated || 'التطبيق غير مفعل'} color="error" size="small" sx={{ fontWeight: 600 }} />;
            default:
                return <Chip label={t.syncStatusPending || 'قيد الانتظار'} color="default" size="small" sx={{ fontWeight: 600 }} />;
        }
    };

    const deactivatedAccounts = allRawAccounts.filter(acc => acc.sync_status === 'app_deactivated');
    const backArrow = <ArrowBackIcon sx={isRtl ? { transform: 'scaleX(-1)' } : undefined} />;

    return (
        <Layout title={t.allBranches || 'Master Accounts Directory'}>
            <Box sx={{ mb: 3 }}>
                <Button size="small" startIcon={!isRtl ? backArrow : undefined} endIcon={isRtl ? backArrow : undefined} onClick={() => navigate('/dashboard')}>
                    {t.backToGlobal || 'Back to Dashboard'}
                </Button>
            </Box>

            {/* ⚠️ BANNER FOR DEACTIVATED ACCOUNTS */}
            {deactivatedAccounts.length > 0 && (
                <Stack spacing={1.5} sx={{ mb: 3 }}>
                    {deactivatedAccounts.map(account => {
                        const cleanSub = account.daftra_subdomain.replace('https://', '').replace('http://', '').split('.')[0];
                        return (
                            <Alert
                                key={account.id}
                                severity="warning"
                                icon={<WarningIcon />}
                                action={
                                    <Button
                                        color="inherit"
                                        size="small"
                                        endIcon={<LaunchIcon fontSize="inherit" />}
                                        href={`https://${cleanSub}.daftra.com/owner/apps`}
                                        target="_blank"
                                    >
                                        {t.activateNowBtn || 'تفعيل الآن'}
                                    </Button>
                                }
                            >
                                {t.appDeactivatedBody ? t.appDeactivatedBody(account.account_name) : `تطبيق Hub ملغي تفعيله على حساب "${account.account_name}" في دفترة.`}
                            </Alert>
                        );
                    })}
                </Stack>
            )}

            <Card>
                <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
                    ) : (
                        <>
                            <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 0 }}>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ fontWeight: 700 }}>{t.branchName}</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>{t.subdomain}</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>{t.status}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700 }}>{t.action}</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {accounts.length === 0 ? (
                                            <TableRow><TableCell colSpan={4} align="center" sx={{ py: 4 }}>{t.noAccountsConnected}</TableCell></TableRow>
                                        ) : (
                                            accounts.map((acc) => (
                                                <TableRow key={acc.id} hover>
                                                    <TableCell sx={{ fontWeight: 600 }}>{acc.account_name}</TableCell>
                                                    <TableCell sx={{ color: 'text.secondary' }}>{acc.daftra_subdomain}</TableCell>
                                                    <TableCell>{renderStatusChip(acc.sync_status)}</TableCell>
                                                    <TableCell align="right">
                                                        <Box sx={{ display: 'inline-flex', gap: 1 }}>
                                                            <Button size="small" endIcon={<ArrowForwardIcon fontSize="small" sx={isRtl ? { transform: 'scaleX(-1)' } : undefined} />} onClick={() => navigate(`/dashboard/branch/${acc.id}`, { state: { accountName: acc.account_name } })}>
                                                                {t.view}
                                                            </Button>
                                                            <IconButton size="small" color="error" onClick={() => setDeleteDialog({ open: true, accountId: acc.id, accountName: acc.account_name })}>
                                                                <DeleteOutlineIcon fontSize="small" />
                                                            </IconButton>
                                                        </Box>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>

                            {/* 📊 PAGINATION ROW LAYOUT */}
                            <Box 
                                sx={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'space-between', 
                                    p: 2, 
                                    flexWrap: 'wrap',
                                    gap: 2,
                                    borderTop: '1px solid rgba(224, 224, 224, 1)' 
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Typography variant="caption" color="text.secondary">
                                        {t.rowsPerPage || 'Rows per page:'}
                                    </Typography>
                                    <Select
                                        value={rowsPerPage}
                                        onChange={handleChangeRowsPerPage}
                                        size="small"
                                        variant="outlined"
                                        sx={{ height: 32, fontSize: '0.75rem', '.MuiOutlinedInput-input': { py: 0.5 } }}
                                    >
                                        {[5, 10, 20, 50].map((option) => (
                                            <MenuItem key={option} value={option} sx={{ fontSize: '0.75rem' }}>
                                                {option}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                        {totalRows > 0 ? `${((page - 1) * rowsPerPage) + 1}-${Math.min(page * rowsPerPage, totalRows)} ${t.of || 'of'} ${totalRows}` : '0-0 of 0'}
                                    </Typography>
                                </Box>

                                <Pagination
                                    count={totalPages}
                                    page={page}
                                    onChange={handlePageNumberChange}
                                    color="primary"
                                    size="small"
                                    shape="rounded"
                                    showFirstButton
                                    showLastButton
                                />
                            </Box>
                        </>
                    )}
                </CardContent>
            </Card>

            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}><Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert></Snackbar>
            <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, accountId: null, accountName: '' })}>
                <DialogTitle fontWeight={700}>{t.areYouSure}</DialogTitle>
                <DialogContent><DialogContentText>{t.unlinkConfirmText}</DialogContentText></DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}><Button size="small" onClick={() => setDeleteDialog({ open: false, accountId: null, accountName: '' })}>{t.cancel}</Button><Button size="small" onClick={executeDeleteAccount} color="error" variant="contained" disableElevation>{t.yesDelete}</Button></DialogActions>
            </Dialog>
        </Layout>
    );
};

export default ConnectedAccountsPage;