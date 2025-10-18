import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

interface Advertisement {
  _id: string;
  title: string;
  description: string;
  imageUrl: string;
  targetUrl: string;
  adType: 'model1' | 'model2' | 'model3';
  status: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

interface UseAdvertisementsOptions {
  placement?: string;
  autoFetch?: boolean;
}

export const useAdvertisements = (options: UseAdvertisementsOptions = {}) => {
  const { placement = 'jobs_list', autoFetch = true } = options;
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(
        '/api/advertisements/active',
        {
          params: { placement },
        }
      );
      setAds(response.data.data);
    } catch (err: any) {
      console.error('Error fetching advertisements:', err);
      setError(err.response?.data?.message || 'Failed to fetch advertisements');
    } finally {
      setLoading(false);
    }
  }, [placement]);

  useEffect(() => {
    if (autoFetch) {
      fetchAds();
    }
  }, [autoFetch, fetchAds]);

  const recordImpression = useCallback(async (adId: string) => {
    try {
      await axios.post(`/api/advertisements/${adId}/impression`);
    } catch (err) {
      console.error('Error recording impression:', err);
    }
  }, []);

  const recordClick = useCallback(async (adId: string) => {
    try {
      await axios.post(`/api/advertisements/${adId}/click`);
    } catch (err) {
      console.error('Error recording click:', err);
    }
  }, []);

  return {
    ads,
    loading,
    error,
    fetchAds,
    recordImpression,
    recordClick,
  };
};

// Hook for managing user's own advertisements
export const useMyAdvertisements = () => {
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  const fetchMyAds = useCallback(async (status?: string) => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        '/api/advertisements',
        {
          params: { status },
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setAds(response.data.data.advertisements);
    } catch (err: any) {
      console.error('Error fetching my advertisements:', err);
      setError(err.response?.data?.message || 'Failed to fetch advertisements');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        '/api/advertisements/stats/overview',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setStats(response.data.data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }, []);

  const createAd = useCallback(async (adData: any) => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        '/api/advertisements',
        adData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      return response.data.data;
    } catch (err: any) {
      console.error('Error creating advertisement:', err);
      setError(err.response?.data?.message || 'Failed to create advertisement');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateAd = useCallback(async (adId: string, adData: any) => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(
        `/api/advertisements/${adId}`,
        adData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      return response.data.data;
    } catch (err: any) {
      console.error('Error updating advertisement:', err);
      setError(err.response?.data?.message || 'Failed to update advertisement');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const pauseAd = useCallback(async (adId: string) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `/api/advertisements/${adId}/pause`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      // Refresh ads
      await fetchMyAds();
    } catch (err: any) {
      console.error('Error pausing advertisement:', err);
      throw err;
    }
  }, [fetchMyAds]);

  const resumeAd = useCallback(async (adId: string) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `/api/advertisements/${adId}/resume`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      // Refresh ads
      await fetchMyAds();
    } catch (err: any) {
      console.error('Error resuming advertisement:', err);
      throw err;
    }
  }, [fetchMyAds]);

  const deleteAd = useCallback(async (adId: string) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(
        `/api/advertisements/${adId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      // Refresh ads
      await fetchMyAds();
    } catch (err: any) {
      console.error('Error deleting advertisement:', err);
      throw err;
    }
  }, [fetchMyAds]);

  const getPerformance = useCallback(async (adId: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `/api/advertisements/${adId}/performance`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      return response.data.data;
    } catch (err: any) {
      console.error('Error fetching performance:', err);
      throw err;
    }
  }, []);

  const getPricing = useCallback(async (adType: string, durationDays: number, priority: number = 0) => {
    try {
      const response = await axios.get(
        '/api/advertisements/pricing',
        {
          params: { adType, durationDays, priority },
        }
      );
      return response.data.data;
    } catch (err) {
      console.error('Error fetching pricing:', err);
      throw err;
    }
  }, []);

  return {
    ads,
    loading,
    error,
    stats,
    fetchMyAds,
    fetchStats,
    createAd,
    updateAd,
    pauseAd,
    resumeAd,
    deleteAd,
    getPerformance,
    getPricing,
  };
};
