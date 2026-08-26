import axios from 'axios';

/**
 * 🌐 Centralised Axios Instance
 * baseURL kept as localhost for local development.
 * For production, set VITE_API_URL in your .env file:
 *   VITE_API_URL=https://api.yourdomain.com/api
 */
const API = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
    headers: { 'Content-Type': 'application/json' },
});

// Attach JWT Bearer token from localStorage to every outbound request
API.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// If the server returns 401 (expired / invalid token), clear session and redirect to login
API.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.clear();
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export default API;
