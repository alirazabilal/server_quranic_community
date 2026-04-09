const Submission  = require('../models/Submission');
const Assignment  = require('../models/Assignment');
const Community   = require('../models/Community');
const Membership  = require('../models/Membership');
const User        = require('../models/User');
const { sendPush } = require('../utils/notifications');
const { body, param, validationResult } = require('express-validator');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
      errors: errors.array().map((e) => e.msg),
    });
  }
  next();
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Find the latest active submission for a student+assignment, or null */
async function _findLatest(assignmentId, studentId) {
  return Submission.findOne({ assignmentId, studentId, isLatest: true });
}

/** Verify teacher owns the community that contains the submission */
async function _verifyTeacherHasSubmission(submissionId, teacherId) {
  const sub = await Submission.findById(submissionId).populate({ path: 'assignmentId', select: 'communityId' });
  if (!sub) return null;
  const community = await Community.findOne({ _id: sub.assignmentId.communityId, teacherId });
  if (!community) return null;
  return sub;
}

// ── Validation schemas ────────────────────────────────────────────────────

const completeValidation = [
  body('assignmentId').notEmpty().withMessage('Assignment ID is required.'),
  body('recitationScore').optional().isFloat({ min: 0, max: 100 }).withMessage('Score must be 0–100.'),
  body('mistakeCount').optional().isInt({ min: 0 }).withMessage('Mistake count must be a non-negative integer.'),
];

const submitValidation = [
  body('assignmentId').notEmpty().withMessage('Assignment ID is required.'),
];

const teacherScoreValidation = [
  param('id').notEmpty().withMessage('Submission ID is required.'),
  body('teacherScore').isInt({ min: 1, max: 10 }).withMessage('Teacher score must be 1–10.'),
  body('teacherFeedback').optional().trim().isLength({ max: 1000 }).withMessage('Feedback must be at most 1000 characters.'),
];

const sendBackValidation = [
  param('id').notEmpty().withMessage('Submission ID is required.'),
  body('reason').optional().trim().isLength({ max: 500 }).withMessage('Reason must be at most 500 characters.'),
];

const retakeValidation = [
  body('assignmentId').notEmpty().withMessage('Assignment ID is required.'),
];

// ── STUDENT: Mark as completed (with real session data) ───────────────────
async function completeAssignment(req, res, next) {
  try {
    const { assignmentId, recitationScore, mistakeCount, notes } = req.body;
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found.' });

    const membership = await Membership.findOne({ communityId: assignment.communityId, studentId: req.user._id, status: 'active' });
    if (!membership) return res.status(403).json({ success: false, message: 'You are not a member of this community.' });

    // Find or create the latest submission
    let submission = await _findLatest(assignmentId, req.user._id);
    if (!submission) {
      submission = await Submission.create({
        assignmentId,
        studentId: req.user._id,
        communityId: assignment.communityId,
        status: 'completed',
        completedAt: new Date(),
        recitationScore: recitationScore ?? null,
        mistakeCount: mistakeCount ?? null,
        notes: notes || '',
        isLatest: true,
        retakeCount: 0,
      });
    } else {
      // Allow completing if pending or needs_redo (not already submitted)
      if (submission.status === 'submitted') {
        return res.status(409).json({ success: false, message: 'Assignment already submitted. Use retake to start again.' });
      }
      submission.status = 'completed';
      submission.completedAt = new Date();
      submission.recitationScore = recitationScore ?? submission.recitationScore;
      submission.mistakeCount = mistakeCount ?? submission.mistakeCount;
      if (notes) submission.notes = notes;
      await submission.save();
    }

    res.json({ success: true, message: 'Assignment marked as completed.', data: { submission } });
  } catch (err) {
    next(err);
  }
}

// ── STUDENT: Submit to teacher ────────────────────────────────────────────
async function submitToTeacher(req, res, next) {
  try {
    const { assignmentId } = req.body;
    const submission = await _findLatest(assignmentId, req.user._id);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'No completed submission found. Complete the assignment first.' });
    }
    if (submission.status === 'submitted') {
      return res.status(409).json({ success: false, message: 'Assignment already submitted.' });
    }
    if (submission.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Complete the assignment session before submitting.' });
    }
    submission.status = 'submitted';
    submission.submittedAt = new Date();
    await submission.save();
    res.json({ success: true, message: 'Submitted to your teacher successfully.', data: { submission } });
  } catch (err) {
    next(err);
  }
}

// ── STUDENT: Retake — archive current submission, start fresh ─────────────
async function retake(req, res, next) {
  try {
    const { assignmentId } = req.body;
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found.' });

    const membership = await Membership.findOne({ communityId: assignment.communityId, studentId: req.user._id, status: 'active' });
    if (!membership) return res.status(403).json({ success: false, message: 'You are not a member of this community.' });

    const current = await _findLatest(assignmentId, req.user._id);
    const prevRetakeCount = current ? current.retakeCount : 0;

    if (current) {
      // Archive it — mark as no longer latest
      current.isLatest = false;
      await current.save();
    }

    // Create fresh submission for this retake
    const newSubmission = await Submission.create({
      assignmentId,
      studentId: req.user._id,
      communityId: assignment.communityId,
      status: 'pending',
      retakeCount: prevRetakeCount + 1,
      isLatest: true,
    });

    res.json({ success: true, message: 'Retake started. Complete a new session to submit again.', data: { submission: newSubmission } });
  } catch (err) {
    next(err);
  }
}

// ── TEACHER: Set score and feedback ──────────────────────────────────────
async function setTeacherScore(req, res, next) {
  try {
    const { teacherScore, teacherFeedback } = req.body;
    const submission = await _verifyTeacherHasSubmission(req.params.id, req.user._id);
    if (!submission) return res.status(404).json({ success: false, message: 'Submission not found or access denied.' });
    if (submission.status !== 'submitted') {
      return res.status(400).json({ success: false, message: 'Can only score submitted assignments.' });
    }
    submission.teacherScore = parseInt(teacherScore);
    submission.teacherFeedback = teacherFeedback?.trim() || null;
    await submission.save();

    // FCM: notify student
    const student = await User.findById(submission.studentId).select('+fcmToken');
    const assignment = await Assignment.findById(submission.assignmentId).select('title');
    if (student?.fcmToken) {
      await sendPush(
        student.fcmToken,
        'Assignment Scored',
        `Your teacher scored "${assignment?.title ?? 'your assignment'}": ${submission.teacherScore}/10`,
        { type: 'scored', submissionId: submission._id.toString() }
      );
    }

    res.json({ success: true, message: 'Score saved.', data: { submission } });
  } catch (err) {
    next(err);
  }
}

// ── TEACHER: Send back for redo ───────────────────────────────────────────
async function sendBack(req, res, next) {
  try {
    const { reason } = req.body;
    const submission = await _verifyTeacherHasSubmission(req.params.id, req.user._id);
    if (!submission) return res.status(404).json({ success: false, message: 'Submission not found or access denied.' });
    if (submission.status !== 'submitted') {
      return res.status(400).json({ success: false, message: 'Can only send back submitted assignments.' });
    }
    submission.status = 'needs_redo';
    submission.needsRedoReason = reason?.trim() || null;
    await submission.save();

    // FCM: notify student
    const student = await User.findById(submission.studentId).select('+fcmToken');
    const assignment = await Assignment.findById(submission.assignmentId).select('title');
    if (student?.fcmToken) {
      await sendPush(
        student.fcmToken,
        'Please Redo Assignment',
        `Your teacher sent "${assignment?.title ?? 'an assignment'}" back for redo.${reason ? ' Reason: ' + reason.substring(0, 80) : ''}`,
        { type: 'needs_redo', submissionId: submission._id.toString() }
      );
    }

    res.json({ success: true, message: 'Assignment sent back for redo.', data: { submission } });
  } catch (err) {
    next(err);
  }
}

// ── SHARED: Submission history for one assignment+student ─────────────────
async function getSubmissionHistory(req, res, next) {
  try {
    const { assignmentId, studentId } = req.params;
    const history = await Submission.find({ assignmentId, studentId }).sort({ createdAt: -1 });
    res.json({ success: true, data: { history } });
  } catch (err) {
    next(err);
  }
}

// ── STUDENT: My submissions in a community ────────────────────────────────
async function getMySubmissions(req, res, next) {
  try {
    const { communityId } = req.params;
    const submissions = await Submission.find({ studentId: req.user._id, communityId, isLatest: true })
      .populate('assignmentId')
      .sort({ updatedAt: -1 });
    res.json({ success: true, data: { submissions } });
  } catch (err) {
    next(err);
  }
}

// ── TEACHER: All submitted work across the community (inbox) ──────────────
async function getSubmissionsInbox(req, res, next) {
  try {
    const { communityId } = req.params;
    const community = await Community.findOne({ _id: communityId, teacherId: req.user._id });
    if (!community) return res.status(404).json({ success: false, message: 'Community not found.' });

    const submissions = await Submission.find({ communityId, status: 'submitted' })
      .populate('studentId', 'name email avatarInitials')
      .populate('assignmentId', 'title surahNumber ayahStart ayahEnd type')
      .sort({ submittedAt: -1 });

    res.json({ success: true, data: { submissions } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  completeAssignment, submitToTeacher, retake,
  setTeacherScore, sendBack, getSubmissionHistory, getMySubmissions, getSubmissionsInbox,
  completeValidation, submitValidation, teacherScoreValidation, sendBackValidation, retakeValidation,
  validate,
};


