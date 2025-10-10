import mongoose, { Document, Schema } from "mongoose";

export interface IPortfolioItem extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  category: string;
  images: string[];
  tags: string[];
  completedAt?: Date;
  clientName?: string;
  projectDuration?: string;
  featured: boolean;
  views: number;
  likes: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const portfolioItemSchema = new Schema<IPortfolioItem>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, "El título es requerido"],
      trim: true,
      maxlength: [100, "El título no puede exceder 100 caracteres"],
    },
    description: {
      type: String,
      required: [true, "La descripción es requerida"],
      maxlength: [1000, "La descripción no puede exceder 1000 caracteres"],
    },
    category: {
      type: String,
      required: [true, "La categoría es requerida"],
      trim: true,
      index: true,
    },
    images: {
      type: [String],
      validate: {
        validator: function (v: string[]) {
          return v.length > 0 && v.length <= 10;
        },
        message: "Debe haber entre 1 y 10 imágenes",
      },
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    completedAt: {
      type: Date,
    },
    clientName: {
      type: String,
      trim: true,
    },
    projectDuration: {
      type: String,
      trim: true,
    },
    featured: {
      type: Boolean,
      default: false,
      index: true,
    },
    views: {
      type: Number,
      default: 0,
    },
    likes: [{
      type: Schema.Types.ObjectId,
      ref: "User",
    }],
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
portfolioItemSchema.index({ userId: 1, createdAt: -1 });
portfolioItemSchema.index({ category: 1, featured: -1 });
portfolioItemSchema.index({ views: -1 });

export default mongoose.model<IPortfolioItem>("PortfolioItem", portfolioItemSchema);
