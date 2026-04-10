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
  getStudentPrograms,
  updateStudentItemProgress,
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

// ── Student routes ────────────────────────────────────────────────────────

router.get(
  '/student/:communityId',
  protect, restrictTo('student'),
  param('communityId').isMongoId(),
  validate,
  getStudentPrograms
);

router.patch(
  '/enrollment/:enrollmentId/item',
  protect, restrictTo('student'),
  [
    param('enrollmentId').isMongoId(),
    body('itemIndex').isInt({ min: 0 }),
    body('status').isIn(['not_started', 'in_progress', 'completed']),
  ],
  validate,
  updateStudentItemProgress
);

router.get(
  '/enrollment/:enrollmentId/certificate',
  protect, restrictTo('student'),
  param('enrollmentId').isMongoId(),
  validate,
  getStudentCertificate
);

module.exports = router;
