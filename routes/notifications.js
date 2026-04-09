// server/routes/notifications.js
// Endpoint for Flutter to register/update its FCM device token.

const router  = require('express').Router();
const { protect } = require('../middleware/authMiddleware');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');

const tokenValidation = [
  body('fcmToken').notEmpty().isString().withMessage('fcmToken is required.'),
];

router.post('/token', protect, tokenValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }
    const { fcmToken } = req.body;
    await User.findByIdAndUpdate(req.user._id, { fcmToken });
    console.log('[FCM-token] Saved token for user:', req.user._id, '| token prefix:', fcmToken.slice(0, 20) + '...');
    res.json({ success: true, message: 'Device token saved.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
