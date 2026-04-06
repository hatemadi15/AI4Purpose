import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
    ...(API_URL ? { baseURL: API_URL } : {}),
    headers: {
        'Content-Type': 'application/json'
    }
});

const multipartApi = axios.create({
    ...(API_URL ? { baseURL: API_URL } : {})
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
export const triggerDetection = (region, sourceIds, sourceOptions) =>
    api.post('/api/detect', {
        region,
        ...(sourceIds !== undefined ? { source_ids: sourceIds } : {}),
        ...(sourceOptions !== undefined ? { source_options: sourceOptions } : {})
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

export const getFindingMedia = (findingId) =>
    api.get(`/api/detect/findings/${encodeURIComponent(findingId)}/media`);

export const uploadFindingMedia = (findingId, files) => {
    const formData = new FormData();
    Array.from(files || []).forEach((file) => {
        formData.append('images[]', file);
    });

    return multipartApi.post(`/api/detect/findings/${encodeURIComponent(findingId)}/media`, formData);
};

// Alerts
export const getAlerts = (status) =>
    api.get('/api/alerts', { params: { status } });

export const getAlert = (id) =>
    api.get(`/api/alerts/${id}`);

export const approveAlert = (id, data) =>
    api.post(`/api/alerts/${id}/approve`, data);

export const rejectAlert = (id, data) =>
    api.post(`/api/alerts/${id}/reject`, data);

export const verifyAlert = (id, sourceIds, sourceOptions) =>
    api.post(`/api/alerts/${id}/verify`, {
        ...(sourceIds !== undefined ? { source_ids: sourceIds } : {}),
        ...(sourceOptions !== undefined ? { source_options: sourceOptions } : {})
    });

export const getAlertMedia = (id) =>
    api.get(`/api/alerts/${id}/media`);

export const uploadAlertMedia = (id, files) => {
    const formData = new FormData();
    Array.from(files || []).forEach((file) => {
        formData.append('images[]', file);
    });

    return multipartApi.post(`/api/alerts/${id}/media`, formData);
};

export const deleteMedia = (id) =>
    api.delete(`/api/media/${id}`);

export const createManualAlert = (data) => {
    const images = Array.from(data?.images || []);
    if (images.length === 0) {
        return api.post('/api/alerts/manual', data);
    }

    const formData = new FormData();
    Object.entries(data || {}).forEach(([key, value]) => {
        if (value == null || key === 'images') {
            return;
        }

        if (Array.isArray(value)) {
            formData.append(key, JSON.stringify(value));
            return;
        }

        formData.append(key, String(value));
    });

    images.forEach((file) => {
        formData.append('images[]', file);
    });

    return multipartApi.post('/api/alerts/manual', formData);
};

export function resolveMediaUrl(url) {
    if (!url) {
        return '';
    }

    if (/^https?:\/\//i.test(url)) {
        return url;
    }

    return API_URL ? `${API_URL}${url}` : url;
}

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
