// server/controllers/programController.js
'use strict';

const crypto            = require('crypto');
const Program           = require('../models/Program');
const ProgramEnrollment = require('../models/ProgramEnrollment');
const Membership        = require('../models/Membership');
const Community         = require('../models/Community');
const User              = require('../models/User');

// ── Helpers ───────────────────────────────────────────────────────────────
function _enrichEnrollment(e, totalItems) {
  return {
    id:              e._id,
    overallStatus:   e.overallStatus,
    certifiedAt:     e.certifiedAt,
    certificateHash: e.certificateHash,
    itemProgress:    e.itemProgress,
    completedItems:  e.itemProgress.filter(p => p.status === 'completed').length,
    totalItems,
  };
}

function _buildInitialProgress(count) {
  return Array.from({ length: count }, (_, i) => ({
    itemIndex: i, status: 'not_started', completedAt: null,
  }));
}

// ── Teacher: Create program ───────────────────────────────────────────────
async function createProgram(req, res, next) {
  try {
    const { communityId, name, description, curriculumItems, assignedTo } = req.body;

    const community = await Community.findOne({ _id: communityId, teacherId: req.user._id });
    if (!community) return res.status(403).json({ success: false, message: 'Not your community.' });

    const program = await Program.create({
      communityId,
      createdBy:      req.user._id,
      name,
      description:    description || '',
      curriculumItems: curriculumItems || [],
      assignedTo:     assignedTo   || [],
    });

    // Determine students to enroll
    let studentIds = Array.isArray(assignedTo) && assignedTo.length > 0 ? assignedTo : [];
    if (!studentIds.length) {
      const memberships = await Membership.find({ communityId, isActive: true });
      studentIds = memberships.map(m => m.studentId.toString());
    }

    if (studentIds.length > 0) {
      const itemProgress = _buildInitialProgress(program.curriculumItems.length);
      const docs = studentIds.map(studentId => ({
        programId: program._id, studentId, communityId,
        itemProgress, overallStatus: 'in_progress',
      }));
      await ProgramEnrollment.insertMany(docs, { ordered: false }).catch(() => {});
    }

    res.status(201).json({ success: true, program });
  } catch (err) {
    next(err);
  }
}

// ── Teacher: List programs for a community ────────────────────────────────
async function getCommunityPrograms(req, res, next) {
  try {
    const { communityId } = req.params;
    const community = await Community.findOne({ _id: communityId, teacherId: req.user._id });
    if (!community) return res.status(403).json({ success: false, message: 'Not your community.' });

    const programs = await Program.find({ communityId }).sort('-createdAt');
    res.json({ success: true, programs });
  } catch (err) {
    next(err);
  }
}

// ── Teacher: Per-student progress for a program ───────────────────────────
async function getProgramProgress(req, res, next) {
  try {
    const { programId } = req.params;
    const program = await Program.findById(programId);
    if (!program) return res.status(404).json({ success: false, message: 'Program not found.' });

    const community = await Community.findOne({ _id: program.communityId, teacherId: req.user._id });
    if (!community) return res.status(403).json({ success: false, message: 'Not your program.' });

    const enrollments = await ProgramEnrollment.find({ programId })
      .populate('studentId', 'name email avatarInitials');

    const result = enrollments.map(e => ({
      enrollment: _enrichEnrollment(e, program.curriculumItems.length),
      student:    e.studentId,
    }));

    res.json({ success: true, program, enrollments: result });
  } catch (err) {
    next(err);
  }
}

// ── Teacher: Mark an item complete on behalf of a student ─────────────────
async function markItemComplete(req, res, next) {
  try {
    const { enrollmentId, itemIndex } = req.body;
    const idx = Number(itemIndex);

    const enrollment = await ProgramEnrollment.findById(enrollmentId);
    if (!enrollment) return res.status(404).json({ success: false, message: 'Enrollment not found.' });

    const program = await Program.findById(enrollment.programId);
    const community = await Community.findOne({ _id: program.communityId, teacherId: req.user._id });
    if (!community) return res.status(403).json({ success: false, message: 'Not your program.' });

    if (idx < 0 || idx >= program.curriculumItems.length) {
      return res.status(400).json({ success: false, message: 'Invalid item index.' });
    }

    const item = enrollment.itemProgress.find(p => p.itemIndex === idx);
    if (item) {
      item.status = 'completed'; item.completedAt = new Date();
    } else {
      enrollment.itemProgress.push({ itemIndex: idx, status: 'completed', completedAt: new Date() });
    }

    const completedCount = enrollment.itemProgress.filter(p => p.status === 'completed').length;
    if (completedCount >= program.curriculumItems.length && enrollment.overallStatus === 'in_progress') {
      enrollment.overallStatus = 'completed';
    }
    await enrollment.save();

    res.json({ success: true, enrollment: _enrichEnrollment(enrollment, program.curriculumItems.length) });
  } catch (err) {
    next(err);
  }
}

// ── Teacher: Issue certificate ────────────────────────────────────────────
async function issueCertificate(req, res, next) {
  try {
    const { enrollmentId } = req.params;
    const enrollment = await ProgramEnrollment.findById(enrollmentId);
    if (!enrollment) return res.status(404).json({ success: false, message: 'Enrollment not found.' });

    // Immutability guard
    if (enrollment.certificateHash) {
      return res.status(400).json({ success: false, message: 'Certificate already issued and cannot be re-issued.' });
    }

    const program = await Program.findById(enrollment.programId).populate('createdBy', 'name');
    const community = await Community.findOne({ _id: program.communityId, teacherId: req.user._id });
    if (!community) return res.status(403).json({ success: false, message: 'Not your program.' });

    const completedCount = enrollment.itemProgress.filter(p => p.status === 'completed').length;
    if (completedCount < program.curriculumItems.length) {
      return res.status(400).json({ success: false, message: 'Student has not completed all program items.' });
    }

    const hash = crypto.randomBytes(6).toString('hex').toUpperCase(); // 12-char
    enrollment.overallStatus   = 'certified';
    enrollment.certifiedAt     = new Date();
    enrollment.certificateHash = hash;
    await enrollment.save();

    const student = await User.findById(enrollment.studentId).select('name');

    res.json({
      success: true,
      certificate: {
        hash,
        studentName:     student ? student.name : '',
        programName:     program.name,
        teacherName:     program.createdBy ? program.createdBy.name : '',
        certifiedAt:     enrollment.certifiedAt,
        curriculumItems: program.curriculumItems,
        communityName:   community.name,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── Teacher: Reset enrollment (cannot reset if certified) ─────────────────
async function resetEnrollment(req, res, next) {
  try {
    const { enrollmentId } = req.params;
    const enrollment = await ProgramEnrollment.findById(enrollmentId);
    if (!enrollment) return res.status(404).json({ success: false, message: 'Enrollment not found.' });

    if (enrollment.certificateHash) {
      return res.status(400).json({ success: false, message: 'Cannot reset a certified enrollment.' });
    }

    const program = await Program.findById(enrollment.programId);
    const community = await Community.findOne({ _id: program.communityId, teacherId: req.user._id });
    if (!community) return res.status(403).json({ success: false, message: 'Not your program.' });

    enrollment.itemProgress  = _buildInitialProgress(program.curriculumItems.length);
    enrollment.overallStatus = 'in_progress';
    await enrollment.save();

    res.json({ success: true, message: 'Progress reset successfully.' });
  } catch (err) {
    next(err);
  }
}

// ── Student: Get enrolled programs for a community ────────────────────────
async function getStudentPrograms(req, res, next) {
  try {
    const { communityId } = req.params;
    const enrollments = await ProgramEnrollment.find({
      studentId: req.user._id,
      communityId,
    }).populate({ path: 'programId', populate: { path: 'createdBy', select: 'name' } });

    const result = enrollments.map(e => {
      const prog = e.programId;
      return {
        enrollment: _enrichEnrollment(e, prog ? prog.curriculumItems.length : 0),
        program:    prog,
      };
    });

    res.json({ success: true, enrollments: result });
  } catch (err) {
    next(err);
  }
}

// ── Student: Record completion of a curriculum item after a real session ──
// Called automatically by the app after SessionValidator confirms the student
// actually recited/memorized the required ayahs. Replaces manual status picker.
async function completeProgramItem(req, res, next) {
  try {
    const { enrollmentId } = req.params;
    const { itemIndex, score, mistakeCount } = req.body;
    const idx = Number(itemIndex);

    const enrollment = await ProgramEnrollment.findOne({ _id: enrollmentId, studentId: req.user._id });
    if (!enrollment) return res.status(404).json({ success: false, message: 'Enrollment not found or not yours.' });

    if (enrollment.overallStatus === 'certified') {
      return res.status(400).json({ success: false, message: 'Program already certified.' });
    }

    const program = await Program.findById(enrollment.programId);
    if (!program) return res.status(404).json({ success: false, message: 'Program not found.' });

    if (idx < 0 || idx >= program.curriculumItems.length) {
      return res.status(400).json({ success: false, message: 'Invalid item index.' });
    }

    const item = enrollment.itemProgress.find(p => p.itemIndex === idx);
    if (item) {
      item.status      = 'completed';
      item.completedAt = new Date();
      if (score        != null) item.score        = score;
      if (mistakeCount != null) item.mistakeCount = mistakeCount;
    } else {
      enrollment.itemProgress.push({
        itemIndex: idx, status: 'completed', completedAt: new Date(),
        score: score ?? null, mistakeCount: mistakeCount ?? null,
      });
    }

    const completedCount = enrollment.itemProgress.filter(p => p.status === 'completed').length;
    if (completedCount >= program.curriculumItems.length && enrollment.overallStatus === 'in_progress') {
      enrollment.overallStatus = 'completed';
    }
    await enrollment.save();

    res.json({ success: true, enrollment: _enrichEnrollment(enrollment, program.curriculumItems.length) });
  } catch (err) {
    next(err);
  }
}

// ── Student: Get certificate data for their own enrollment ────────────────
async function getStudentCertificate(req, res, next) {
  try {
    const { enrollmentId } = req.params;
    const enrollment = await ProgramEnrollment.findOne({ _id: enrollmentId, studentId: req.user._id });
    if (!enrollment || !enrollment.certificateHash) {
      return res.status(404).json({ success: false, message: 'Certificate not found.' });
    }

    const program   = await Program.findById(enrollment.programId).populate('createdBy', 'name');
    const community = await Community.findById(enrollment.communityId);
    const student   = await User.findById(enrollment.studentId).select('name');

    res.json({
      success: true,
      certificate: {
        hash:            enrollment.certificateHash,
        studentName:     student   ? student.name          : '',
        programName:     program   ? program.name          : '',
        teacherName:     (program && program.createdBy) ? program.createdBy.name : '',
        certifiedAt:     enrollment.certifiedAt,
        curriculumItems: program   ? program.curriculumItems : [],
        communityName:   community ? community.name        : '',
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── Public: Verify certificate by hash ────────────────────────────────────
async function verifyCertificate(req, res, next) {
  try {
    const { hash } = req.params;
    const enrollment = await ProgramEnrollment.findOne({ certificateHash: hash.toUpperCase() });
    if (!enrollment) {
      return res.json({ valid: false, message: 'Certificate not found.' });
    }

    const program = await Program.findById(enrollment.programId).populate('createdBy', 'name');
    const student = await User.findById(enrollment.studentId).select('name');

    res.json({
      valid:           true,
      studentName:     student  ? student.name          : '',
      programName:     program  ? program.name          : '',
      teacherName:     (program && program.createdBy) ? program.createdBy.name : '',
      certifiedAt:     enrollment.certifiedAt,
      curriculumItems: program  ? program.curriculumItems : [],
    });
  } catch (err) {
    next(err);
  }
}

// ── Teacher: Manually enroll a student into an existing program ───────────
async function enrollStudent(req, res, next) {
  try {
    const { programId } = req.params;
    const { studentId } = req.body;

    const program = await Program.findById(programId);
    if (!program) return res.status(404).json({ success: false, message: 'Program not found.' });

    const community = await Community.findOne({ _id: program.communityId, teacherId: req.user._id });
    if (!community) return res.status(403).json({ success: false, message: 'Not your program.' });

    const membership = await Membership.findOne({ communityId: community._id, studentId, isActive: true });
    if (!membership) return res.status(400).json({ success: false, message: 'Student is not an active member of this community.' });

    const existing = await ProgramEnrollment.findOne({ programId, studentId });
    if (existing) return res.status(409).json({ success: false, message: 'Student is already enrolled in this program.' });

    const itemProgress = _buildInitialProgress(program.curriculumItems.length);
    const enrollment = await ProgramEnrollment.create({
      programId: program._id,
      studentId,
      communityId: community._id,
      itemProgress,
      overallStatus: 'in_progress',
    });

    res.status(201).json({ success: true, enrollment: _enrichEnrollment(enrollment, program.curriculumItems.length) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createProgram,
  getCommunityPrograms,
  getProgramProgress,
  markItemComplete,
  issueCertificate,
  resetEnrollment,
  enrollStudent,
  getStudentPrograms,
  completeProgramItem,
  getStudentCertificate,
  verifyCertificate,
};
