export interface Job {
  _id: string;
  title: string;
  description: string;
  category: string;
  budget: number;
  startDate: string;
  endDate: string;
  location: string;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  postedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
  phone?: string;
  bio?: string;
  rating: number;
  reviewsCount: number;
  completedJobs: number;
  role: 'user' | 'admin';
  isVerified: boolean;
  interests?: string[];
  onboardingCompleted?: boolean;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  bankingInfo?: {
    accountHolder?: string;
    bankName?: string;
    accountType?: "savings" | "checking";
    cbu?: string;
    alias?: string;
  };
  legalInfo?: {
    idType?: "dni" | "passport" | "cuit" | "cuil";
    idNumber?: string;
    taxStatus?: "freelancer" | "autonomo" | "monotributo" | "responsable_inscripto";
    taxId?: string;
  };
  notificationPreferences?: {
    email: boolean;
    push: boolean;
    sms: boolean;
    newMessage: boolean;
    jobUpdate: boolean;
    contractUpdate: boolean;
    paymentUpdate: boolean;
    marketing: boolean;
  };
}