import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import {
    Box, Card, CardContent, Table, TableHead, TableBody,
    TableRow, TableCell, TableContainer, Paper, Button,
    CircularProgress, Pagination, Select, MenuItem, Typography, Chip
} from '@mui/material';
import { ArrowBackRounded as ArrowBackIcon } from '@mui/icons-material';
import API from '../services/api';
import Layout from '../components/Layout';
import CurrencyDisplay from '../components/CurrencyDisplay';
import { useLanguage } from '../LanguageContext';

const ProductsPage = () => {
    const navigate = useNavigate();
    const { accountId } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const { t, lang } = useLanguage();
    const isRtl = t.dir === 'rtl';

    const userId = localStorage.getItem('userId');

    const page        = parseInt(searchParams.get('page')  || '1',  10);
    const rowsPerPage = parseInt(searchParams.get('limit') || '10', 10);

    const [loading,   setLoading]   = useState(true);
    const [products,  setProducts]  = useState([]);
    const [totalRows, setTotalRows] = useState(0);

    const totalPages = Math.ceil(totalRows / rowsPerPage) || 1;
    const defaultsInitialised = useRef(false);

    // قراءة إعدادات العملة الموحدة
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

    const fetchPaginatedProducts = useCallback(async () => {
        setLoading(true);
        try {
            const currentTargetCurr = await fetchCurrencySettings();

            const params = {
                page,
                limit: rowsPerPage,
                targetCurrency: currentTargetCurr !== 'DEFAULT' ? currentTargetCurr : undefined
            };

            const response = await API.get(`/products/account/${accountId}/list`, { params });
            if (response.data?.success) {
                setProducts(response.data.data || []);
                setTotalRows(response.data.pagination?.total_records || 0);
            }
        } catch (err) {
            console.error('Failed fetching paginated products list:', err);
        } finally {
            setLoading(false);
        }
    }, [accountId, page, rowsPerPage, fetchCurrencySettings]);

    useEffect(() => {
        if (!defaultsInitialised.current) {
            defaultsInitialised.current = true;
            if (!searchParams.get('page') || !searchParams.get('limit')) {
                setSearchParams({ page: '1', limit: '10' }, { replace: true });
                return;
            }
        }

        if (!accountId) return;
        fetchPaginatedProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accountId, page, rowsPerPage, fetchPaginatedProducts]);

    const handlePageNumberChange = (event, newPage) => {
        setSearchParams({ page: String(newPage), limit: String(rowsPerPage) });
    };

    const handleChangeRowsPerPage = (event) => {
        setSearchParams({ page: '1', limit: String(event.target.value) });
    };

    const backArrow = <ArrowBackIcon sx={isRtl ? { transform: 'scaleX(-1)' } : undefined} />;

    return (
        <Layout title={t.allProductsTitle || 'Master Products Directory'}>
            <Box sx={{ mb: 3 }}>
                <Button
                    size="small"
                    startIcon={!isRtl ? backArrow : undefined}
                    endIcon={isRtl ? backArrow : undefined}
                    onClick={() => navigate(`/dashboard/branch/${accountId}`)}
                >
                    {t.backToBranch || 'Back to Branch'}
                </Button>
            </Box>

            <Card sx={{ boxShadow: '0 4px 16px rgba(0,0,0,0.04)', borderRadius: 2 }}>
                <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <>
                            <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 0, overflowX: 'auto' }}>
                                <Table size="small" sx={{ minWidth: 1000 }}>
                                    <TableHead sx={{ bgcolor: 'rgba(0, 0, 0, 0.02)' }}>
                                        <TableRow>
                                            <TableCell sx={{ fontWeight: 700, py: 2, px: 2 }}>{t.productCode}</TableCell>
                                            <TableCell sx={{ fontWeight: 700, py: 2 }}>{t.productName}</TableCell>
                                            <TableCell sx={{ fontWeight: 700, py: 2 }}>{t.branchLabel}</TableCell>
                                            <TableCell sx={{ fontWeight: 700, py: 2 }} align="center">{t.soldQty}</TableCell>
                                            <TableCell sx={{ fontWeight: 700, py: 2 }}>{t.totalSalesValue}</TableCell>
                                            <TableCell sx={{ fontWeight: 700, py: 2 }} align="center">{t.pendingStock}</TableCell>
                                            <TableCell sx={{ fontWeight: 700, py: 2 }} align="center">{t.availableStock}</TableCell>
                                            <TableCell sx={{ fontWeight: 700, py: 2, px: 2 }} align="center">{t.totalStock}</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {products.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                                                    {t.noTransactions || 'No products found'}
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            products.map((p) => {
                                                const availableStockVal = parseFloat(p.available_stock || 0);
                                                const pendingStockVal   = parseFloat(p.pending_stock   || 0);
                                                const displayAvailable  = Math.max(0, availableStockVal);

                                                return (
                                                    <TableRow key={p.daftra_product_id} hover>
                                                        <TableCell sx={{ fontWeight: 700, py: 1.8, px: 2, fontFamily: 'monospace' }}>
                                                            #{p.product_code || p.daftra_product_id}
                                                        </TableCell>
                                                        <TableCell sx={{ fontWeight: 600, fontSize: '13px', py: 1.8 }}>
                                                            {p.product_name}
                                                        </TableCell>
                                                        <TableCell sx={{ color: 'text.secondary', fontSize: '12px', py: 1.8 }}>
                                                            {p.branch_name}
                                                        </TableCell>
                                                        <TableCell align="center" sx={{ py: 1.8 }}>
                                                            <Chip
                                                                label={`${p.total_sold_qty} ${t.unitsCount || 'pcs'}`}
                                                                color="primary" size="small" variant="outlined"
                                                                sx={{ fontWeight: 700, fontSize: '11px' }}
                                                            />
                                                        </TableCell>
                                                        
                                                        {/* 🎯 إجمالي المبيعات باستخدام CurrencyDisplay الموحد */}
                                                        <TableCell sx={{ py: 1.8, fontWeight: 700, color: 'success.main' }}>
                                                            <CurrencyDisplay
                                                                amount={p.total_revenue}
                                                                currencyCode={p.account_base_currency}
                                                                baseCurrencyCode={p.account_base_currency}
                                                                isUnified={p.is_unified}
                                                                displayCurrency={p.display_currency}
                                                                lang={lang}
                                                                isBold
                                                                color="success.main"
                                                            />
                                                        </TableCell>

                                                        <TableCell align="center" sx={{ py: 1.8 }}>
                                                            <Chip
                                                                label={pendingStockVal}
                                                                color={pendingStockVal > 0 ? 'warning' : 'default'}
                                                                size="small"
                                                                variant={pendingStockVal > 0 ? 'filled' : 'outlined'}
                                                                sx={{ fontWeight: 700, fontSize: '11px', height: 22 }}
                                                            />
                                                        </TableCell>
                                                        <TableCell align="center" sx={{ py: 1.8 }}>
                                                            <Typography variant="body2" sx={{
                                                                fontWeight: 700,
                                                                color: availableStockVal < 0 ? 'error.main'
                                                                    : availableStockVal > 0 ? 'success.dark'
                                                                    : 'text.secondary',
                                                            }}>
                                                                {displayAvailable}
                                                                {availableStockVal < 0 && ' ⚠'}
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell align="center" sx={{ py: 1.8, px: 2, fontWeight: 700 }}>
                                                            {p.total_stock}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>

                            <Box sx={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                p: 2, flexWrap: 'wrap', gap: 2,
                                borderTop: '1px solid rgba(224, 224, 224, 0.5)',
                            }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                                        {t.rowsPerPage || 'Rows per page:'}
                                    </Typography>
                                    <Select
                                        value={rowsPerPage}
                                        onChange={handleChangeRowsPerPage}
                                        size="small" variant="outlined"
                                        sx={{ height: 30, fontSize: '0.75rem', borderRadius: '4px', '.MuiOutlinedInput-input': { py: 0.5 } }}
                                    >
                                        {[5, 10, 20, 50].map((option) => (
                                            <MenuItem key={option} value={option} sx={{ fontSize: '0.75rem' }}>
                                                {option}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </Box>

                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, ml: 'auto' }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                                        {totalRows > 0
                                            ? `${((page - 1) * rowsPerPage) + 1}–${Math.min(page * rowsPerPage, totalRows)} ${t.of || 'of'} ${totalRows}`
                                            : '0'}
                                    </Typography>
                                    <Pagination
                                        count={totalPages} page={page}
                                        onChange={handlePageNumberChange}
                                        color="primary" size="small" shape="rounded"
                                        showFirstButton showLastButton
                                        sx={{ '& .MuiPagination-ul': { flexDirection: isRtl ? 'row-reverse' : 'row' } }}
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

export default ProductsPage;