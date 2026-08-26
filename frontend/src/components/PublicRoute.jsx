import React from 'react';
import { Navigate } from 'react-router-dom';

const PublicRoute = ({ children }) => {
    // 🔍 فحص التوكين أو بيانات المستخدم في اللوكل ستوريدج
    const token = localStorage.getItem('token'); 

    // لو موجود يرجعه للداش بورد فوراً
    if (token) {
        return <Navigate to="/dashboard" replace />;
    }

    // لو مش موجود يخليه يفتح صفحة اللوجين أو التسجيل عادي
    return children;
};

export default PublicRoute;