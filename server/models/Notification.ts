import mongoose, { Document, Schema } from "mongoose";

export interface INotification extends Document {
  recipient: mongoose.Types.ObjectId;
  type: "info" | "success" | "warning" | "error" | "alert";
  category: "ticket" | "contract" | "user" | "payment" | "system" | "admin";

  title: string;
  message: string;

  // Referencias opcionales
  relatedModel?: string;
  relatedId?: mongoose.Types.ObjectId;

  // Metadata
  actionUrl?: string;
  actionText?: string;

  // Estado
  read: boolean;
  readAt?: Date;

  // Envío
  sentVia: ("in_app" | "email" | "push")[];
  emailSent?: boolean;
  pushSent?: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["info", "success", "warning", "error", "alert"],
      default: "info",
    },
    category: {
      type: String,
      enum: ["ticket", "contract", "user", "payment", "system", "admin"],
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    relatedModel: {
      type: String,
    },
    relatedId: {
      type: Schema.Types.ObjectId,
    },
    actionUrl: {
      type: String,
    },
    actionText: {
      type: String,
      maxlength: 50,
    },
    read: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
    sentVia: [{
      type: String,
      enum: ["in_app", "email", "push"],
    }],
    emailSent: {
      type: Boolean,
      default: false,
    },
    pushSent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Índices compuestos para consultas eficientes
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, category: 1, createdAt: -1 });

export default mongoose.model<INotification>("Notification", notificationSchema);
