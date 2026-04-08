const router = require('express').Router();
const { protect } = require('../middleware/authMiddleware');
const {
  register, login, refresh, getMe,
  registerValidation, loginValidation, validate, authLimiter,
} = require('../controllers/authController');

router.post('/register', authLimiter, registerValidation, validate, register);
router.post('/login',    authLimiter, loginValidation, validate, login);
router.post('/refresh',  authLimiter, refresh);
router.get('/me',        protect, getMe);

module.exports = router;
