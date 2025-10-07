import mongoose, { Document, Schema } from "mongoose";

export interface IJob extends Document {
  title: string;
  summary: string;
  description: string;
  price: number;
  category?: string;
  location: string;
  latitude?: number;
  longitude?: number;
  startDate: Date;
  endDate: Date;
  status: "open" | "in_progress" | "completed" | "cancelled";
  client: mongoose.Types.ObjectId;
  doer?: mongoose.Types.ObjectId;
  images?: string[];
  toolsRequired?: string[];
  materialsProvided: boolean;
  rating?: number;
  review?: string;
  createdAt: Date;
  updatedAt: Date;
}

const jobSchema = new Schema<IJob>(
  {
    title: {
      type: String,
      required: [true, "El título es requerido"],
      trim: true,
      maxlength: [100, "El título no puede exceder 100 caracteres"],
    },
    summary: {
      type: String,
      required: [true, "El resumen es requerido"],
      trim: true,
      maxlength: [200, "El resumen no puede exceder 200 caracteres"],
    },
    description: {
      type: String,
      required: [true, "La descripción es requerida"],
      maxlength: [2000, "La descripción no puede exceder 2000 caracteres"],
    },
    price: {
      type: Number,
      required: [true, "El precio es requerido"],
      min: [0, "El precio no puede ser negativo"],
    },
    category: {
      type: String,
      trim: true,
    },
    location: {
      type: String,
      required: [true, "La ubicación es requerida"],
      trim: true,
    },
    latitude: {
      type: Number,
    },
    longitude: {
      type: Number,
    },
    startDate: {
      type: Date,
      required: [true, "La fecha de inicio es requerida"],
    },
    endDate: {
      type: Date,
      required: [true, "La fecha de fin es requerida"],
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "completed", "cancelled"],
      default: "open",
    },
    client: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    doer: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    images: [
      {
        type: String,
      },
    ],
    toolsRequired: [
      {
        type: String,
      },
    ],
    materialsProvided: {
      type: Boolean,
      default: false,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    review: {
      type: String,
      maxlength: [500, "La reseña no puede exceder 500 caracteres"],
    },
  },
  {
    timestamps: true,
  }
);

// Validar que endDate sea posterior a startDate
jobSchema.pre("save", function (next) {
  if (this.endDate <= this.startDate) {
    next(new Error("La fecha de fin debe ser posterior a la fecha de inicio"));
  }
  next();
});

// Índices
jobSchema.index({ status: 1, createdAt: -1 });
jobSchema.index({ client: 1 });
jobSchema.index({ doer: 1 });
jobSchema.index({ location: 1 });
jobSchema.index({ price: 1 });

export default mongoose.model<IJob>("Job", jobSchema);
