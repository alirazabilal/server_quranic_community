const router = require('express').Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
const {
  createCommunity, getMyCommunities, getCommunityStudents, getStudentProgress,
  joinCommunity, getJoinedCommunities,
  createValidation, validate,
} = require('../controllers/communityController');

// Teacher routes
router.post('/create',                protect, restrictTo('teacher'), createValidation, validate, createCommunity);
router.get('/mine',                   protect, restrictTo('teacher'), getMyCommunities);
router.get('/:id/students',           protect, restrictTo('teacher'), getCommunityStudents);
router.get('/:id/student/:studentId', protect, restrictTo('teacher'), getStudentProgress);

// Student routes
router.post('/join',                  protect, restrictTo('student'), joinCommunity);
router.get('/joined',                 protect, restrictTo('student'), getJoinedCommunities);

module.exports = router;
