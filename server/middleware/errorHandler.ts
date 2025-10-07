import { Request, Response, NextFunction } from "express";
import { config } from "../config/env.js";

export class ErrorResponse extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let error = { ...err };
  error.message = err.message;

  // Log del error para desarrollo
  if (config.isDevelopment) {
    console.error(err);
  }

  // Error de validación de Mongoose
  if (err.name === "ValidationError") {
    const message = Object.values(err.errors)
      .map((val: any) => val.message)
      .join(", ");
    error = new ErrorResponse(message, 400);
  }

  // Error de duplicado de Mongoose
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    const message = `El ${field} ya está en uso`;
    error = new ErrorResponse(message, 400);
  }

  // Error de ObjectId inválido de Mongoose
  if (err.name === "CastError") {
    const message = "Recurso no encontrado";
    error = new ErrorResponse(message, 404);
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || "Error del servidor",
    ...(config.isDevelopment && { stack: err.stack }),
  });
};
