// server/models/ProgramEnrollment.js
const mongoose = require('mongoose');

const itemProgressSchema = new mongoose.Schema(
  {
    itemIndex:   { type: Number, required: true },
    status:      { type: String, enum: ['not_started', 'in_progress', 'completed'], default: 'not_started' },
    completedAt: { type: Date, default: null },
  },
  { _id: false }
);

const programEnrollmentSchema = new mongoose.Schema(
  {
    programId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Program',   required: true, index: true },
    studentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',      required: true, index: true },
    communityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Community', required: true, index: true },
    itemProgress: [itemProgressSchema],
    overallStatus: {
      type: String,
      enum: ['in_progress', 'completed', 'certified'],
      default: 'in_progress',
    },
    certifiedAt:     { type: Date,   default: null },
    // Sparse unique: null values are excluded from the unique index
    certificateHash: { type: String, default: null, sparse: true },
  },
  { timestamps: true }
);

// One enrollment per student per program
programEnrollmentSchema.index({ programId: 1, studentId: 1 }, { unique: true });

programEnrollmentSchema.set('toJSON', {
  transform: (_doc, ret) => { delete ret.__v; return ret; },
});

module.exports = mongoose.model('ProgramEnrollment', programEnrollmentSchema);
