import mongoose, { Schema, Document } from 'mongoose';

export interface IContactMessage extends Document {
  name: string;
  email: string;
  subject: 'support' | 'advertising' | 'general' | 'complaint' | 'other';
  message: string;
  adType?: 'model1' | 'model2' | 'model3' | 'custom';
  customAdDetails?: string;

  // User reference if logged in
  user?: mongoose.Types.ObjectId;

  // Status tracking
  status: 'pending' | 'in_progress' | 'resolved' | 'closed';
  assignedTo?: mongoose.Types.ObjectId;

  // Response
  response?: string;
  respondedBy?: mongoose.Types.ObjectId;
  respondedAt?: Date;

  // Metadata
  ipAddress?: string;
  userAgent?: string;

  createdAt: Date;
  updatedAt: Date;
}

const ContactMessageSchema = new Schema<IContactMessage>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    subject: {
      type: String,
      enum: ['support', 'advertising', 'general', 'complaint', 'other'],
      required: true,
      default: 'general',
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
      minlength: [10, 'Message must be at least 10 characters'],
      maxlength: [2000, 'Message cannot exceed 2000 characters'],
    },
    adType: {
      type: String,
      enum: ['model1', 'model2', 'model3', 'custom'],
    },
    customAdDetails: {
      type: String,
      trim: true,
      maxlength: [500, 'Custom details cannot exceed 500 characters'],
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'resolved', 'closed'],
      default: 'pending',
      index: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    response: {
      type: String,
      trim: true,
      maxlength: [2000, 'Response cannot exceed 2000 characters'],
    },
    respondedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    respondedAt: {
      type: Date,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
ContactMessageSchema.index({ status: 1, createdAt: -1 });
ContactMessageSchema.index({ subject: 1, status: 1 });
ContactMessageSchema.index({ email: 1 });

const ContactMessage = mongoose.model<IContactMessage>(
  'ContactMessage',
  ContactMessageSchema
);

export default ContactMessage;
