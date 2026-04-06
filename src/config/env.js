require('dotenv').config();

/**
 * Environment Configuration Manager
 * Automatically selects dev or prod values based on NODE_ENV
 */

const env = process.env.NODE_ENV || 'development';
const isDev = env === 'development';
const isProd = env === 'production';

// Configuration object that auto-selects based on environment
const config = {
  // Server
  port: process.env.PORT || 5000,
  nodeEnv: env,
  isDevelopment: isDev,
  isProduction: isProd,
  
  // Supabase (same for both environments)
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
  },
  
  // JWT Authentication (auto-selects based on NODE_ENV)
  jwt: {
    secret: isDev ? process.env.JWT_SECRET_DEV : process.env.JWT_SECRET_PROD,
    expiresIn: '24h',
  },
  
  // AI Integration
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },

  // WhatsApp notifications via Hubtel (optional — fails gracefully if absent)
  whatsapp: {
    apiKey:       process.env.HUBTEL_WHATSAPP_API_KEY,
    clientSecret: process.env.HUBTEL_WHATSAPP_CLIENT_SECRET,
    senderId:     process.env.HUBTEL_WHATSAPP_SENDER_ID || 'SikaBuk',
  },
  
  // CORS (auto-selects based on NODE_ENV)
  frontendUrl: isDev ? process.env.FRONTEND_URL_DEV : process.env.FRONTEND_URL_PROD,
  
  // Debug mode
  debug: process.env.DEBUG === 'true',
};

// Validate required environment variables
const required = [
  'SUPABASE_URL',
  'SUPABASE_KEY',
];

// Add environment-specific required variables
if (isDev) {
  required.push('JWT_SECRET_DEV', 'FRONTEND_URL_DEV');
} else {
  required.push('JWT_SECRET_PROD', 'FRONTEND_URL_PROD');
}

const missing = required.filter(key => !process.env[key]);

if (missing.length > 0) {
  console.error('❌ Missing required environment variables:');
  missing.forEach(key => console.error(`   - ${key}`));
  console.error('\n💡 Update your .env file');
  process.exit(1);
}

// Validate Supabase URL format
if (config.supabase.url && !config.supabase.url.includes('.supabase.co')) {
  console.warn('⚠️ SUPABASE_URL format looks incorrect. Should be: https://xxx.supabase.co');
}

// Validate JWT secret strength
if (config.jwt.secret && config.jwt.secret.length < 32) {
  console.warn(`⚠️ JWT_SECRET_${env.toUpperCase()} should be at least 32 characters for security`);
  if (isProd) {
    console.error('❌ JWT secret too short for production! Exiting...');
    process.exit(1);
  }
}

// Log current environment
console.log(`🌍 Environment: ${env}`);
console.log(`🔗 Frontend URL: ${config.frontendUrl}`);
console.log(`🔐 JWT Secret: ${config.jwt.secret.substring(0, 10)}...`);
console.log(`⚡ Supabase: ${config.supabase.url ? '✅ Connected' : '❌ Not configured'}`);

module.exports = config;
