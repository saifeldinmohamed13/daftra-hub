import React from 'react';
import { Card, CardContent, Typography } from '@mui/material';

const MetricCard = ({ label, value, color = 'text.primary', filled = false }) => (
    <Card 
        sx={
            filled 
                ? { bgcolor: 'primary.main', color: 'primary.contrastText' } 
                : { border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }
        }
    >
        <CardContent sx={{ textAlign: 'center', py: 3 }}>
            <Typography
                variant="overline"
                sx={{ opacity: filled ? 0.85 : 1, color: filled ? 'inherit' : 'text.secondary', display: 'block' }}
            >
                {label}
            </Typography>
            <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5, color: filled ? 'inherit' : color }}>
                {typeof value === 'number' ? value.toLocaleString() : value}
            </Typography>
        </CardContent>
    </Card>
);

export default MetricCard;