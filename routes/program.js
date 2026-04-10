// server/routes/program.js
const router = require('express').Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { body, param, validationResult } = require('express-validator');
const {
  createProgram,
  getCommunityPrograms,
  getProgramProgress,
  markItemComplete,
  issueCertificate,
  resetEnrollment,
  enrollStudent,
  getStudentPrograms,
  completeProgramItem,
  getStudentCertificate,
} = require('../controllers/programController');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });
  next();
};

// ── Teacher routes ────────────────────────────────────────────────────────

router.post(
  '/',
  protect, restrictTo('teacher'),
  [
    body('communityId').isMongoId().withMessage('Invalid community ID.'),
    body('name').notEmpty().isLength({ min: 2, max: 120 }).withMessage('Name must be 2–120 chars.'),
    body('curriculumItems').isArray({ min: 1, max: 100 }).withMessage('Must have 1–100 items.'),
    body('curriculumItems.*.surahNumber').isInt({ min: 1, max: 114 }).withMessage('Invalid surah number.'),
    body('curriculumItems.*.ayahStart').isInt({ min: 1 }).withMessage('Invalid ayah start.'),
    body('curriculumItems.*.ayahEnd').isInt({ min: 1 }).withMessage('Invalid ayah end.'),
    body('curriculumItems.*.type').isIn(['recitation', 'memorization']).withMessage('Item type must be recitation or memorization.'),
  ],
  validate,
  createProgram
);

router.get(
  '/community/:communityId',
  protect, restrictTo('teacher'),
  param('communityId').isMongoId(),
  validate,
  getCommunityPrograms
);

router.get(
  '/:programId/progress',
  protect, restrictTo('teacher'),
  param('programId').isMongoId(),
  validate,
  getProgramProgress
);

router.post(
  '/item-complete',
  protect, restrictTo('teacher'),
  [body('enrollmentId').isMongoId(), body('itemIndex').isInt({ min: 0 })],
  validate,
  markItemComplete
);

router.post(
  '/enrollment/:enrollmentId/certify',
  protect, restrictTo('teacher'),
  param('enrollmentId').isMongoId(),
  validate,
  issueCertificate
);

router.post(
  '/enrollment/:enrollmentId/reset',
  protect, restrictTo('teacher'),
  param('enrollmentId').isMongoId(),
  validate,
  resetEnrollment
);

router.post(
  '/:programId/enroll',
  protect, restrictTo('teacher'),
  [param('programId').isMongoId(), body('studentId').isMongoId().withMessage('Invalid student ID.')],
  validate,
  enrollStudent
);

// ── Student routes ────────────────────────────────────────────────────────

router.get(
  '/student/:communityId',
  protect, restrictTo('student'),
  param('communityId').isMongoId(),
  validate,
  getStudentPrograms
);

router.post(
  '/enrollment/:enrollmentId/item/complete',
  protect, restrictTo('student'),
  [
    param('enrollmentId').isMongoId(),
    body('itemIndex').isInt({ min: 0 }).withMessage('Item index must be a non-negative integer.'),
    body('score').optional().isFloat({ min: 0, max: 100 }).withMessage('Score must be 0–100.'),
    body('mistakeCount').optional().isInt({ min: 0 }).withMessage('Mistake count must be a non-negative integer.'),
  ],
  validate,
  completeProgramItem
);

router.get(
  '/enrollment/:enrollmentId/certificate',
  protect, restrictTo('student'),
  param('enrollmentId').isMongoId(),
  validate,
  getStudentCertificate
);

module.exports = router;
