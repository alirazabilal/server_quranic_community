const Community  = require('../models/Community');
const Membership  = require('../models/Membership');
const Submission  = require('../models/Submission');
const Assignment  = require('../models/Assignment');
const User        = require('../models/User');
const { generateUniqueCode } = require('../utils/codeGenerator');
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

// ── TEACHER: Create community ─────────────────────────────────────────────
const createValidation = [
  body('name').trim().notEmpty().isLength({ min: 3, max: 80 }).withMessage('Community name must be 3–80 characters.'),
  body('description').optional().trim().isLength({ max: 300 }).withMessage('Description must be at most 300 characters.'),
];

async function createCommunity(req, res, next) {
  try {
    const { name, description } = req.body;
    const joinCode = await generateUniqueCode();
    const community = await Community.create({
      name,
      description: description || '',
      teacherId: req.user._id,
      joinCode,
    });
    res.status(201).json({ success: true, data: { community } });
  } catch (err) {
    next(err);
  }
}

// ── TEACHER: List my communities ──────────────────────────────────────────
async function getMyCommunities(req, res, next) {
  try {
    const communities = await Community.find({ teacherId: req.user._id, isActive: true }).sort({ createdAt: -1 });

    // Enrich with student count + pending submission count
    const enriched = await Promise.all(
      communities.map(async (c) => {
        const studentCount = await Membership.countDocuments({ communityId: c._id, status: 'active' });
        const pendingCount = await Submission.countDocuments({ communityId: c._id, status: 'submitted' });
        return { ...c.toJSON(), studentCount, pendingSubmissions: pendingCount };
      })
    );
    res.json({ success: true, data: { communities: enriched } });
  } catch (err) {
    next(err);
  }
}

// ── TEACHER: List students in a community ────────────────────────────────
async function getCommunityStudents(req, res, next) {
  try {
    const community = await Community.findOne({ _id: req.params.id, teacherId: req.user._id });
    if (!community) return res.status(404).json({ success: false, message: 'Community not found.' });

    const memberships = await Membership.find({ communityId: community._id, status: 'active' }).populate('studentId', 'name email avatarInitials');

    const students = await Promise.all(
      memberships.map(async (m) => {
        const student = m.studentId;
        const assignments = await Assignment.find({
          communityId: community._id,
          $or: [{ assignedTo: { $size: 0 } }, { assignedTo: student._id }],
        });
        const assignmentIds = assignments.map((a) => a._id);
        const submissions = await Submission.find({ studentId: student._id, assignmentId: { $in: assignmentIds }, isLatest: true });
        const submissionMap = Object.fromEntries(submissions.map((s) => [s.assignmentId.toString(), s]));

        const now = new Date();
        let totalCount = 0, completedCount = 0, submittedCount = 0, overdueCount = 0;
        for (const a of assignments) {
          totalCount++;
          const sub = submissionMap[a._id.toString()];
          const status = sub ? sub.status : 'pending';
          if (status === 'completed') completedCount++;
          if (status === 'submitted') submittedCount++;
          if (status === 'pending' && new Date(a.dueDate) < now) overdueCount++;
        }

        return {
          student: { _id: student._id, name: student.name, email: student.email, avatarInitials: student.avatarInitials },
          joinedAt: m.createdAt,
          totalAssignments: totalCount,
          completed: completedCount,
          submitted: submittedCount,
          overdue: overdueCount,
        };
      })
    );

    res.json({ success: true, data: { community, students } });
  } catch (err) {
    next(err);
  }
}

// ── TEACHER: Detailed progress for one student ────────────────────────────
async function getStudentProgress(req, res, next) {
  try {
    const { id: communityId, studentId } = req.params;
    const community = await Community.findOne({ _id: communityId, teacherId: req.user._id });
    if (!community) return res.status(404).json({ success: false, message: 'Community not found.' });

    const student = await User.findById(studentId).select('name email avatarInitials role');
    if (!student || student.role !== 'student') {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    const membership = await Membership.findOne({ communityId, studentId, status: 'active' });
    if (!membership) return res.status(404).json({ success: false, message: 'Student is not in this community.' });

    const assignments = await Assignment.find({
      communityId,
      $or: [{ assignedTo: { $size: 0 } }, { assignedTo: studentId }],
    }).sort({ dueDate: 1 });

    const submissions = await Submission.find({ studentId, communityId, isLatest: true });
    const submissionMap = Object.fromEntries(submissions.map((s) => [s.assignmentId.toString(), s]));

    const now = new Date();
    const enrichedAssignments = assignments.map((a) => {
      const sub = submissionMap[a._id.toString()];
      let status = sub ? sub.status : 'pending';
      if (status === 'pending' && new Date(a.dueDate) < now) status = 'overdue';
      return {
        ...a.toJSON(),
        submissionId: sub?._id ?? null,
        submissionStatus: status,
        recitationScore: sub?.recitationScore ?? null,
        mistakeCount: sub?.mistakeCount ?? null,
        submittedAt: sub?.submittedAt ?? null,
        completedAt: sub?.completedAt ?? null,
        teacherScore: sub?.teacherScore ?? null,
        teacherFeedback: sub?.teacherFeedback ?? null,
        retakeCount: sub?.retakeCount ?? 0,
        needsRedoReason: sub?.needsRedoReason ?? null,
      };
    });

    res.json({
      success: true,
      data: { student, joinedAt: membership.createdAt, assignments: enrichedAssignments },
    });
  } catch (err) {
    next(err);
  }
}

// ── STUDENT: Join community ───────────────────────────────────────────────
async function joinCommunity(req, res, next) {
  try {
    const { joinCode } = req.body;
    if (!joinCode || joinCode.trim().length !== 6) {
      return res.status(400).json({ success: false, message: 'Join code must be exactly 6 characters.' });
    }
    const community = await Community.findOne({ joinCode: joinCode.trim().toUpperCase(), isActive: true });
    if (!community) {
      return res.status(404).json({ success: false, message: 'Invalid join code. Please check and try again.' });
    }
    const existing = await Membership.findOne({ communityId: community._id, studentId: req.user._id });
    if (existing && existing.status === 'active') {
      return res.status(409).json({ success: false, message: 'You are already a member of this community.' });
    }
    if (existing && existing.status === 'removed') {
      existing.status = 'active';
      await existing.save();
    } else {
      await Membership.create({ communityId: community._id, studentId: req.user._id });
    }
    const teacher = await User.findById(community.teacherId).select('name email avatarInitials');
    res.status(201).json({ success: true, message: 'Joined community successfully.', data: { community, teacher } });
  } catch (err) {
    next(err);
  }
}

// ── STUDENT: List joined communities ─────────────────────────────────────
async function getJoinedCommunities(req, res, next) {
  try {
    const memberships = await Membership.find({ studentId: req.user._id, status: 'active' })
      .populate({ path: 'communityId', match: { isActive: true } });

    const now = new Date();
    const result = await Promise.all(
      memberships
        .filter((m) => m.communityId) // filter out deleted communities
        .map(async (m) => {
          const community = m.communityId;
          const teacher = await User.findById(community.teacherId).select('name email avatarInitials');

          const assignments = await Assignment.find({
            communityId: community._id,
            $or: [{ assignedTo: { $size: 0 } }, { assignedTo: req.user._id }],
          });
          const assignmentIds = assignments.map((a) => a._id);
          const submissions = await Submission.find({ studentId: req.user._id, assignmentId: { $in: assignmentIds }, isLatest: true });
          const submissionMap = Object.fromEntries(submissions.map((s) => [s.assignmentId.toString(), s]));

          let pendingCount = 0, overdueCount = 0;
          for (const a of assignments) {
            const sub = submissionMap[a._id.toString()];
            const status = sub ? sub.status : 'pending';
            if (status === 'pending') {
              if (new Date(a.dueDate) < now) overdueCount++;
              else pendingCount++;
            }
          }

          return { community, teacher, joinedAt: m.createdAt, pendingAssignments: pendingCount, overdueAssignments: overdueCount };
        })
    );

    res.json({ success: true, data: { communities: result } });
  } catch (err) {
    next(err);
  }
}

// ── TEACHER: Remove a student from community ──────────────────────────────
async function removeStudent(req, res, next) {
  try {
    const { communityId, studentId } = req.params;
    const community = await Community.findOne({ _id: communityId, teacherId: req.user._id });
    if (!community) return res.status(404).json({ success: false, message: 'Community not found.' });

    const membership = await Membership.findOne({ communityId, studentId, status: 'active' });
    if (!membership) return res.status(404).json({ success: false, message: 'Student is not in this community.' });

    membership.status = 'removed';
    await membership.save();
    res.json({ success: true, message: 'Student removed from community.' });
  } catch (err) {
    next(err);
  }
}

// ── STUDENT: Leave a community ────────────────────────────────────────────
async function leaveCommunity(req, res, next) {
  try {
    const { communityId } = req.params;
    const membership = await Membership.findOne({ communityId, studentId: req.user._id, status: 'active' });
    if (!membership) return res.status(404).json({ success: false, message: 'You are not a member of this community.' });

    membership.status = 'removed';
    await membership.save();
    res.json({ success: true, message: 'You have left the community.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createCommunity, getMyCommunities, getCommunityStudents, getStudentProgress,
  joinCommunity, getJoinedCommunities,
  removeStudent, leaveCommunity,
  createValidation, validate,
};
