const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema(
  {
    assignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assignment',
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    communityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Community',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'submitted', 'needs_redo'],
      default: 'pending',
    },
    completedAt:     { type: Date, default: null },
    submittedAt:     { type: Date, default: null },
    recitationScore: { type: Number, default: null, min: 0, max: 100 },
    mistakeCount:    { type: Number, default: null, min: 0 },
    notes:           { type: String, default: '', maxlength: 500 },

    // Teacher review fields
    teacherScore:    { type: Number, default: null, min: 1, max: 10 },
    teacherFeedback: { type: String, default: null, maxlength: 1000 },

    // Redo tracking
    retakeCount:     { type: Number, default: 0, min: 0 },
    needsRedoReason: { type: String, default: null, maxlength: 500 },

    // Only one submission is "current" — history is kept by setting isLatest=false on old ones
    isLatest:        { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Quick lookup of the current submission for an assignment+student
submissionSchema.index({ assignmentId: 1, studentId: 1, isLatest: 1 });
// Full history for an assignment+student (chronological)
submissionSchema.index({ assignmentId: 1, studentId: 1, createdAt: -1 });

submissionSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Submission', submissionSchema);
