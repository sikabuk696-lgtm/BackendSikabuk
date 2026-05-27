const workerService = require('../services/workerService');
const { safeMessage } = require('../utils/errors');
const { createNotification } = require('../services/notificationService');

/**
 * Worker Management Controller
 * Allows business owner to manage employees
 */
class WorkerController {
  /**
   * Add a new worker
   * POST /api/workers
   * Body: { worker_name, pin }
   * Auth: Owner only
   */
  async addWorker(req, res) {
    try {
      const { worker_name, pin, location_id, role, email } = req.body;
      const business_id = req.businessId; // From auth middleware
      
      const result = await workerService.addWorker({ 
        business_id,
        worker_name, 
        pin,
        location_id,
        role,
        email,
      });

      await createNotification(
        req.businessId, req.workerId, req.workerName, req.role,
        'worker_added',
        'New Team Member',
        `${req.workerName} added ${result.worker?.worker_name || 'a new team member'} to the team`,
        'worker', result.worker?.id
      );
      res.status(201).json({
        success: true,
        message: 'Worker added successfully',
        data: result.worker
      });
    } catch (error) {
      const status = error.status || 500;
      res.status(status).json({
        success: false,
        message: safeMessage(error, 'Failed to add worker')
      });
    }
  }

  /**
   * Get all workers for the business
   * GET /api/workers
   * Auth: Owner only
   */
  async getWorkers(req, res) {
    try {
      const business_id = req.businessId; // From auth middleware
      const location_id = req.query.locationId || null;
      
      const result = await workerService.getWorkers({ business_id, location_id });

      res.status(200).json({
        success: true,
        data: result.workers
      });
    } catch (error) {
      const status = error.status || 500;
      res.status(status).json({
        success: false,
        message: safeMessage(error, 'Failed to fetch workers')
      });
    }
  }

  /**
   * Update worker details
   * PUT /api/workers/:id
   * Body: { worker_name?, pin? }
   * Auth: Owner only
   */
  async updateWorker(req, res) {
    try {
      const worker_id = req.params.id;
      const business_id = req.businessId; // From auth middleware
      const updates = req.body;
      
      const result = await workerService.updateWorker({ 
        worker_id,
        business_id,
        updates 
      });

      res.status(200).json({
        success: true,
        message: 'Worker updated successfully',
        data: result.worker
      });
    } catch (error) {
      const status = error.status || 500;
      res.status(status).json({
        success: false,
        message: safeMessage(error, 'Failed to update worker')
      });
    }
  }

  /**
   * Deactivate a worker
   * DELETE /api/workers/:id
   * Auth: Owner only
   */
  async deactivateWorker(req, res) {
    try {
      const worker_id = req.params.id;
      const business_id = req.businessId; // From auth middleware
      
      const result = await workerService.deactivateWorker({ 
        worker_id,
        business_id 
      });

      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error) {
      const status = error.status || 500;
      res.status(status).json({
        success: false,
        message: safeMessage(error, 'Failed to deactivate worker')
      });
    }
  }

  /**
   * Reactivate a worker
   * POST /api/workers/:id/reactivate
   * Auth: Owner only
   */
  async reactivateWorker(req, res) {
    try {
      const worker_id = req.params.id;
      const business_id = req.businessId; // From auth middleware
      
      const result = await workerService.reactivateWorker({ 
        worker_id,
        business_id 
      });

      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error) {
      const status = error.status || 500;
      res.status(status).json({
        success: false,
        message: safeMessage(error, 'Failed to reactivate worker')
      });
    }
  }

  /**
   * Get worker activity summary
   * GET /api/workers/:id/activity
   * Auth: Owner only
   */
  async getWorkerActivity(req, res) {
    try {
      const worker_id = req.params.id;
      const business_id = req.businessId; // From auth middleware
      
      const result = await workerService.getWorkerActivity({ 
        worker_id,
        business_id 
      });

      res.status(200).json({
        success: true,
        data: result.activity
      });
    } catch (error) {
      const status = error.status || 500;
      res.status(status).json({
        success: false,
        message: safeMessage(error, 'Failed to fetch worker activity')
      });
    }
  }
}

module.exports = new WorkerController();
