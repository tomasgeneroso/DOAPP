import mongoose, { Document, Schema } from "mongoose";

export interface IBlogPost extends Document {
  title: string;
  subtitle: string;
  slug: string; // URL-friendly version of title
  content: string;
  excerpt: string; // Short preview
  author: string; // Author name (written, not a reference)
  coverImage?: string;
  tags: string[];
  category: string;
  status: "draft" | "published" | "archived";
  views: number;
  publishedAt?: Date;
  createdBy: mongoose.Types.ObjectId; // User who created it
  updatedBy?: mongoose.Types.ObjectId; // User who last updated it
  createdAt: Date;
  updatedAt: Date;
}

const blogPostSchema = new Schema<IBlogPost>(
  {
    title: {
      type: String,
      required: [true, "El título es requerido"],
      trim: true,
      maxlength: [200, "El título no puede exceder 200 caracteres"],
    },
    subtitle: {
      type: String,
      required: [true, "El subtítulo es requerido"],
      trim: true,
      maxlength: [300, "El subtítulo no puede exceder 300 caracteres"],
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    content: {
      type: String,
      required: [true, "El contenido es requerido"],
    },
    excerpt: {
      type: String,
      required: true,
      maxlength: [500, "El extracto no puede exceder 500 caracteres"],
    },
    author: {
      type: String,
      required: [true, "El autor es requerido"],
      trim: true,
    },
    coverImage: {
      type: String,
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "Limpieza",
        "Reparaciones",
        "Mantenimiento",
        "Productos Ecológicos",
        "Hogar",
        "Jardín",
        "Tips",
        "Otros"
      ],
      index: true,
    },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true,
    },
    views: {
      type: Number,
      default: 0,
    },
    publishedAt: {
      type: Date,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Create slug from title before saving
blogPostSchema.pre("save", function (next) {
  if (this.isModified("title") && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^a-z0-9\s-]/g, "") // Remove special chars
      .replace(/\s+/g, "-") // Replace spaces with -
      .replace(/-+/g, "-") // Replace multiple - with single -
      .replace(/^-|-$/g, ""); // Remove leading/trailing -
  }
  next();
});

// Set publishedAt when status changes to published
blogPostSchema.pre("save", function (next) {
  if (this.isModified("status") && this.status === "published" && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  next();
});

// Indexes for efficient queries
blogPostSchema.index({ status: 1, publishedAt: -1 });
blogPostSchema.index({ category: 1, status: 1 });
blogPostSchema.index({ tags: 1, status: 1 });
blogPostSchema.index({ createdAt: -1 });

export default mongoose.model<IBlogPost>("BlogPost", blogPostSchema);
