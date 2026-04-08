const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema(
  {
    communityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Community',
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      trim: true,
      maxlength: [120, 'Title must be at most 120 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description must be at most 500 characters'],
      default: '',
    },
    type: {
      type: String,
      enum: ['memorization', 'recitation'],
      required: [true, 'Assignment type is required'],
    },
    surahNumber: {
      type: Number,
      required: [true, 'Surah number is required'],
      min: [1, 'Surah number must be between 1 and 114'],
      max: [114, 'Surah number must be between 1 and 114'],
    },
    ayahStart: {
      type: Number,
      required: [true, 'Start ayah is required'],
      min: 1,
    },
    ayahEnd: {
      type: Number,
      required: [true, 'End ayah is required'],
      min: 1,
    },
    dueDate: {
      type: Date,
      required: [true, 'Due date is required'],
    },
    // Empty array = assigned to all active members
    assignedTo: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
  },
  { timestamps: true }
);

assignmentSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Assignment', assignmentSchema);
