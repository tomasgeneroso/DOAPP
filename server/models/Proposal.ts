import mongoose, { Document, Schema } from "mongoose";

export interface IProposal extends Document {
  job: mongoose.Types.ObjectId;
  freelancer: mongoose.Types.ObjectId;
  client: mongoose.Types.ObjectId;
  coverLetter: string;
  proposedPrice: number;
  estimatedDuration: number; // en días
  status: "pending" | "approved" | "rejected" | "cancelled" | "withdrawn";
  rejectionReason?: string;
  cancellationReason?: string;
  withdrawnReason?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const proposalSchema = new Schema<IProposal>(
  {
    job: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },
    freelancer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    client: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    coverLetter: {
      type: String,
      required: [true, "La carta de presentación es requerida"],
      maxlength: [1000, "La carta de presentación no puede exceder 1000 caracteres"],
    },
    proposedPrice: {
      type: Number,
      required: [true, "El precio propuesto es requerido"],
      min: [0, "El precio no puede ser negativo"],
    },
    estimatedDuration: {
      type: Number,
      required: [true, "La duración estimada es requerida"],
      min: [1, "La duración debe ser al menos 1 día"],
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled", "withdrawn"],
      default: "pending",
      index: true,
    },
    rejectionReason: {
      type: String,
      maxlength: [500, "La razón de rechazo no puede exceder 500 caracteres"],
    },
    cancellationReason: {
      type: String,
      maxlength: [500, "La razón de cancelación no puede exceder 500 caracteres"],
    },
    withdrawnReason: {
      type: String,
      maxlength: [500, "La razón de retiro no puede exceder 500 caracteres"],
    },
  },
  {
    timestamps: true,
  }
);

// Índices compuestos
proposalSchema.index({ job: 1, freelancer: 1 }, { unique: true }); // Un freelancer solo puede enviar una propuesta por trabajo
proposalSchema.index({ job: 1, status: 1 });
proposalSchema.index({ freelancer: 1, status: 1 });
proposalSchema.index({ client: 1, status: 1 });

export default mongoose.model<IProposal>("Proposal", proposalSchema);
