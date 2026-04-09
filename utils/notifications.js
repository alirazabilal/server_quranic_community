// server/utils/notifications.js
// FCM push-notification helper with graceful degradation.
// If FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY env
// vars are not set the module simply no-ops — no crashes.

let _messaging = null;

function _init() {
  if (_messaging !== null) return; // already attempted init
  if (!process.env.FIREBASE_PROJECT_ID) {
    console.warn('[FCM] FIREBASE_PROJECT_ID not set — push notifications disabled.');
    _messaging = false; // sentinel: don't retry
    return;
  }
  try {
    // eslint-disable-next-line global-require
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId:   process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        }),
      });
    }
    _messaging = admin.messaging();
    console.log('[FCM] Firebase Admin initialised ✅');
  } catch (e) {
    console.error('[FCM] Init failed:', e.message);
    _messaging = false;
  }
}

/**
 * Send a single push notification.
 * @param {string|null} fcmToken  Device FCM token (from User.fcmToken)
 * @param {string}      title     Notification title
 * @param {string}      body      Notification body
 * @param {object}      [data]    Optional key-value string data payload
 */
async function sendPush(fcmToken, title, body, data = {}) {
  _init();
  if (!_messaging || !fcmToken) return; // disabled or no token

  // Ensure all data values are strings (FCM requirement)
  const stringData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v)])
  );

  try {
    await _messaging.send({
      token: fcmToken,
      notification: { title, body },
      data: stringData,
      android: { priority: 'high' },
    });
  } catch (e) {
    // Log but never crash the request handler
    console.warn('[FCM] Send failed:', e.message);
  }
}

module.exports = { sendPush };
