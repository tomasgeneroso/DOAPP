import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';

type FavoriteType = 'job' | 'post' | 'blog' | 'user';

interface Favorite {
  id: string;
  type: FavoriteType;
  itemId: string;
  createdAt: string;
}

interface UseFavoritesReturn {
  favorites: Favorite[];
  isFavorite: (type: FavoriteType, itemId: string) => boolean;
  toggleFavorite: (type: FavoriteType, itemId: string) => Promise<boolean>;
  getFavoritesByType: (type: FavoriteType) => Favorite[];
  loading: boolean;
  error: string | null;
}

export function useFavorites(): UseFavoritesReturn {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load favorites from localStorage initially, then sync with server
  useEffect(() => {
    if (!user) {
      setFavorites([]);
      return;
    }

    // Load from localStorage first
    const cached = localStorage.getItem(`favorites_${user.id}`);
    if (cached) {
      try {
        setFavorites(JSON.parse(cached));
      } catch (e) {
        console.error('Error parsing cached favorites:', e);
      }
    }

    // Then fetch from server
    fetchFavorites();
  }, [user]);

  const fetchFavorites = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const response = await fetch('/api/favorites', {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setFavorites(data.favorites);
        // Cache in localStorage
        localStorage.setItem(`favorites_${user.id}`, JSON.stringify(data.favorites));
      }
    } catch (err: any) {
      // If endpoint doesn't exist yet, use local storage only
      console.log('Favorites endpoint not available, using localStorage');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const isFavorite = useCallback((type: FavoriteType, itemId: string): boolean => {
    return favorites.some((f) => f.type === type && f.itemId === itemId);
  }, [favorites]);

  const toggleFavorite = useCallback(async (type: FavoriteType, itemId: string): Promise<boolean> => {
    if (!user) {
      setError('Debes iniciar sesión para guardar favoritos');
      return false;
    }

    const isCurrentlyFavorite = isFavorite(type, itemId);

    // Optimistic update
    if (isCurrentlyFavorite) {
      setFavorites((prev) => prev.filter((f) => !(f.type === type && f.itemId === itemId)));
    } else {
      const newFavorite: Favorite = {
        id: `temp_${Date.now()}`,
        type,
        itemId,
        createdAt: new Date().toISOString(),
      };
      setFavorites((prev) => [...prev, newFavorite]);
    }

    try {
      const response = await fetch('/api/favorites/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type, itemId }),
      });
      const data = await response.json();
      if (data.success) {
        // Update with server response
        if (data.favorite) {
          setFavorites((prev) => {
            const filtered = prev.filter((f) => !(f.type === type && f.itemId === itemId));
            return [...filtered, data.favorite];
          });
        }
        // Update localStorage
        const updatedFavorites = isCurrentlyFavorite
          ? favorites.filter((f) => !(f.type === type && f.itemId === itemId))
          : [...favorites, data.favorite || { id: `local_${Date.now()}`, type, itemId, createdAt: new Date().toISOString() }];
        localStorage.setItem(`favorites_${user.id}`, JSON.stringify(updatedFavorites));
        return !isCurrentlyFavorite;
      }
    } catch (err: any) {
      // If server fails, still keep local changes
      const updatedFavorites = isCurrentlyFavorite
        ? favorites.filter((f) => !(f.type === type && f.itemId === itemId))
        : [...favorites, { id: `local_${Date.now()}`, type, itemId, createdAt: new Date().toISOString() }];
      localStorage.setItem(`favorites_${user.id}`, JSON.stringify(updatedFavorites));
      return !isCurrentlyFavorite;
    }

    return !isCurrentlyFavorite;
  }, [user, favorites, isFavorite]);

  const getFavoritesByType = useCallback((type: FavoriteType): Favorite[] => {
    return favorites.filter((f) => f.type === type);
  }, [favorites]);

  return {
    favorites,
    isFavorite,
    toggleFavorite,
    getFavoritesByType,
    loading,
    error,
  };
}

export default useFavorites;
