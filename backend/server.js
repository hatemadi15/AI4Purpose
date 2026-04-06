const { loadBackendEnv } = require('./config/runtime');
loadBackendEnv();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { sequelize } = require('./models');
const { ensureMediaStorageDir, startMediaCleanupJob } = require('./services/mediaService');

// Import routes
const detectRoutes = require('./routes/detectRoutes');
const alertRoutes = require('./routes/alertRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const userRoutes = require('./routes/userRoutes');

// Start server
const PORT = process.env.PORT || 5000;

function createApp() {
    const app = express();

    app.use(cors({
        origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
        credentials: true
    }));
    app.use(express.json());

    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
        next();
    });

    app.use('/api', detectRoutes);
    app.use('/api/alerts', alertRoutes);
    app.use('/api/media', mediaRoutes);
    app.use('/api/users', userRoutes);

    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    app.use((err, req, res, next) => {
        console.error('Server error:', err);
        res.status(500).json({ success: false, error: err.message });
    });

    return app;
}

function createRealtimeServer(app) {
    const server = http.createServer(app);
    const io = new Server(server, {
        cors: {
            origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
            methods: ['GET', 'POST'],
            credentials: true
        },
        transports: ['polling', 'websocket'],
        pingTimeout: 60000,
        pingInterval: 25000,
        allowEIO3: true
    });

    app.set('io', io);

    io.on('connection', (socket) => {
        console.log(`Client connected: ${socket.id}`);

        socket.on('join_dashboard', () => {
            socket.join('dashboard');
            console.log(`${socket.id} joined dashboard room`);
        });

        socket.on('join_user', (userId) => {
            socket.join(`user_${userId}`);
            console.log(`${socket.id} joined user room: user_${userId}`);
        });

        socket.on('disconnect', () => {
            console.log(`Client disconnected: ${socket.id}`);
        });
    });

    return { server, io };
}

async function startServer({ port = PORT } = {}) {
    const app = createApp();
    const { server, io } = createRealtimeServer(app);

    try {
        ensureMediaStorageDir();
        await sequelize.authenticate();
        console.log('✅ Database connected');

        await sequelize.sync({ alter: true });
        console.log('✅ Database schema synced');

        startMediaCleanupJob();

        await new Promise((resolve) => {
            server.listen(port, resolve);
        });

        console.log(`🚀 MedAlert API server running on http://localhost:${port}`);
        console.log('📡 Socket.IO ready for real-time updates');
        return { app, server, io };
    } catch (error) {
        console.error('Failed to start server:', error);
        throw error;
    }
}

if (require.main === module) {
    startServer().catch(() => {
        process.exit(1);
    });
}

module.exports = {
    createApp,
    createRealtimeServer,
    startServer
};
