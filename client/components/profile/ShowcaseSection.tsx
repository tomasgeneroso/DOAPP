import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

interface ShowcaseItem {
  id: string;
  type: 'portfolio' | 'blog' | 'post';
  title?: string;
  subtitle?: string;
  description?: string;
  content?: string;
  image?: string;
  link?: string;
  slug?: string;
  likes?: number;
  date: string;
}

interface ShowcaseProps {
  userId: string;
}

export default function ShowcaseSection({ userId }: ShowcaseProps) {
  const [items, setItems] = useState<ShowcaseItem[]>([]);
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ portfolio: 0, blog: 0, posts: 0 });

  useEffect(() => {
    fetchShowcase();
  }, [userId]);

  const fetchShowcase = async () => {
    try {
      const res = await fetch(`/api/profile/${userId}/showcase`);
      const data = await res.json();
      if (data.success) {
        setItems(data.showcase);
        setCounts(data.counts);
      }
    } catch (err) {
      console.error('Error loading showcase:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        No showcase items yet. Portfolio, blog posts, and community posts will appear here.
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-4 mb-6">
        <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm">
          {counts.portfolio} Portfolio
        </span>
        <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-sm">
          {counts.blog} Blog Posts
        </span>
        <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-sm">
          {counts.posts} Community Posts
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {items.map((item) => {
          switch (item.type) {
            case 'portfolio':
              return (
                <div key={item.id} className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden hover:shadow-lg transition">
                  {item.image && (
                    <img src={item.image} alt={item.title} className="w-full h-40 object-cover" />
                  )}
                  <div className="p-4">
                    <h3 className="font-bold text-slate-900 dark:text-white">{item.title}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">{item.description}</p>
                    {item.link && (
                      <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline text-sm mt-2 inline-block">
                        View →
                      </a>
                    )}
                  </div>
                </div>
              );

            case 'blog':
              return (
                <div key={item.id} className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden hover:shadow-lg transition">
                  {item.image && (
                    <img src={item.image} alt={item.title} className="w-full h-40 object-cover" />
                  )}
                  <div className="p-4">
                    <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded">
                      Blog Post
                    </span>
                    <h3 className="font-bold text-slate-900 dark:text-white mt-2">{item.title}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{item.subtitle}</p>
                  </div>
                </div>
              );

            case 'post':
              return (
                <div key={item.id} className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
                  <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded">
                    Community Post
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 mt-3 line-clamp-3">{item.content}</p>
                  <div className="flex items-center gap-2 mt-3 text-sm text-slate-500">
                    <span>👍 {item.likes || 0} likes</span>
                  </div>
                </div>
              );

            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}
