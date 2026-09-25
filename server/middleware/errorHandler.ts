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

  /**
   * Los errores de la base, traducidos a algo que el usuario pueda usar.
   *
   * Esto entendía errores de Mongoose —`ValidationError`, el código 11000 de
   * duplicado, `CastError`— y la base es Postgres con Sequelize desde la
   * migración. Ninguna de las tres condiciones se cumplía nunca, así que
   * TODOS los errores de validación caían al 500 genérico: un email repetido,
   * un campo obligatorio vacío o un id mal formado le decían al usuario
   * "Error del servidor" en vez de qué corregir. Y a nosotros nos llenaban el
   * log de 500 que no eran fallas del servidor.
   */

  // Campo obligatorio vacío, formato inválido, valor fuera del enum.
  if (err.name === "SequelizeValidationError") {
    const message = (err.errors || [])
      .map((e: any) => e.message)
      .filter(Boolean)
      .join(", ");
    error = new ErrorResponse(message || "Datos inválidos", 400);
  }

  // Índice único: un email, un username o un DNI que ya existe.
  if (err.name === "SequelizeUniqueConstraintError") {
    const campo = (err.errors || [])[0]?.path;
    const nombres: Record<string, string> = {
      email: "correo",
      username: "nombre de usuario",
      dni: "DNI",
      cuit: "CUIT",
    };
    const message = campo
      ? `El ${nombres[campo] || campo} ya está en uso`
      : "Ese valor ya está en uso";
    // 409: el pedido es válido, el conflicto es con el estado actual.
    error = new ErrorResponse(message, 409);
  }

  // Clave foránea: se referencia algo que no existe o se borra algo en uso.
  if (err.name === "SequelizeForeignKeyConstraintError") {
    error = new ErrorResponse(
      "No se puede completar: el recurso está vinculado a otro o no existe",
      409,
    );
  }

  /**
   * 22P02 es "invalid text representation": el id que llegó no es un UUID.
   * Pasa en cada `/algo/:id` con un id inventado o cortado, y es la causa
   * silenciosa de muchos de los 500 que veníamos viendo.
   */
  if (err.name === "SequelizeDatabaseError" && err.parent?.code === "22P02") {
    error = new ErrorResponse("Recurso no encontrado", 404);
  }

  // El campo existe en el modelo pero no en la tabla: es un deploy sin migrar.
  // Se distingue a propósito del resto: lo arregla un deploy, no el usuario.
  if (err.name === "SequelizeDatabaseError" && err.parent?.code === "42703") {
    console.error("[esquema] columna inexistente — ¿falta correr migraciones?", err.message);
    error = new ErrorResponse("Error del servidor", 500);
  }

  const statusCode = error.statusCode || 500;

  // Los 500 son los únicos que hay que mirar: el resto son respuestas
  // correctas a pedidos que no se pueden cumplir.
  if (statusCode >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }

  res.status(statusCode).json({
    success: false,
    message: error.message || "Error del servidor",
    ...(config.isDevelopment && { stack: err.stack }),
  });
};
