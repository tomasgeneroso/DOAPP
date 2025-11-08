import { Request } from "express";
import type { User } from "../models/sql/User.model.js";

// Auth Request type
export interface AuthRequest extends Request {
  user?: any;
  passwordVerified?: boolean;
  twoFactorVerified?: boolean;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Array<{
    msg: string;
    param?: string;
    location?: string;
  }>;
}

// Query parameters
export interface JobQueryParams {
  status?: string;
  category?: string;
  minPrice?: string;
  maxPrice?: string;
  limit?: string;
}

export interface ContractQueryParams {
  status?: string;
}

// Request bodies
export interface RegisterBody {
  name: string;
  email: string;
  password: string;
  phone?: string;
  termsAccepted: boolean;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface CreateJobBody {
  title: string;
  summary: string;
  description: string;
  price: number;
  category?: string;
  location: string;
  latitude?: number;
  longitude?: number;
  startDate: string;
  endDate: string;
  images?: string[];
  toolsRequired?: string[];
  materialsProvided?: boolean;
}

export interface CreateContractBody {
  job: string;
  doer: string;
  price: number;
  startDate: string;
  endDate: string;
  termsAccepted: boolean;
  notes?: string;
}

export interface UpdateProfileBody {
  name?: string;
  phone?: string;
  bio?: string;
  avatar?: string;
}

export interface CancelContractBody {
  cancellationReason?: string;
}
