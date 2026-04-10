// server/routes/certificate.js
// Public endpoint — no authentication required.
const router = require('express').Router();
const { param, validationResult } = require('express-validator');
const { verifyCertificate } = require('../controllers/programController');

router.get(
  '/verify/:hash',
  param('hash').isAlphanumeric().isLength({ min: 8, max: 20 }).withMessage('Invalid hash.'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.json({ valid: false, message: 'Invalid certificate hash format.' });
    next();
  },
  verifyCertificate
);

module.exports = router;
