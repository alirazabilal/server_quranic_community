// server/models/Program.js
const mongoose = require('mongoose');

const curriculumItemSchema = new mongoose.Schema(
  {
    surahNumber: { type: Number, required: true, min: 1, max: 114 },
    ayahStart:   { type: Number, required: true, min: 1 },
    ayahEnd:     { type: Number, required: true, min: 1 },
    label:       { type: String, trim: true, maxlength: 100, default: '' },
    type:        { type: String, enum: ['recitation', 'memorization'], required: true, default: 'recitation' },
  },
  { _id: false }
);

const programSchema = new mongoose.Schema(
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
    name: {
      type: String,
      required: [true, 'Program name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [120, 'Name must be at most 120 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description too long'],
      default: '',
    },
    curriculumItems: {
      type: [curriculumItemSchema],
      validate: {
        validator: function (arr) { return arr.length >= 1 && arr.length <= 100; },
        message: 'Program must have 1–100 curriculum items.',
      },
    },
    // Empty = all active students in the community
    assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

programSchema.set('toJSON', {
  transform: (_doc, ret) => { delete ret.__v; return ret; },
});

module.exports = mongoose.model('Program', programSchema);
