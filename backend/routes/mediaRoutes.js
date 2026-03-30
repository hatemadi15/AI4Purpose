const fs = require('fs');
const express = require('express');
const MediaEvidence = require('../models/MediaEvidence');
const {
    deleteMediaEvidence,
    getAbsoluteStoragePath,
    serializeMediaEvidence
} = require('../services/mediaService');

const router = express.Router();

router.delete('/:id', async (req, res) => {
    try {
        const deleted = await deleteMediaEvidence(req.params.id);

        if (!deleted) {
            return res.status(404).json({ success: false, error: 'Media evidence not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Delete media error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/:id/content', async (req, res) => {
    try {
        const record = await MediaEvidence.findByPk(req.params.id);
        if (!record || !record.storage_path) {
            return res.status(404).json({ success: false, error: 'Media file not found' });
        }

        const absolutePath = getAbsoluteStoragePath(record.storage_path);
        await fs.promises.access(absolutePath, fs.constants.R_OK);

        res.set('Cache-Control', 'no-store');
        res.type(record.mime_type || 'application/octet-stream');
        res.sendFile(absolutePath);
    } catch (error) {
        console.error('Media content error:', error);
        res.status(404).json({ success: false, error: 'Media file not found' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const record = await MediaEvidence.findByPk(req.params.id);
        if (!record) {
            return res.status(404).json({ success: false, error: 'Media evidence not found' });
        }

        res.json({ success: true, media: serializeMediaEvidence(record) });
    } catch (error) {
        console.error('Get media error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
