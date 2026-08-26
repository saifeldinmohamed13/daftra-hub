import React, { createContext, useContext, useState, useLayoutEffect } from 'react';
import { Backdrop, CircularProgress, Typography, Box } from '@mui/material';
import API from './services/api';
import { useLanguage } from './LanguageContext'; // 👈 استدعاء سياق اللغة

const LoadingContext = createContext();

export const LoadingProvider = ({ children }) => {
    const [activeRequests, setActiveRequests] = useState(0);
    const { t } = useLanguage(); // 👈 جلب كائن الترجمات t

    useLayoutEffect(() => {
        const reqInterceptor = API.interceptors.request.use(
            (config) => {
                if (config.showLoader !== false) {
                    setActiveRequests((prev) => prev + 1);
                }
                return config;
            },
            (error) => {
                setActiveRequests((prev) => Math.max(0, prev - 1));
                return Promise.reject(error);
            }
        );

        const resInterceptor = API.interceptors.response.use(
            (response) => {
                if (response.config.showLoader !== false) {
                    setActiveRequests((prev) => Math.max(0, prev - 1));
                }
                return response;
            },
            (error) => {
                if (error.config && error.config.showLoader !== false) {
                    setActiveRequests((prev) => Math.max(0, prev - 1));
                }
                return Promise.reject(error);
            }
        );

        return () => {
            API.interceptors.request.eject(reqInterceptor);
            API.interceptors.response.eject(resInterceptor);
        };
    }, []);

    const isLoading = activeRequests > 0;

    return (
        <LoadingContext.Provider value={{ isLoading }}>
            {children}

            <Backdrop
                open={isLoading}
                sx={{
                    color: '#fff',
                    zIndex: (theme) => theme.zIndex.drawer + 9999,
                    backgroundColor: 'rgba(15, 23, 42, 0.55)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                }}
            >
                <Box
                    sx={{
                        p: 3,
                        borderRadius: 3,
                        bgcolor: 'background.paper',
                        color: 'text.primary',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 1.5,
                        boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
                        minWidth: 180
                    }}
                >
                    <CircularProgress size={32} thickness={4.5} color="primary" />
                    
                    {/* 🎯 النص يقرأ ديناميكياً بحسب اللغة المحددة حالياً */}
                    <Typography variant="caption" fontWeight={700} color="text.secondary">
                        {t?.loadingData || (t?.dir === 'rtl' ? 'جاري تحميل البيانات...' : 'Loading data...')}
                    </Typography>
                </Box>
            </Backdrop>
        </LoadingContext.Provider>
    );
};

export const useLoading = () => useContext(LoadingContext);