const { loadBackendEnv } = require('./config/runtime');
loadBackendEnv();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { sequelize } = require('./models');

// Import routes
const detectRoutes = require('./routes/detectRoutes');
const alertRoutes = require('./routes/alertRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();
const server = http.createServer(app);

// Socket.IO setup with enhanced stability
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

// Make io available to routes
app.set('io', io);

// Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
    credentials: true
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
});

// Routes
app.use('/api', detectRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/users', userRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.IO connection handling
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

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ success: false, error: err.message });
});

// Start server
const PORT = process.env.PORT || 5000;

async function startServer() {
    try {
        // Test database connection
        await sequelize.authenticate();
        console.log('✅ Database connected');

        // Sync database (create tables if not exist)
        await sequelize.sync({ alter: true });
        console.log('✅ Database schema synced');

        server.listen(PORT, () => {
            console.log(`🚀 MedAlert API server running on http://localhost:${PORT}`);
            console.log(`📡 Socket.IO ready for real-time updates`);
        });

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
