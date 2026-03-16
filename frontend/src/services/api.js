import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
    ...(API_URL ? { baseURL: API_URL } : {}),
    headers: {
        'Content-Type': 'application/json'
    }
});

function delay(ms) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

function isRetryableRequestError(error) {
    const status = error?.response?.status;

    if (status == null) {
        return true;
    }

    return status >= 500;
}

export const getSourceConfig = async ({ retries = 4, retryDelayMs = 800 } = {}) => {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await api.get('/api/source-config');
        } catch (error) {
            lastError = error;

            if (attempt === retries || !isRetryableRequestError(error)) {
                throw error;
            }

            await delay(retryDelayMs * (attempt + 1));
        }
    }

    throw lastError;
};

// Detection
export const triggerDetection = (region, sourceIds) =>
    api.post('/api/detect', {
        region,
        ...(sourceIds !== undefined ? { source_ids: sourceIds } : {})
    });

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

export const verifyAlert = (id, sourceIds) =>
    api.post(`/api/alerts/${id}/verify`, sourceIds !== undefined ? { source_ids: sourceIds } : {});

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
