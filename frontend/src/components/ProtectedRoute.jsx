import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * 🔒 ProtectedRoute
 * Wraps any route that requires authentication.
 * Checks for a valid token in localStorage — if absent, redirects to /login immediately
 * without rendering the protected page at all (eliminates the flash-of-content issue).
 *
 * Usage in App.jsx:
 *   <Route path="/dashboard" element={<ProtectedRoute><GlobalDashboard /></ProtectedRoute>} />
 */
const ProtectedRoute = ({ children }) => {
    const token = localStorage.getItem('token');
    if (!token) {
        return <Navigate to="/login" replace />;
    }
    return children;
};

export default ProtectedRoute;
