const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const multer = require('multer');
const { Op } = require('sequelize');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { BACKEND_ROOT } = require('../config/runtime');
const MediaEvidence = require('../models/MediaEvidence');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MEDIA_RETENTION_HOURS = 24;
const MEDIA_RETENTION_MS = MEDIA_RETENTION_HOURS * 60 * 60 * 1000;
const MAX_MEDIA_FILES = 5;
const MAX_MEDIA_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_MEDIA_ANALYSIS_ITEMS = 5;
const MEDIA_STORAGE_DIR = path.join(BACKEND_ROOT, 'data', 'media-temp');
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ORIGIN_PRIORITY = {
    analyst_upload: 0,
    news: 1,
    twitter: 2
};

function ensureMediaStorageDir() {
    fs.mkdirSync(MEDIA_STORAGE_DIR, { recursive: true });
}

function getUploadStorage() {
    ensureMediaStorageDir();

    return multer.diskStorage({
        destination(_req, _file, cb) {
            cb(null, MEDIA_STORAGE_DIR);
        },
        filename(_req, file, cb) {
            const extension = path.extname(file.originalname || '') || guessFileExtension(file.mimetype);
            cb(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
        }
    });
}

function createImageUploadMiddleware() {
    return multer({
        storage: getUploadStorage(),
        limits: {
            files: MAX_MEDIA_FILES,
            fileSize: MAX_MEDIA_FILE_SIZE_BYTES
        },
        fileFilter(_req, file, cb) {
            if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
                cb(new Error(`Unsupported media type: ${file.mimetype}`));
                return;
            }
            cb(null, true);
        }
    }).fields([
        { name: 'images', maxCount: MAX_MEDIA_FILES },
        { name: 'images[]', maxCount: MAX_MEDIA_FILES }
    ]);
}

function collectUploadedFiles(req) {
    if (!req?.files) {
        return [];
    }

    if (Array.isArray(req.files)) {
        return req.files;
    }

    return [
        ...(req.files.images || []),
        ...(req.files['images[]'] || [])
    ];
}

function parseMaybeJson(value, fallback = value) {
    if (typeof value !== 'string') {
        return value == null ? fallback : value;
    }

    try {
        return JSON.parse(value);
    } catch (_error) {
        return fallback;
    }
}

function parseStringArray(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }

    if (typeof value !== 'string') {
        return [];
    }

    const parsed = parseMaybeJson(value, null);
    if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
    }

    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function guessFileExtension(mimeType) {
    switch (mimeType) {
        case 'image/png':
            return '.png';
        case 'image/webp':
            return '.webp';
        case 'image/jpeg':
        default:
            return '.jpg';
    }
}

function getRelativeStoragePath(absolutePath) {
    return path.relative(BACKEND_ROOT, absolutePath);
}

function getAbsoluteStoragePath(storagePath) {
    if (!storagePath) {
        return null;
    }

    return path.isAbsolute(storagePath)
        ? storagePath
        : path.resolve(BACKEND_ROOT, storagePath);
}

function buildPreviewUrl(record) {
    if (record.storage_path) {
        return `/api/media/${record.id}/content`;
    }

    return record.source_url || null;
}

function serializeMediaEvidence(record) {
    const raw = record.toJSON ? record.toJSON() : record;

    return {
        id: raw.id,
        alert_id: raw.alert_id,
        intel_finding_id: raw.intel_finding_id,
        origin: raw.origin,
        source_url: raw.source_url,
        storage_path: raw.storage_path,
        mime_type: raw.mime_type,
        file_size_bytes: raw.file_size_bytes,
        sha256: raw.sha256,
        analysis_status: raw.analysis_status,
        analysis_summary: raw.analysis_summary || {},
        analysis_raw: raw.analysis_raw || null,
        expires_at: raw.expires_at,
        created_at: raw.createdAt || raw.created_at,
        updated_at: raw.updatedAt || raw.updated_at,
        preview_url: buildPreviewUrl(raw)
    };
}

function normalizeMediaSourceUrl(candidate) {
    if (typeof candidate !== 'string') {
        return null;
    }

    const value = candidate.trim();
    if (!value) {
        return null;
    }

    if (!/^https?:\/\//i.test(value)) {
        return null;
    }

    return value;
}

function extractImageCandidates(source) {
    if (!source || typeof source !== 'object') {
        return [];
    }

    return [
        source.image,
        source.image_url,
        source.preview_image_url,
        source.raw_data?.image,
        source.raw_data?.image_url,
        source.raw_data?.preview_image_url
    ]
        .map(normalizeMediaSourceUrl)
        .filter(Boolean);
}

async function computeFileDigest(filePath) {
    const buffer = await fs.promises.readFile(filePath);
    return {
        buffer,
        sha256: crypto.createHash('sha256').update(buffer).digest('hex')
    };
}

async function createUploadedMediaEvidence({ file, alertId = null, intelFindingId = null, origin = 'analyst_upload' }) {
    const absolutePath = path.resolve(file.path);
    const { sha256 } = await computeFileDigest(absolutePath);

    const existing = await MediaEvidence.findOne({
        where: {
            alert_id: alertId,
            intel_finding_id: intelFindingId,
            sha256
        }
    });

    if (existing) {
        return existing;
    }

    return MediaEvidence.create({
        alert_id: alertId,
        intel_finding_id: intelFindingId,
        origin,
        storage_path: getRelativeStoragePath(absolutePath),
        mime_type: file.mimetype,
        file_size_bytes: file.size,
        sha256,
        expires_at: new Date(Date.now() + MEDIA_RETENTION_MS)
    });
}

async function createRemoteMediaEvidence({ alertId = null, intelFindingId = null, origin, sourceUrl, mimeType = null }) {
    const normalizedUrl = normalizeMediaSourceUrl(sourceUrl);
    if (!normalizedUrl) {
        return null;
    }

    const existing = await MediaEvidence.findOne({
        where: {
            alert_id: alertId,
            intel_finding_id: intelFindingId,
            origin,
            source_url: normalizedUrl
        }
    });

    if (existing) {
        return existing;
    }

    return MediaEvidence.create({
        alert_id: alertId,
        intel_finding_id: intelFindingId,
        origin,
        source_url: normalizedUrl,
        mime_type: mimeType,
        analysis_status: 'PENDING'
    });
}

async function linkFindingImageSources(findingRecord, sourceFinding) {
    const imageCandidates = extractImageCandidates(sourceFinding);
    const created = [];

    for (const imageUrl of imageCandidates) {
        const record = await createRemoteMediaEvidence({
            intelFindingId: findingRecord.id,
            origin: 'news',
            sourceUrl: imageUrl
        });

        if (record) {
            created.push(record);
        }
    }

    return created;
}

async function listFindingMedia(findingId) {
    return MediaEvidence.findAll({
        where: { intel_finding_id: findingId },
        order: [['created_at', 'DESC']]
    });
}

async function listAlertMedia(alertId) {
    return MediaEvidence.findAll({
        where: { alert_id: alertId },
        order: [['created_at', 'DESC']]
    });
}

async function attachUploadedMediaToFinding(findingId, files) {
    const created = [];

    for (const file of files) {
        created.push(await createUploadedMediaEvidence({ file, intelFindingId: findingId }));
    }

    return created;
}

async function attachUploadedMediaToAlert(alertId, files) {
    const created = [];

    for (const file of files) {
        created.push(await createUploadedMediaEvidence({ file, alertId }));
    }

    return created;
}

async function copyFindingMediaToAlert(findingId, alertId) {
    const existingAlertMedia = await MediaEvidence.findAll({
        where: { alert_id: alertId }
    });
    const existingKeys = new Set(existingAlertMedia.map((record) => `${record.origin}:${record.source_url || record.sha256 || record.storage_path}`));
    const findingMedia = await listFindingMedia(findingId);

    const copied = [];
    for (const record of findingMedia) {
        const dedupeKey = `${record.origin}:${record.source_url || record.sha256 || record.storage_path}`;
        if (existingKeys.has(dedupeKey)) {
            continue;
        }

        copied.push(await MediaEvidence.create({
            alert_id: alertId,
            origin: record.origin,
            source_url: record.source_url,
            storage_path: record.storage_path,
            mime_type: record.mime_type,
            file_size_bytes: record.file_size_bytes,
            sha256: record.sha256,
            analysis_status: record.analysis_status,
            analysis_summary: record.analysis_summary,
            analysis_raw: record.analysis_raw,
            expires_at: record.expires_at
        }));
    }

    return copied;
}

async function syncAlertRemoteMedia({ alertId, twitterImageUrls = [], newsImageUrls = [] }) {
    const created = [];

    for (const imageUrl of twitterImageUrls) {
        const record = await createRemoteMediaEvidence({
            alertId,
            origin: 'twitter',
            sourceUrl: imageUrl
        });
        if (record) {
            created.push(record);
        }
    }

    for (const imageUrl of newsImageUrls) {
        const record = await createRemoteMediaEvidence({
            alertId,
            origin: 'news',
            sourceUrl: imageUrl
        });
        if (record) {
            created.push(record);
        }
    }

    return created;
}

async function fetchMediaBytes(record) {
    if (record.storage_path) {
        const absolutePath = getAbsoluteStoragePath(record.storage_path);
        const buffer = await fs.promises.readFile(absolutePath);
        return {
            buffer,
            mimeType: record.mime_type || 'image/jpeg'
        };
    }

    const response = await axios.get(record.source_url, {
        responseType: 'arraybuffer',
        timeout: 10000
    });

    return {
        buffer: Buffer.from(response.data),
        mimeType: response.headers['content-type'] || record.mime_type || 'image/jpeg'
    };
}

async function analyzeSingleMediaRecord(record, eventDetails) {
    try {
        const { buffer, mimeType } = await fetchMediaBytes(record);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const prompt = `Analyze this image in the context of verifying a crisis event.

Event being verified:
- Type: ${eventDetails.type}
- Location: ${eventDetails.region}
- Description: ${eventDetails.description?.slice(0, 200) || 'N/A'}

Analyze and return JSON:
{
    "is_relevant": true,
    "content_description": "Brief description of what's shown",
    "evidence_type": "damage|smoke|fire|crowd|emergency_vehicles|military|aftermath|unrelated",
    "credibility_indicators": {
        "appears_authentic": true,
        "signs_of_manipulation": [],
        "contextual_match": true
    },
    "verification_value": "high|medium|low|none"
}`;

        const result = await model.generateContent({
            contents: [{
                role: 'user',
                parts: [
                    {
                        inlineData: {
                            mimeType,
                            data: buffer.toString('base64')
                        }
                    },
                    { text: prompt }
                ]
            }],
            generationConfig: {
                responseMimeType: 'application/json'
            }
        });

        const parsed = JSON.parse(result.response.text());
        const summary = {
            is_relevant: parsed.is_relevant,
            evidence_type: parsed.evidence_type,
            verification_value: parsed.verification_value,
            description: parsed.content_description
        };

        await record.update({
            mime_type: mimeType,
            analysis_status: 'ANALYZED',
            analysis_summary: summary,
            analysis_raw: parsed
        });

        return serializeMediaEvidence(record);
    } catch (error) {
        await record.update({
            analysis_status: 'FAILED',
            analysis_summary: { error: error.message },
            analysis_raw: { error: error.message }
        });

        return serializeMediaEvidence(record);
    }
}

function compareMediaPriority(left, right) {
    const leftPriority = ORIGIN_PRIORITY[left.origin] ?? 99;
    const rightPriority = ORIGIN_PRIORITY[right.origin] ?? 99;

    if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
    }

    return new Date(left.createdAt || left.created_at || 0).getTime()
        - new Date(right.createdAt || right.created_at || 0).getTime();
}

async function analyzeAlertMedia(alertId, eventDetails) {
    const records = await listAlertMedia(alertId);
    if (records.length === 0) {
        return {
            analyzed: false,
            images: [],
            summary: {
                total_analyzed: 0,
                relevant_images: 0,
                high_value_evidence: 0,
                by_origin: {}
            }
        };
    }

    const analyzable = records
        .filter((record) => record.analysis_status !== 'EXPIRED')
        .sort(compareMediaPriority)
        .slice(0, MAX_MEDIA_ANALYSIS_ITEMS);

    const analyzedImages = [];
    for (const record of analyzable) {
        analyzedImages.push(await analyzeSingleMediaRecord(record, eventDetails));
    }

    const summary = {
        total_analyzed: analyzedImages.filter((image) => image.analysis_status === 'ANALYZED').length,
        relevant_images: analyzedImages.filter((image) => image.analysis_summary?.is_relevant).length,
        high_value_evidence: analyzedImages.filter((image) => image.analysis_summary?.verification_value === 'high').length,
        by_origin: analyzedImages.reduce((acc, image) => {
            const bucket = acc[image.origin] || { total: 0, relevant: 0, high_value: 0 };
            bucket.total += 1;
            if (image.analysis_summary?.is_relevant) {
                bucket.relevant += 1;
            }
            if (image.analysis_summary?.verification_value === 'high') {
                bucket.high_value += 1;
            }
            acc[image.origin] = bucket;
            return acc;
        }, {})
    };

    return {
        analyzed: analyzedImages.length > 0,
        images: analyzedImages,
        summary
    };
}

async function deleteMediaEvidence(recordOrId) {
    const record = typeof recordOrId === 'object'
        ? recordOrId
        : await MediaEvidence.findByPk(recordOrId);

    if (!record) {
        return false;
    }

    if (record.storage_path) {
        const references = await MediaEvidence.count({
            where: {
                storage_path: record.storage_path,
                id: { [Op.ne]: record.id }
            }
        });

        if (references === 0) {
            const absolutePath = getAbsoluteStoragePath(record.storage_path);
            await fs.promises.rm(absolutePath, { force: true }).catch(() => {});
        }
    }

    await record.destroy();
    return true;
}

async function purgeExpiredMediaEvidence() {
    ensureMediaStorageDir();

    const expiredRecords = await MediaEvidence.findAll({
        where: {
            expires_at: {
                [Op.lte]: new Date()
            },
            storage_path: {
                [Op.ne]: null
            }
        }
    });

    for (const record of expiredRecords) {
        const absolutePath = getAbsoluteStoragePath(record.storage_path);
        await fs.promises.rm(absolutePath, { force: true }).catch(() => {});
        await record.update({
            storage_path: null,
            analysis_status: 'EXPIRED'
        });
    }

    return expiredRecords.length;
}

function startMediaCleanupJob() {
    purgeExpiredMediaEvidence().catch((error) => {
        console.error('[Media] Startup cleanup failed:', error.message);
    });

    return setInterval(() => {
        purgeExpiredMediaEvidence().catch((error) => {
            console.error('[Media] Scheduled cleanup failed:', error.message);
        });
    }, 60 * 60 * 1000);
}

async function getMediaCountsForFindings(findingIds) {
    if (!Array.isArray(findingIds) || findingIds.length === 0) {
        return {};
    }

    const rows = await MediaEvidence.findAll({
        where: {
            intel_finding_id: findingIds
        },
        attributes: ['intel_finding_id']
    });

    return rows.reduce((acc, row) => {
        const key = row.intel_finding_id;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
}

module.exports = {
    ALLOWED_MIME_TYPES,
    MAX_MEDIA_FILES,
    MAX_MEDIA_FILE_SIZE_BYTES,
    MAX_MEDIA_ANALYSIS_ITEMS,
    MEDIA_RETENTION_HOURS,
    MEDIA_STORAGE_DIR,
    analyzeAlertMedia,
    attachUploadedMediaToAlert,
    attachUploadedMediaToFinding,
    collectUploadedFiles,
    copyFindingMediaToAlert,
    createImageUploadMiddleware,
    createRemoteMediaEvidence,
    deleteMediaEvidence,
    ensureMediaStorageDir,
    extractImageCandidates,
    getAbsoluteStoragePath,
    getMediaCountsForFindings,
    linkFindingImageSources,
    listAlertMedia,
    listFindingMedia,
    parseMaybeJson,
    parseStringArray,
    purgeExpiredMediaEvidence,
    serializeMediaEvidence,
    startMediaCleanupJob,
    syncAlertRemoteMedia
};
