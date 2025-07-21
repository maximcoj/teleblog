const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  subdomain: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  url: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  theme: {
    type: String,
    default: 'default'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Индексы для оптимизации запросов
blogSchema.index({ userId: 1 });
blogSchema.index({ subdomain: 1 });

module.exports = mongoose.model('Blog', blogSchema); 