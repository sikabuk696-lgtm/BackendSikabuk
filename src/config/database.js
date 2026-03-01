const { createClient } = require('@supabase/supabase-js');
const config = require('./env');

// Initialize Supabase client with environment config
const supabase = createClient(
  config.supabase.url,
  config.supabase.key
);

/**
 * Test database connection
 */
async function testConnection() {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('❌ Database connection failed:', error.message);
      return false;
    }
    
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    return false;
  }
}

module.exports = {
  supabase,
  testConnection
};
