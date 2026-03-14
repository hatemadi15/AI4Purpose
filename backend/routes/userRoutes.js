const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { getVapidPublicKey } = require('../services/pushService');

// GET /api/users - Get all users
router.get('/', async (req, res) => {
    try {
        const users = await User.findAll({
            order: [['id', 'ASC']]
        });
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/users/vapid-public-key - Get VAPID public key for push subscription
router.get('/vapid-public-key', (req, res) => {
    res.json({
        success: true,
        publicKey: getVapidPublicKey()
    });
});

// GET /api/users/:id - Get single user
router.get('/:id', async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/users/:id/subscribe - Save push subscription
router.post('/:id/subscribe', async (req, res) => {
    try {
        const { subscription } = req.body;

        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ success: false, error: 'Invalid subscription object' });
        }

        const user = await User.findByPk(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        await user.update({ push_subscription: subscription });

        res.json({
            success: true,
            message: 'Push subscription saved',
            userId: user.id
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/users/:id/unsubscribe - Remove push subscription
router.delete('/:id/unsubscribe', async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        await user.update({ push_subscription: null });

        res.json({ success: true, message: 'Push subscription removed' });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
