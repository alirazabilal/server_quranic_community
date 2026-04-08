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
      enum: ['pending', 'completed', 'submitted'],
      default: 'pending',
    },
    completedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    recitationScore: { type: Number, default: null, min: 0, max: 100 },
    mistakeCount:    { type: Number, default: null, min: 0 },
    notes:           { type: String, default: '', maxlength: 500 },
  },
  { timestamps: true }
);

// One submission record per student per assignment
submissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });

submissionSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Submission', submissionSchema);
