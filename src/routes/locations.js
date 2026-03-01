const express = require('express');
const router = express.Router();
const locationsController = require('../controllers/locationsController');
const { authenticate } = require('../middleware/auth');
const { ownerOnly } = require('../middleware/permissions');
const { validateParam } = require('../middleware/validateUUID');

// All endpoints require authentication; only owner can create/update/delete locations
router.use(authenticate);
router.get('/', locationsController.getAll);
router.post('/', ownerOnly, locationsController.create);
router.put('/:id', ownerOnly, validateParam('id'), locationsController.update);
router.delete('/:id', ownerOnly, validateParam('id'), locationsController.remove);

module.exports = router;