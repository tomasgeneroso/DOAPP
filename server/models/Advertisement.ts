import mongoose, { Schema, Document } from 'mongoose';

export interface IAdvertisement extends Document {
  title: string;
  description: string;
  imageUrl: string;
  targetUrl: string;
  advertiser: mongoose.Types.ObjectId;
  adType: 'model1' | 'model2' | 'model3'; // model1: 3x1, model2: 1x2, model3: 1x1
  status: 'pending' | 'active' | 'paused' | 'expired' | 'rejected';

  // Pricing and payment
  pricePerDay: number;
  totalPrice: number;
  paymentStatus: 'pending' | 'paid' | 'refunded';
  paymentId?: mongoose.Types.ObjectId;

  // Scheduling
  startDate: Date;
  endDate: Date;

  // Targeting (optional)
  targetCategories?: string[];
  targetTags?: string[];
  targetLocations?: string[];

  // Analytics
  impressions: number;
  clicks: number;
  ctr: number; // Click-through rate

  // Priority and placement
  priority: number; // Higher priority = shown first (paid feature)
  placement: 'jobs_list' | 'search_results' | 'dashboard' | 'all';

  // Compliance
  isApproved: boolean;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  rejectionReason?: string;

  // Audit
  createdAt: Date;
  updatedAt: Date;
}

const AdvertisementSchema = new Schema<IAdvertisement>(
  {
    title: {
      type: String,
      required: [true, 'Advertisement title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    description: {
      type: String,
      required: [true, 'Advertisement description is required'],
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    imageUrl: {
      type: String,
      required: [true, 'Advertisement image is required'],
    },
    targetUrl: {
      type: String,
      required: [true, 'Target URL is required'],
      validate: {
        validator: function (v: string) {
          return /^https?:\/\/.+/.test(v);
        },
        message: 'Invalid URL format',
      },
    },
    advertiser: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    adType: {
      type: String,
      enum: ['model1', 'model2', 'model3'],
      required: true,
      default: 'model3',
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'paused', 'expired', 'rejected'],
      default: 'pending',
      index: true,
    },
    pricePerDay: {
      type: Number,
      required: true,
      min: [0, 'Price cannot be negative'],
    },
    totalPrice: {
      type: Number,
      required: true,
      min: [0, 'Total price cannot be negative'],
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'refunded'],
      default: 'pending',
      index: true,
    },
    paymentId: {
      type: Schema.Types.ObjectId,
      ref: 'Payment',
    },
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    endDate: {
      type: Date,
      required: true,
      index: true,
      validate: {
        validator: function (this: IAdvertisement, value: Date) {
          return value > this.startDate;
        },
        message: 'End date must be after start date',
      },
    },
    targetCategories: [
      {
        type: String,
        trim: true,
      },
    ],
    targetTags: [
      {
        type: String,
        trim: true,
      },
    ],
    targetLocations: [
      {
        type: String,
        trim: true,
      },
    ],
    impressions: {
      type: Number,
      default: 0,
      min: 0,
    },
    clicks: {
      type: Number,
      default: 0,
      min: 0,
    },
    ctr: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    priority: {
      type: Number,
      default: 0,
      min: 0,
    },
    placement: {
      type: String,
      enum: ['jobs_list', 'search_results', 'dashboard', 'all'],
      default: 'jobs_list',
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
AdvertisementSchema.index({ status: 1, startDate: 1, endDate: 1 });
AdvertisementSchema.index({ advertiser: 1, status: 1 });
AdvertisementSchema.index({ placement: 1, status: 1, priority: -1 });

// Virtual for duration in days
AdvertisementSchema.virtual('durationDays').get(function (this: IAdvertisement) {
  const diff = this.endDate.getTime() - this.startDate.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Virtual for isActive
AdvertisementSchema.virtual('isActive').get(function (this: IAdvertisement) {
  const now = new Date();
  return (
    this.status === 'active' &&
    this.paymentStatus === 'paid' &&
    this.isApproved &&
    now >= this.startDate &&
    now <= this.endDate
  );
});

// Method to calculate CTR
AdvertisementSchema.methods.calculateCTR = function (this: IAdvertisement) {
  if (this.impressions === 0) {
    this.ctr = 0;
  } else {
    this.ctr = (this.clicks / this.impressions) * 100;
  }
  return this.ctr;
};

// Method to record impression
AdvertisementSchema.methods.recordImpression = async function (this: IAdvertisement) {
  this.impressions += 1;
  this.calculateCTR();
  await this.save();
};

// Method to record click
AdvertisementSchema.methods.recordClick = async function (this: IAdvertisement) {
  this.clicks += 1;
  this.calculateCTR();
  await this.save();
};

// Static method to get active ads
AdvertisementSchema.statics.getActiveAds = function (
  placement?: string,
  limit?: number
) {
  const now = new Date();
  const query: any = {
    status: 'active',
    paymentStatus: 'paid',
    isApproved: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  };

  if (placement && placement !== 'all') {
    query.placement = { $in: [placement, 'all'] };
  }

  return this.find(query)
    .sort({ priority: -1, createdAt: -1 })
    .limit(limit || 10)
    .populate('advertiser', 'name email');
};

// Middleware to auto-expire ads
AdvertisementSchema.pre('save', function (this: IAdvertisement, next) {
  const now = new Date();
  if (this.status === 'active' && now > this.endDate) {
    this.status = 'expired';
  }
  next();
});

// Ensure virtuals are included in JSON
AdvertisementSchema.set('toJSON', { virtuals: true });
AdvertisementSchema.set('toObject', { virtuals: true });

const Advertisement = mongoose.model<IAdvertisement>('Advertisement', AdvertisementSchema);

export default Advertisement;
