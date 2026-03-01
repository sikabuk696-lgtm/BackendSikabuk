const locationsService = require('../services/locationsService');

class LocationsController {
  async getAll(req, res) {
    try {
      const businessId = req.businessId;
      const data = await locationsService.getLocations(businessId);
      return res.status(200).json({ success: true, locations: data });
    } catch (err) {
      console.error('Get locations error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Failed to get locations' });
    }
  }

  async create(req, res) {
    try {
      const businessId = req.businessId;
      const payload = req.body;
      const loc = await locationsService.createLocation(businessId, payload);
      return res.status(201).json({ success: true, location: loc });
    } catch (err) {
      console.error('Create location error:', err);
      return res.status(400).json({ success: false, error: err.message || 'Failed to create location' });
    }
  }

  async update(req, res) {
    try {
      const businessId = req.businessId;
      const id = req.params.id;
      const updates = req.body;
      const loc = await locationsService.updateLocation(businessId, id, updates);
      return res.status(200).json({ success: true, location: loc });
    } catch (err) {
      console.error('Update location error:', err);
      return res.status(400).json({ success: false, error: err.message || 'Failed to update location' });
    }
  }

  async remove(req, res) {
    try {
      const businessId = req.businessId;
      const id = req.params.id;
      await locationsService.deleteLocation(businessId, id);
      return res.status(200).json({ success: true, message: 'Location deleted' });
    } catch (err) {
      console.error('Delete location error:', err);
      return res.status(400).json({ success: false, error: err.message || 'Failed to delete location' });
    }
  }
}

module.exports = new LocationsController();