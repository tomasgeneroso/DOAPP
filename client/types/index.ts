export interface Job {
  _id: string;
  title: string;
  description: string;
  summary?: string;
  category: string;
  budget: number;
  price: number; // Alias for budget (some views use price)
  startDate: string;
  endDate: string;
  location: string;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  postedBy: string;
  client?: {
    _id: string;
    name: string;
    rating: number;
    reviewsCount: number;
    avatar?: string;
    completedJobs?: number;
  };
  doer?: {
    _id: string;
    name: string;
    rating: number;
    reviewsCount: number;
    avatar?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface User {
  _id: string;
  id?: string; // Alias for _id
  name: string;
  email: string;
  avatar?: string;
  phone?: string;
  bio?: string;
  rating: number;
  reviewsCount: number;
  completedJobs: number;
  role: 'user' | 'admin';
  adminRole?: 'owner' | 'super_admin' | 'moderator' | 'support';
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
  referralCode?: string;
  freeContractsRemaining?: number;
  totalReferrals?: number;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  phone?: string;
  termsAccepted: boolean;
  referralCode?: string;
}

export interface BlogPost {
  _id: string;
  title: string;
  subtitle: string;
  slug: string;
  content: string;
  excerpt: string;
  author: string;
  coverImage?: string;
  tags: string[];
  category: string;
  status: "draft" | "published" | "archived";
  views: number;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}