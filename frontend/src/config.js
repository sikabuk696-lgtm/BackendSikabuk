/**
 * Frontend Environment Configuration
 * Automatically selects dev or prod API URL based on build environment
 */

const isDev = process.env.NODE_ENV === 'development';

const config = {
  // API URL (auto-selects based on environment)
  apiUrl: isDev 
    ? process.env.REACT_APP_API_URL_DEV 
    : process.env.REACT_APP_API_URL_PROD,
  
  // Environment info
  isDevelopment: isDev,
  isProduction: !isDev,
  
  // App settings
  appName: '₵ikaBuk',
  tokenKey: 'sikabuk_token', // localStorage key for JWT token
};

// Validate configuration
if (!config.apiUrl) {
  console.error('❌ API URL not configured! Check your .env file');
  console.error(`   Looking for: REACT_APP_API_URL_${isDev ? 'DEV' : 'PROD'}`);
}

// Log configuration (only in development)
if (isDev) {
  console.log('🌍 Frontend Environment:', process.env.NODE_ENV);
  console.log('🔗 API URL:', config.apiUrl);
}

export default config;
