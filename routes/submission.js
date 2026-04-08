const router = require('express').Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
const {
  completeAssignment, submitToTeacher, getMySubmissions,
  completeValidation, submitValidation, validate,
} = require('../controllers/submissionController');

router.post('/complete',           protect, restrictTo('student'), completeValidation, validate, completeAssignment);
router.post('/submit',             protect, restrictTo('student'), submitValidation, validate, submitToTeacher);
router.get('/mine/:communityId',   protect, restrictTo('student'), getMySubmissions);

module.exports = router;
