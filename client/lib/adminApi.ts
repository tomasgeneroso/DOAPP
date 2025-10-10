import type { AdminUser, AdminContract, Ticket, AuditLogEntry, AnalyticsOverview, ApiResponse } from "@/types/admin";

const API_URL = import.meta.env.VITE_API_URL || "/api";

const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
  };
};

// Users
export const adminApi = {
  // Users
  users: {
    list: async (params?: Record<string, string>) => {
      const query = new URLSearchParams(params).toString();
      const res = await fetch(`${API_URL}/admin/users?${query}`, {
        headers: getAuthHeaders(),
      });
      return res.json() as Promise<ApiResponse<AdminUser[]>>;
    },

    get: async (id: string) => {
      const res = await fetch(`${API_URL}/admin/users/${id}`, {
        headers: getAuthHeaders(),
      });
      return res.json() as Promise<ApiResponse<AdminUser>>;
    },

    update: async (id: string, data: Partial<AdminUser>, ownerPassword?: string) => {
      const res = await fetch(`${API_URL}/admin/users/${id}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...data, ownerPassword }),
      });
      return res.json() as Promise<ApiResponse<AdminUser>>;
    },

    ban: async (id: string, reason: string, expiresAt?: string) => {
      const res = await fetch(`${API_URL}/admin/users/${id}/ban`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason, expiresAt }),
      });
      return res.json() as Promise<ApiResponse<void>>;
    },

    unban: async (id: string) => {
      const res = await fetch(`${API_URL}/admin/users/${id}/unban`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      return res.json() as Promise<ApiResponse<void>>;
    },

    delete: async (id: string, ownerPassword: string) => {
      const res = await fetch(`${API_URL}/admin/users/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
        body: JSON.stringify({ ownerPassword }),
      });
      return res.json() as Promise<ApiResponse<void>>;
    },
  },

  // Contracts
  contracts: {
    list: async (params?: Record<string, string>) => {
      const query = new URLSearchParams(params).toString();
      const res = await fetch(`${API_URL}/admin/contracts?${query}`, {
        headers: getAuthHeaders(),
      });
      return res.json() as Promise<ApiResponse<AdminContract[]>>;
    },

    get: async (id: string) => {
      const res = await fetch(`${API_URL}/admin/contracts/${id}`, {
        headers: getAuthHeaders(),
      });
      return res.json() as Promise<ApiResponse<AdminContract>>;
    },

    update: async (id: string, data: any, ownerPassword: string) => {
      const res = await fetch(`${API_URL}/admin/contracts/${id}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...data, ownerPassword }),
      });
      return res.json() as Promise<ApiResponse<AdminContract>>;
    },

    hide: async (id: string, reason: string) => {
      const res = await fetch(`${API_URL}/admin/contracts/${id}/hide`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason }),
      });
      return res.json() as Promise<ApiResponse<void>>;
    },

    unhide: async (id: string) => {
      const res = await fetch(`${API_URL}/admin/contracts/${id}/unhide`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      return res.json() as Promise<ApiResponse<void>>;
    },

    delete: async (id: string, ownerPassword: string) => {
      const res = await fetch(`${API_URL}/admin/contracts/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
        body: JSON.stringify({ ownerPassword }),
      });
      return res.json() as Promise<ApiResponse<void>>;
    },
  },

  // Tickets
  tickets: {
    list: async (params?: Record<string, string>) => {
      const query = new URLSearchParams(params).toString();
      const res = await fetch(`${API_URL}/admin/tickets?${query}`, {
        headers: getAuthHeaders(),
      });
      return res.json() as Promise<ApiResponse<Ticket[]>>;
    },

    get: async (id: string) => {
      const res = await fetch(`${API_URL}/admin/tickets/${id}`, {
        headers: getAuthHeaders(),
      });
      return res.json() as Promise<ApiResponse<Ticket>>;
    },

    create: async (data: { subject: string; category: string; message: string; priority?: string }) => {
      const res = await fetch(`${API_URL}/admin/tickets`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      return res.json() as Promise<ApiResponse<Ticket>>;
    },

    addMessage: async (id: string, message: string, isInternal = false) => {
      const res = await fetch(`${API_URL}/admin/tickets/${id}/messages`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ message, isInternal }),
      });
      return res.json() as Promise<ApiResponse<Ticket>>;
    },

    assign: async (id: string, assignedTo: string) => {
      const res = await fetch(`${API_URL}/admin/tickets/${id}/assign`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ assignedTo }),
      });
      return res.json() as Promise<ApiResponse<Ticket>>;
    },

    updateStatus: async (id: string, status: string) => {
      const res = await fetch(`${API_URL}/admin/tickets/${id}/status`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ status }),
      });
      return res.json() as Promise<ApiResponse<Ticket>>;
    },

    close: async (id: string, resolution?: string) => {
      const res = await fetch(`${API_URL}/admin/tickets/${id}/close`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ resolution }),
      });
      return res.json() as Promise<ApiResponse<Ticket>>;
    },
  },

  // Analytics
  analytics: {
    overview: async (startDate?: string, endDate?: string) => {
      const params = new URLSearchParams();
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      const res = await fetch(`${API_URL}/admin/analytics/overview?${params}`, {
        headers: getAuthHeaders(),
      });
      return res.json() as Promise<ApiResponse<AnalyticsOverview>>;
    },

    users: async (period = "30d") => {
      const res = await fetch(`${API_URL}/admin/analytics/users?period=${period}`, {
        headers: getAuthHeaders(),
      });
      return res.json();
    },

    contracts: async (period = "30d") => {
      const res = await fetch(`${API_URL}/admin/analytics/contracts?period=${period}`, {
        headers: getAuthHeaders(),
      });
      return res.json();
    },

    tickets: async (period = "30d") => {
      const res = await fetch(`${API_URL}/admin/analytics/tickets?period=${period}`, {
        headers: getAuthHeaders(),
      });
      return res.json();
    },

    audit: async (period = "30d") => {
      const res = await fetch(`${API_URL}/admin/analytics/audit?period=${period}`, {
        headers: getAuthHeaders(),
      });
      return res.json();
    },

    export: async (type: string, format = "json", startDate?: string, endDate?: string) => {
      const params = new URLSearchParams({ type, format });
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      const res = await fetch(`${API_URL}/admin/analytics/export?${params}`, {
        headers: getAuthHeaders(),
      });
      return res.json();
    },
  },

  // 2FA
  twoFactor: {
    setup: async () => {
      const res = await fetch(`${API_URL}/admin/2fa/setup`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      return res.json();
    },

    verify: async (code: string) => {
      const res = await fetch(`${API_URL}/admin/2fa/verify`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ code }),
      });
      return res.json();
    },

    disable: async (password: string) => {
      const res = await fetch(`${API_URL}/admin/2fa/disable`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ password }),
      });
      return res.json();
    },

    validate: async (code: string) => {
      const res = await fetch(`${API_URL}/admin/2fa/validate`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ code }),
      });
      return res.json();
    },

    getBackupCodes: async () => {
      const res = await fetch(`${API_URL}/admin/2fa/backup-codes`, {
        headers: getAuthHeaders(),
      });
      return res.json();
    },
  },
};
