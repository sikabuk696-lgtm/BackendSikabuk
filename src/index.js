const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config/env');
const authRoutes = require('./routes/auth');
const workerRoutes = require('./routes/workers');
const productRoutes = require('./routes/products');
const customerRoutes = require('./routes/customers');
const salesRoutes = require('./routes/sales');
const expenseRoutes = require('./routes/expenses');
const analyticsRoutes = require('./routes/analytics');
const productUploadRoutes = require('./routes/productUpload');
const locationsRoutes = require('./routes/locations');
const pendingRoutes = require('./routes/pending');
const { globalErrorHandler } = require('./utils/errors');

const app = express();

// ── Trust the first proxy hop (Render.com, Nginx, etc.)
// Required so express-rate-limit reads the real client IP from X-Forwarded-For
app.set('trust proxy', 1);

// ── HTTP security headers (helmet)
app.use(helmet({
  // Content Security Policy — tightened for an API-only backend
  contentSecurityPolicy: config.isProduction ? {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    }
  } : false, // disable CSP in dev to avoid blocking the health-check page
  // Enforce HTTPS in production
  hsts: config.isProduction
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
  crossOriginEmbedderPolicy: false, // allow Supabase CDN assets
}));

// ── CORS
const corsOptions = {
  origin(origin, callback) {
    // Allow server-to-server calls (no Origin header) only in dev
    if (!origin) {
      if (config.isDevelopment) return callback(null, true);
      return callback(new Error('Origin header required'));
    }
    if (origin === config.frontendUrl) return callback(null, true);
    return callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // preflight cache 24h
};
app.use(cors(corsOptions));
// Pre-flight response for all routes
app.options('*', cors(corsOptions));

// ── Body parsing with explicit size limits
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'SikaBuk API is running',
    environment: config.nodeEnv,
    timestamp: new Date().toISOString()
  });
});

// Auth routes (public)
app.use('/api/auth', authRoutes);

// Worker management routes (owner only)
app.use('/api/workers', workerRoutes);

// Business feature routes (authenticated workers/owners)
// Keep upload route first so /upload-excel continues to work, then full CRUD routes
app.use('/api/products', productUploadRoutes);
app.use('/api/products', productRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/pending', pendingRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handling middleware — sanitises 5xx messages in production
app.use(globalErrorHandler);


// Start server (save server instance so we can handle listen errors)
const server = app.listen(config.port, () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log('✅ Server started successfully');
  console.log(`🌍 Environment: ${config.nodeEnv}`);
  console.log(`🔗 Frontend URL: ${config.frontendUrl}`);
  console.log(`🔐 JWT Secret: ${String(config.jwt?.secret ?? '').slice(0, 12) + '...'}`);
  console.log(`⚡ Supabase: ${config.supabase ? '✅ Connected' : '❌ Not configured'}`);
  console.log(`${'='.repeat(50)}\n`);
});

// Handle server-level errors (EADDRINUSE etc.)
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`ERROR: Port ${config.port} is already in use.\n` +
      `- Another process is listening on that port.\n` +
      `- Kill the other process or change PORT in your environment.`);
    process.exit(1);
  }
  console.error('Server error:', err);
  process.exit(1);
});

// Global uncaught exception / rejection handlers for cleaner failures
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Recommended: capture to monitoring, then exit to allow process manager to restart
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception - shutting down:', err);
  process.exit(1);
});

module.exports = app;
