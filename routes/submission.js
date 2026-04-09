const router = require('express').Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
const {
  completeAssignment, submitToTeacher, retake,
  setTeacherScore, sendBack, getSubmissionHistory, getMySubmissions, getSubmissionsInbox,
  completeValidation, submitValidation, teacherScoreValidation,
  sendBackValidation, retakeValidation, validate,
} = require('../controllers/submissionController');

// Student routes
router.post('/complete',           protect, restrictTo('student'), completeValidation, validate, completeAssignment);
router.post('/submit',             protect, restrictTo('student'), submitValidation, validate, submitToTeacher);
router.post('/retake',             protect, restrictTo('student'), retakeValidation, validate, retake);
router.get('/mine/:communityId',   protect, restrictTo('student'), getMySubmissions);

// Teacher routes
router.patch('/:id/teacher-score', protect, restrictTo('teacher'), teacherScoreValidation, validate, setTeacherScore);
router.patch('/:id/send-back',     protect, restrictTo('teacher'), sendBackValidation, validate, sendBack);
router.get('/inbox/:communityId',  protect, restrictTo('teacher'), getSubmissionsInbox);

// Shared: full history (teacher reviewing, or student viewing own history)
router.get('/history/:assignmentId/:studentId', protect, getSubmissionHistory);

module.exports = router;
