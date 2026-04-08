const Submission  = require('../models/Submission');
const Assignment  = require('../models/Assignment');
const Membership  = require('../models/Membership');
const { body, validationResult } = require('express-validator');

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

const completeValidation = [
  body('assignmentId').notEmpty().withMessage('Assignment ID is required.'),
  body('recitationScore').optional().isFloat({ min: 0, max: 100 }).withMessage('Score must be 0–100.'),
  body('mistakeCount').optional().isInt({ min: 0 }).withMessage('Mistake count must be a non-negative integer.'),
];

const submitValidation = [
  body('assignmentId').notEmpty().withMessage('Assignment ID is required.'),
];

// ── STUDENT: Mark as completed (local result) ─────────────────────────────
async function completeAssignment(req, res, next) {
  try {
    const { assignmentId, recitationScore, mistakeCount, notes } = req.body;
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found.' });

    const membership = await Membership.findOne({ communityId: assignment.communityId, studentId: req.user._id, status: 'active' });
    if (!membership) return res.status(403).json({ success: false, message: 'You are not a member of this community.' });

    const submission = await Submission.findOneAndUpdate(
      { assignmentId, studentId: req.user._id },
      {
        $setOnInsert: { communityId: assignment.communityId },
        $set: {
          status: 'completed',
          completedAt: new Date(),
          recitationScore: recitationScore ?? null,
          mistakeCount: mistakeCount ?? null,
          notes: notes || '',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, message: 'Assignment marked as completed.', data: { submission } });
  } catch (err) {
    next(err);
  }
}

// ── STUDENT: Submit to teacher ────────────────────────────────────────────
async function submitToTeacher(req, res, next) {
  try {
    const { assignmentId } = req.body;
    const submission = await Submission.findOne({ assignmentId, studentId: req.user._id });
    if (!submission) {
      return res.status(404).json({ success: false, message: 'No completed submission found. Complete the assignment first.' });
    }
    if (submission.status === 'submitted') {
      return res.status(409).json({ success: false, message: 'Assignment already submitted.' });
    }
    submission.status = 'submitted';
    submission.submittedAt = new Date();
    await submission.save();
    res.json({ success: true, message: 'Submitted to your teacher successfully.', data: { submission } });
  } catch (err) {
    next(err);
  }
}

// ── STUDENT: My submissions in a community ────────────────────────────────
async function getMySubmissions(req, res, next) {
  try {
    const { communityId } = req.params;
    const submissions = await Submission.find({ studentId: req.user._id, communityId })
      .populate('assignmentId')
      .sort({ updatedAt: -1 });
    res.json({ success: true, data: { submissions } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  completeAssignment, submitToTeacher, getMySubmissions,
  completeValidation, submitValidation, validate,
};
