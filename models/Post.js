const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  blogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Blog',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  excerpt: {
    type: String,
    default: ''
  },
  tags: [{
    type: String,
    trim: true
  }],
  isPublished: {
    type: Boolean,
    default: true
  },
  publishedAt: {
    type: Date,
    default: Date.now
  },
  viewCount: {
    type: Number,
    default: 0
  },
  likes: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Виртуальное поле для создания excerpt из content
postSchema.virtual('autoExcerpt').get(function() {
  if (this.excerpt) return this.excerpt;
  return this.content.length > 150 ? this.content.substring(0, 150) + '...' : this.content;
});

// Индексы для оптимизации запросов
postSchema.index({ blogId: 1, createdAt: -1 });
postSchema.index({ blogId: 1, isPublished: 1 });
postSchema.index({ tags: 1 });

// Middleware для автоматического создания excerpt
postSchema.pre('save', function(next) {
  if (!this.excerpt && this.content) {
    this.excerpt = this.content.length > 150 ? this.content.substring(0, 150) + '...' : this.content;
  }
  next();
});

module.exports = mongoose.model('Post', postSchema); 