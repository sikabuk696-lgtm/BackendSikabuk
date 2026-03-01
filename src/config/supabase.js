// Re-export supabase client from database.js for convenience
const { supabase, testConnection } = require('./database');

module.exports = {
  supabase,
  testConnection
};
