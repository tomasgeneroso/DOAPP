import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Utility para combinar clases de Tailwind
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Utility functions existentes
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  }).format(amount);
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("es-AR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Helper type for client/doer that can be string or object
interface ClientInfo {
  id: string;
  _id?: string;
  name: string;
  avatar?: string;
  rating: number;
  reviewsCount?: number;
  completedJobs?: number;
}

// Helper to safely extract client/user info from mixed type (string | object)
export function getClientInfo(
  client: string | { _id?: string; id?: string; name: string; rating: number; reviewsCount: number; avatar?: string; completedJobs?: number; } | undefined
): ClientInfo | null {
  if (!client) return null;
  if (typeof client === 'string') {
    return { id: client, name: 'Usuario', rating: 0, reviewsCount: 0, completedJobs: 0 };
  }
  return {
    id: client.id || client._id || '',
    _id: client._id,
    name: client.name,
    avatar: client.avatar,
    rating: client.rating || 0,
    reviewsCount: client.reviewsCount || 0,
    completedJobs: client.completedJobs || 0
  };
}