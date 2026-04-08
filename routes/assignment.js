const router = require('express').Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
const {
  createAssignment, getCommunityAssignments, deleteAssignment, getMyAssignments,
  createValidation, validate,
} = require('../controllers/assignmentController');

// Teacher routes
router.post('/create',          protect, restrictTo('teacher'), createValidation, validate, createAssignment);
router.get('/community/:id',    protect, restrictTo('teacher'), getCommunityAssignments);
router.delete('/:id',           protect, restrictTo('teacher'), deleteAssignment);

// Student routes
router.get('/mine/:communityId', protect, restrictTo('student'), getMyAssignments);

module.exports = router;
