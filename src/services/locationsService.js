const { supabase } = require('../config/database');

/**
 * Locations Service
 * CRUD for business locations/shops
 */

async function getLocations(businessId) {
  if (!businessId) throw new Error('businessId required');
  const { data, error } = await supabase
    .from('locations')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

async function createLocation(businessId, payload) {
  const { name, address, phone, timezone, is_active } = payload;
  if (!businessId || !name) throw new Error('businessId and name are required');
  const { data, error } = await supabase
    .from('locations')
    .insert([{ business_id: businessId, name, address, phone, timezone, is_active }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateLocation(businessId, id, updates) {
  if (!businessId || !id) throw new Error('businessId and id required');
  const { data, error } = await supabase
    .from('locations')
    .update(updates)
    .eq('id', id)
    .eq('business_id', businessId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteLocation(businessId, id) {
  if (!businessId || !id) throw new Error('businessId and id required');
  const { error } = await supabase
    .from('locations')
    .delete()
    .eq('id', id)
    .eq('business_id', businessId);
  if (error) throw error;
  return true;
}

module.exports = {
  getLocations,
  createLocation,
  updateLocation,
  deleteLocation
};