import React from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { getCurrencySymbol, getCurrencyFullName } from '../i18n/currencies';
import { formatCurrency } from '../utils/formatters';

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
    
    // 🎯 تحديد العملة المستهدفة للعرض
    const activeCurr = (isUnified ? displayCurrency : (baseCurrencyCode || 'EGP')).toUpperCase().trim();
    const invCurr = (currencyCode || 'EGP').toUpperCase().trim();

    const origVal = parseFloat(amount || 0);
    
    // 🎯 حساب القيمة المترجمة
    const baseVal = (baseAmount !== undefined && baseAmount !== null && !isNaN(parseFloat(baseAmount)))
        ? parseFloat(baseAmount)
        : (origVal * rate);

    const activeFullName = getCurrencyFullName(activeCurr, lang);
    const origFullName = getCurrencyFullName(invCurr, lang);
    
    const activeSymbol = getCurrencySymbol(activeCurr, lang);
    const origSymbol = getCurrencySymbol(invCurr, lang);

    const fontSize = size === 'caption' ? '11px' : '13px';
    const subFontSize = size === 'caption' ? '9.5px' : '11px';

    // 🎯 1. حالة التوحيد مفعّل (`isUnified = true`): نعرض القيمة الموحدة فقط في سطر واحد بدون السطر الفرعي
    if (isUnified) {
        return (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant={size} sx={{ fontSize, fontWeight: isBold ? 700 : 500, color }}>
                    <bdi>{formatCurrency(baseVal)}</bdi>
                </Typography>
                <Tooltip title={activeFullName} arrow placement="top">
                    <Typography
                        component="span"
                        variant={size}
                        sx={{ fontSize, fontWeight: isBold ? 700 : 600, color: color !== 'text.primary' ? color : 'text.secondary', cursor: 'pointer' }}
                    >
                        ({activeSymbol})
                    </Typography>
                </Tooltip>
            </Box>
        );
    }

    // 🎯 2. حالة وضع الديفولت (`isUnified = false`) والعملة مش أجنبية: نعرض القيمة الأصلية للسيستم
    const isForeign = invCurr !== activeCurr && Math.abs(baseVal - origVal) > 0.01;

    if (!isForeign) {
        return (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant={size} sx={{ fontSize, fontWeight: isBold ? 700 : 500, color }}>
                    <bdi>{formatCurrency(origVal)}</bdi>
                </Typography>
                <Tooltip title={origFullName} arrow placement="top">
                    <Typography
                        component="span"
                        variant={size}
                        sx={{ fontSize, fontWeight: isBold ? 700 : 600, color: color !== 'text.primary' ? color : 'text.secondary', cursor: 'pointer' }}
                    >
                        ({origSymbol})
                    </Typography>
                </Tooltip>
            </Box>
        );
    }

    // 🎯 3. حالة الديفولت مع وجود عملة أجنبية فقط: نعرض المبلغين فوق بعض مع Tooltip سعر الصرف
    const calculatedRate = origVal > 0 ? (baseVal / origVal) : rate;
    const tooltipTitle = `1 ${origSymbol} = ${formatCurrency(calculatedRate)} ${activeSymbol} (${activeFullName})`;

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
                    sx={{ fontSize: subFontSize, color: color !== 'text.primary' ? color : 'text.secondary', fontWeight: 500, cursor: 'pointer', width: 'fit-content', mt: 0.1 }}
                >
                    <bdi>{formatCurrency(origVal)}</bdi> ({origSymbol})
                </Typography>
            </Tooltip>
        </Box>
    );
};

export default CurrencyDisplay;