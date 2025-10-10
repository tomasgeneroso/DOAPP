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
}