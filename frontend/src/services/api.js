import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Detection
export const triggerDetection = (region, demo = true) =>
    api.post('/api/detect', { region, demo });

export const createAlertFromFinding = (finding, region, severity = 'MEDIUM', radius = 30) =>
    api.post('/api/detect/create-alert', {
        finding,
        region,
        severity,
        affected_radius_km: radius
    });

export const getIntelFindings = (region, limit = 100) =>
    api.get('/api/detect/findings', { params: { region, limit } });

// Alerts
export const getAlerts = (status) =>
    api.get('/api/alerts', { params: { status } });

export const getAlert = (id) =>
    api.get(`/api/alerts/${id}`);

export const approveAlert = (id, data) =>
    api.post(`/api/alerts/${id}/approve`, data);

export const rejectAlert = (id, data) =>
    api.post(`/api/alerts/${id}/reject`, data);

export const verifyAlert = (id) =>
    api.post(`/api/alerts/${id}/verify`);

export const createManualAlert = (data) =>
    api.post('/api/alerts/manual', data);

// Users
export const getUsers = () =>
    api.get('/api/users');

export const getUser = (id) =>
    api.get(`/api/users/${id}`);

export const subscribeUser = (id, subscription) =>
    api.post(`/api/users/${id}/subscribe`, { subscription });

export const unsubscribeUser = (id) =>
    api.delete(`/api/users/${id}/unsubscribe`);

export const getVapidPublicKey = () =>
    api.get('/api/users/vapid-public-key');

export default api;
