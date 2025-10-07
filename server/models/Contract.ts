import mongoose, { Document, Schema } from "mongoose";

export interface IDelivery {
  description: string;
  startDate: Date;
  endDate: Date;
  status: "pending" | "in_progress" | "completed";
  completedAt?: Date;
  notes?: string;
}

export interface IContract extends Document {
  job: mongoose.Types.ObjectId;
  client: mongoose.Types.ObjectId;
  doer: mongoose.Types.ObjectId;
  type: "trabajo" | "service";
  price: number;
  commission: number;
  totalPrice: number;
  status: "pending" | "accepted" | "rejected" | "in_progress" | "completed" | "cancelled" | "disputed";
  termsAccepted: boolean;
  termsAcceptedAt?: Date;
  termsAcceptedByClient: boolean;
  termsAcceptedByDoer: boolean;
  clientSignature?: string;
  doerSignature?: string;
  startDate: Date;
  endDate: Date;
  actualStartDate?: Date;
  actualEndDate?: Date;
  deliveries?: IDelivery[];
  notes?: string;
  cancellationReason?: string;
  cancelledBy?: mongoose.Types.ObjectId;
  paymentStatus: "pending" | "held" | "released" | "refunded";
  paymentDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const deliverySchema = new Schema<IDelivery>({
  description: {
    type: String,
    required: [true, "La descripción de la entrega es requerida"],
    maxlength: [500, "La descripción no puede exceder 500 caracteres"],
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
    enum: ["pending", "in_progress", "completed"],
    default: "pending",
  },
  completedAt: {
    type: Date,
  },
  notes: {
    type: String,
    maxlength: [500, "Las notas no pueden exceder 500 caracteres"],
  },
});

const contractSchema = new Schema<IContract>(
  {
    job: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    client: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    doer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["trabajo", "service"],
      required: [true, "El tipo de contrato es requerido"],
    },
    price: {
      type: Number,
      required: [true, "El precio es requerido"],
      min: [0, "El precio no puede ser negativo"],
    },
    commission: {
      type: Number,
      default: 0,
      min: [0, "La comisión no puede ser negativa"],
    },
    totalPrice: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "in_progress", "completed", "cancelled", "disputed"],
      default: "pending",
    },
    termsAccepted: {
      type: Boolean,
      required: [true, "Los términos del contrato deben ser aceptados"],
      default: false,
    },
    termsAcceptedAt: {
      type: Date,
    },
    termsAcceptedByClient: {
      type: Boolean,
      default: false,
    },
    termsAcceptedByDoer: {
      type: Boolean,
      default: false,
    },
    clientSignature: {
      type: String,
    },
    doerSignature: {
      type: String,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    actualStartDate: {
      type: Date,
    },
    actualEndDate: {
      type: Date,
    },
    deliveries: [deliverySchema],
    notes: {
      type: String,
      maxlength: [1000, "Las notas no pueden exceder 1000 caracteres"],
    },
    cancellationReason: {
      type: String,
      maxlength: [500, "La razón de cancelación no puede exceder 500 caracteres"],
    },
    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "held", "released", "refunded"],
      default: "pending",
    },
    paymentDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Calcular totalPrice antes de guardar
contractSchema.pre("save", function (next) {
  if (this.isModified("price") || this.isModified("commission")) {
    this.totalPrice = this.price + this.commission;
  }
  next();
});

// Índices
contractSchema.index({ client: 1, status: 1 });
contractSchema.index({ doer: 1, status: 1 });
contractSchema.index({ job: 1 });
contractSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<IContract>("Contract", contractSchema);
