import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Box } from '@mui/material';

import ProtectedRoute          from './components/ProtectedRoute';
import PublicRoute             from './components/PublicRoute';
import Register               from './pages/Register';
import Login                  from './pages/Login';
import GlobalDashboard        from './pages/GlobalDashboard';
import BranchDashboard        from './pages/BranchDashboard';
import InvoicesPage           from './pages/InvoicesPage';
import PaymentsPage           from './pages/PaymentsPage'; // 👈 إضافة صفحة المدفوعات والمقبوضات
import ClientsPage            from './pages/ClientsPage';
import ConnectedAccountsPage  from './pages/ConnectedAccountsPage';
import FinancialReportPage    from './pages/FinancialReportPage';
import ProductsPage           from './pages/ProductsPage';
import TreasuriesPage         from './pages/TreasuriesPage';
import TreasuryDetailsPage    from './pages/TreasuryDetailsPage';
import SettingsPage           from './pages/SettingsPage';

function App() {
    // 🔍 فحص وجود التوكين للتوجيه المباشر في الصفحة الرئيسية "/"
    const token = localStorage.getItem('token');

    return (
        <Router>
            <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
                <Routes>
                    {/* 🌐 Redirect Root Path depending on Session */}
                    <Route 
                        path="/" 
                        element={<Navigate to={token ? "/dashboard" : "/login"} replace />} 
                    />

                    {/* 🌐 Public routes — protected from logged-in users */}
                    <Route path="/login" element={
                        <PublicRoute>
                            <Login />
                        </PublicRoute>
                    } />
                    <Route path="/register" element={
                        <PublicRoute>
                            <Register />
                        </PublicRoute>
                    } />

                    {/* 🔒 Protected routes — redirect to /login if no token */}
                    <Route path="/dashboard" element={
                        <ProtectedRoute><GlobalDashboard /></ProtectedRoute>
                    } />
                    <Route path="/dashboard/branch/:accountId" element={
                        <ProtectedRoute><BranchDashboard /></ProtectedRoute>
                    } />
                    <Route path="/dashboard/branch/:accountId/products" element={
                        <ProtectedRoute><ProductsPage /></ProtectedRoute>
                    } />
                    <Route path="/invoices" element={
                        <ProtectedRoute><InvoicesPage /></ProtectedRoute>
                    } />
                    <Route path="/payments" element={
                        <ProtectedRoute><PaymentsPage /></ProtectedRoute>
                    } />
                    <Route path="/clients" element={
                        <ProtectedRoute><ClientsPage /></ProtectedRoute>
                    } />
                    <Route path="/accounts" element={
                        <ProtectedRoute><ConnectedAccountsPage /></ProtectedRoute>
                    } />
                    <Route path="/financial-report" element={
                        <ProtectedRoute><FinancialReportPage /></ProtectedRoute>
                    } />
                    <Route path="/treasuries" element={
                        <ProtectedRoute><TreasuriesPage /></ProtectedRoute>
                    } />
                    <Route path="/treasuries/:accountId/:journalAccountId" element={
                        <ProtectedRoute><TreasuryDetailsPage /></ProtectedRoute>
                    } />
                    <Route path="/settings" element={
                        <ProtectedRoute><SettingsPage /></ProtectedRoute>
                    } />

                    {/* 🔄 Fallback route for unknown URLs */}
                    <Route path="*" element={<Navigate to={token ? "/dashboard" : "/login"} replace />} />
                </Routes>
            </Box>
        </Router>
    );
}

export default App;