const Assignment  = require('../models/Assignment');
const Community   = require('../models/Community');
const Membership  = require('../models/Membership');
const Submission  = require('../models/Submission');
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

const createValidation = [
  body('communityId').notEmpty().withMessage('Community ID is required.'),
  body('type').isIn(['memorization', 'recitation']).withMessage('Type must be memorization or recitation.'),
  body('surahNumber').isInt({ min: 1, max: 114 }).withMessage('Surah number must be 1–114.'),
  body('ayahStart').isInt({ min: 1 }).withMessage('Start ayah must be a positive integer.'),
  body('ayahEnd').isInt({ min: 1 }).withMessage('End ayah must be a positive integer.')
    .custom((val, { req: r }) => {
      if (parseInt(val) < parseInt(r.body.ayahStart)) throw new Error('End ayah must be >= start ayah.');
      return true;
    }),
  body('dueDate').isISO8601().withMessage('Due date must be a valid ISO date.'),
  body('title').optional().trim().isLength({ max: 120 }).withMessage('Title must be at most 120 characters.'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must be at most 500 characters.'),
  body('assignedTo').optional().isArray().withMessage('assignedTo must be an array.'),
];

// ── TEACHER: Create assignment ────────────────────────────────────────────
async function createAssignment(req, res, next) {
  try {
    const { communityId, title, description, type, surahNumber, ayahStart, ayahEnd, dueDate, assignedTo } = req.body;

    const community = await Community.findOne({ _id: communityId, teacherId: req.user._id });
    if (!community) return res.status(404).json({ success: false, message: 'Community not found or access denied.' });

    // Auto-generate title if blank
    const SURAH_NAMES = [
      '', 'Al-Fatihah', 'Al-Baqarah', 'Ali-Imran', 'An-Nisa', 'Al-Maidah', 'Al-Anam', 'Al-Araf', 'Al-Anfal', 'At-Tawbah', 'Yunus',
      'Hud', 'Yusuf', 'Ar-Rad', 'Ibrahim', 'Al-Hijr', 'An-Nahl', 'Al-Isra', 'Al-Kahf', 'Maryam', 'Ta-Ha',
      'Al-Anbiya', 'Al-Hajj', 'Al-Muminun', 'An-Nur', 'Al-Furqan', 'Ash-Shuara', 'An-Naml', 'Al-Qasas', 'Al-Ankabut', 'Ar-Rum',
      'Luqman', 'As-Sajdah', 'Al-Ahzab', 'Saba', 'Fatir', 'Ya-Sin', 'As-Saffat', 'Sad', 'Az-Zumar', 'Ghafir',
      'Fussilat', 'Ash-Shura', 'Az-Zukhruf', 'Ad-Dukhan', 'Al-Jathiyah', 'Al-Ahqaf', 'Muhammad', 'Al-Fath', 'Al-Hujurat', 'Qaf',
      'Adh-Dhariyat', 'At-Tur', 'An-Najm', 'Al-Qamar', 'Ar-Rahman', 'Al-Waqiah', 'Al-Hadid', 'Al-Mujadila', 'Al-Hashr', 'Al-Mumtahanah',
      'As-Saf', 'Al-Jumuah', 'Al-Munafiqun', 'At-Taghabun', 'At-Talaq', 'At-Tahrim', 'Al-Mulk', 'Al-Qalam', 'Al-Haqqah', 'Al-Maarij',
      'Nuh', 'Al-Jinn', 'Al-Muzzammil', 'Al-Muddaththir', 'Al-Qiyamah', 'Al-Insan', 'Al-Mursalat', 'An-Naba', 'An-Naziat', 'Abasa',
      'At-Takwir', 'Al-Infitar', 'Al-Mutaffifin', 'Al-Inshiqaq', 'Al-Buruj', 'At-Tariq', 'Al-Ala', 'Al-Ghashiyah', 'Al-Fajr', 'Al-Balad',
      'Ash-Shams', 'Al-Layl', 'Ad-Duha', 'Ash-Sharh', 'At-Tin', 'Al-Alaq', 'Al-Qadr', 'Al-Bayyinah', 'Az-Zalzalah', 'Al-Adiyat',
      'Al-Qariah', 'At-Takathur', 'Al-Asr', 'Al-Humazah', 'Al-Fil', 'Quraysh', 'Al-Maun', 'Al-Kawthar', 'Al-Kafirun', 'An-Nasr',
      'Al-Masad', 'Al-Ikhlas', 'Al-Falaq', 'An-Nas',
    ];
    const surahName = SURAH_NAMES[surahNumber] || `Surah ${surahNumber}`;
    const finalTitle = title?.trim() || `${surahName} — ${type === 'memorization' ? 'Memorization' : 'Recitation'} (${ayahStart}–${ayahEnd})`;

    const assignment = await Assignment.create({
      communityId,
      createdBy: req.user._id,
      title: finalTitle,
      description: description || '',
      type,
      surahNumber: parseInt(surahNumber),
      ayahStart: parseInt(ayahStart),
      ayahEnd: parseInt(ayahEnd),
      dueDate: new Date(dueDate),
      assignedTo: assignedTo || [],
    });

    res.status(201).json({ success: true, data: { assignment } });
  } catch (err) {
    next(err);
  }
}

// ── TEACHER: List assignments for a community ────────────────────────────
async function getCommunityAssignments(req, res, next) {
  try {
    const { id: communityId } = req.params;
    const community = await Community.findOne({ _id: communityId, teacherId: req.user._id });
    if (!community) return res.status(404).json({ success: false, message: 'Community not found.' });

    const assignments = await Assignment.find({ communityId }).sort({ dueDate: 1 });

    // Enrich with submission stats
    const studentCount = await Membership.countDocuments({ communityId, status: 'active' });
    const enriched = await Promise.all(
      assignments.map(async (a) => {
        const totalTargeted = a.assignedTo.length === 0 ? studentCount : a.assignedTo.length;
        const submittedCount = await Submission.countDocuments({ assignmentId: a._id, status: 'submitted' });
        return { ...a.toJSON(), totalStudents: totalTargeted, submittedCount };
      })
    );

    res.json({ success: true, data: { assignments: enriched } });
  } catch (err) {
    next(err);
  }
}

// ── TEACHER: Delete assignment ────────────────────────────────────────────
async function deleteAssignment(req, res, next) {
  try {
    const assignment = await Assignment.findById(req.params.id).populate('communityId');
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found.' });
    if (assignment.communityId.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    await assignment.deleteOne();
    await Submission.deleteMany({ assignmentId: assignment._id });
    res.json({ success: true, message: 'Assignment deleted.' });
  } catch (err) {
    next(err);
  }
}

// ── STUDENT: List my assignments in a community ───────────────────────────
async function getMyAssignments(req, res, next) {
  try {
    const { communityId } = req.params;
    const membership = await Membership.findOne({ communityId, studentId: req.user._id, status: 'active' });
    if (!membership) return res.status(403).json({ success: false, message: 'You are not a member of this community.' });

    const assignments = await Assignment.find({
      communityId,
      $or: [{ assignedTo: { $size: 0 } }, { assignedTo: req.user._id }],
    }).sort({ dueDate: 1 });

    const submissions = await Submission.find({
      studentId: req.user._id,
      assignmentId: { $in: assignments.map((a) => a._id) },
    });
    const submissionMap = Object.fromEntries(submissions.map((s) => [s.assignmentId.toString(), s]));

    const now = new Date();
    const enriched = assignments.map((a) => {
      const sub = submissionMap[a._id.toString()];
      let status = sub ? sub.status : 'pending';
      if (status === 'pending' && new Date(a.dueDate) < now) status = 'overdue';
      return {
        ...a.toJSON(),
        submissionStatus: status,
        recitationScore: sub?.recitationScore ?? null,
        mistakeCount: sub?.mistakeCount ?? null,
        completedAt: sub?.completedAt ?? null,
        submittedAt: sub?.submittedAt ?? null,
      };
    });

    res.json({ success: true, data: { assignments: enriched } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createAssignment, getCommunityAssignments, deleteAssignment, getMyAssignments,
  createValidation, validate,
};
