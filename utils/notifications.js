// server/utils/notifications.js
// FCM push-notification helper with graceful degradation.
// If FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY env
// vars are not set the module simply no-ops — no crashes.

let _messaging = null;

function _init() {
  if (_messaging !== null) return; // already attempted init
  if (!process.env.FIREBASE_PROJECT_ID) {
    console.warn('[FCM] FIREBASE_PROJECT_ID not set — push notifications disabled.');
    _messaging = false;
    return;
  }
  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      const rawKey = process.env.FIREBASE_PRIVATE_KEY || '';
      const privateKey = rawKey.includes('\n')
        ? rawKey
        : rawKey.replace(/\\n/g, '\n');

      console.log('[FCM] Initialising Firebase Admin...');
      console.log('[FCM]  project_id  :', process.env.FIREBASE_PROJECT_ID);
      console.log('[FCM]  client_email:', process.env.FIREBASE_CLIENT_EMAIL);
      console.log('[FCM]  key_length  :', privateKey.length, '| starts:', privateKey.slice(0, 27));

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId:   process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey,
        }),
      });
    }
    _messaging = admin.messaging();
    console.log('[FCM] Firebase Admin initialised ✅');
  } catch (e) {
    console.error('[FCM] Init FAILED ❌:', e.message);
    _messaging = false;
  }
}

/** Call this at server startup to log FCM status immediately. */
function initOnStartup() { _init(); }

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
    console.log('[FCM] Push sent ✅ title:', title);
  } catch (e) {
    // Log but never crash the request handler
    console.warn('[FCM] Send failed:', e.message);
  }
}

module.exports = { sendPush, initOnStartup };
