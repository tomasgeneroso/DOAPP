import { useState, useEffect } from 'react';
import {
  Lightbulb,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Target,
  FileText,
  Hash,
  Image,
  Link2,
  Type,
} from 'lucide-react';

interface SeoAnalysis {
  seoScore: number;
  readingTime: number;
  wordCount: number;
  titleLength: number;
  metaTitleLength: number;
  metaDescriptionLength: number;
  tagsCount: number;
  keywordsCount: number;
  hasHeadings: boolean;
  hasImages: boolean;
  suggestions: string[];
  scoreBreakdown: {
    title: 'good' | 'fair' | 'needs-improvement';
    metaDescription: 'good' | 'fair' | 'needs-improvement';
    content: 'good' | 'fair' | 'needs-improvement';
    tags: 'good' | 'fair' | 'needs-improvement';
  };
}

interface SeoTip {
  title: string;
  description: string;
  icon: string;
  importance: 'high' | 'medium' | 'low';
}

interface SeoTipsPanelProps {
  analysis?: SeoAnalysis;
  showTips?: boolean;
}

const iconMap: Record<string, React.ElementType> = {
  title: Type,
  description: FileText,
  key: Hash,
  content: FileText,
  heading: Type,
  image: Image,
  link: Link2,
  'internal-link': Link2,
};

const importanceColors = {
  high: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
  medium: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  low: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
};

const statusColors = {
  good: 'text-green-600 dark:text-green-400',
  fair: 'text-amber-600 dark:text-amber-400',
  'needs-improvement': 'text-red-600 dark:text-red-400',
};

const StatusIcon = ({ status }: { status: 'good' | 'fair' | 'needs-improvement' }) => {
  if (status === 'good') return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (status === 'fair') return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <XCircle className="h-4 w-4 text-red-500" />;
};

export default function SeoTipsPanel({ analysis, showTips = true }: SeoTipsPanelProps) {
  const [tips, setTips] = useState<SeoTip[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (showTips) {
      fetchTips();
    }
  }, [showTips]);

  const fetchTips = async () => {
    try {
      const response = await fetch('/api/blogs/seo-tips');
      const data = await response.json();
      if (data.success) {
        setTips(data.tips);
      }
    } catch (error) {
      console.error('Error fetching SEO tips:', error);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excelente';
    if (score >= 60) return 'Bueno';
    if (score >= 40) return 'Regular';
    return 'Necesita mejora';
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-sky-50 to-blue-50 dark:from-sky-900/20 dark:to-blue-900/20"
      >
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-sky-600 dark:text-sky-400" />
          <span className="font-semibold text-slate-900 dark:text-white">
            Consejos SEO
          </span>
          {analysis && (
            <span className={`ml-2 font-bold ${getScoreColor(analysis.seoScore)}`}>
              {analysis.seoScore}/100
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-5 w-5 text-slate-500" />
        ) : (
          <ChevronDown className="h-5 w-5 text-slate-500" />
        )}
      </button>

      {expanded && (
        <div className="p-4 space-y-6">
          {/* SEO Score Analysis */}
          {analysis && (
            <div className="space-y-4">
              {/* Score Circle */}
              <div className="flex items-center justify-center">
                <div className="relative">
                  <svg className="w-24 h-24 transform -rotate-90">
                    <circle
                      cx="48"
                      cy="48"
                      r="40"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      className="text-slate-200 dark:text-slate-700"
                    />
                    <circle
                      cx="48"
                      cy="48"
                      r="40"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      strokeDasharray={`${(analysis.seoScore / 100) * 251.2} 251.2`}
                      className={getScoreColor(analysis.seoScore)}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-2xl font-bold ${getScoreColor(analysis.seoScore)}`}>
                      {analysis.seoScore}
                    </span>
                    <span className="text-xs text-slate-500">SEO</span>
                  </div>
                </div>
                <div className="ml-4">
                  <p className={`font-semibold ${getScoreColor(analysis.seoScore)}`}>
                    {getScoreLabel(analysis.seoScore)}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {analysis.wordCount} palabras
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {analysis.readingTime} min de lectura
                  </p>
                </div>
              </div>

              {/* Score Breakdown */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                  <StatusIcon status={analysis.scoreBreakdown.title} />
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Título</p>
                    <p className="text-xs text-slate-500">{analysis.titleLength} caracteres</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                  <StatusIcon status={analysis.scoreBreakdown.metaDescription} />
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Meta descripción</p>
                    <p className="text-xs text-slate-500">{analysis.metaDescriptionLength} caracteres</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                  <StatusIcon status={analysis.scoreBreakdown.content} />
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Contenido</p>
                    <p className="text-xs text-slate-500">{analysis.wordCount} palabras</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                  <StatusIcon status={analysis.scoreBreakdown.tags} />
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Etiquetas</p>
                    <p className="text-xs text-slate-500">{analysis.tagsCount} tags</p>
                  </div>
                </div>
              </div>

              {/* Suggestions */}
              {analysis.suggestions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                    <Target className="h-4 w-4 text-sky-500" />
                    Sugerencias de mejora
                  </h4>
                  <ul className="space-y-2">
                    {analysis.suggestions.map((suggestion, index) => (
                      <li
                        key={index}
                        className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800"
                      >
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                        <span>{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* General SEO Tips */}
          {showTips && (
            <div className="space-y-3">
              <h4 className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                Tips para mejorar tu SEO
              </h4>

              {loading ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-600"></div>
                </div>
              ) : (
                <div className="space-y-2">
                  {tips.map((tip, index) => {
                    const Icon = iconMap[tip.icon] || Lightbulb;
                    return (
                      <div
                        key={index}
                        className={`p-3 rounded-lg border ${importanceColors[tip.importance]}`}
                      >
                        <div className="flex items-start gap-3">
                          <Icon className="h-5 w-5 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium">{tip.title}</p>
                            <p className="text-sm opacity-90">{tip.description}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Quick Reference */}
          <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <h4 className="font-medium text-slate-900 dark:text-white mb-2">
              Referencia rápida
            </h4>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
              <li>• Título: 30-60 caracteres</li>
              <li>• Meta descripción: 120-160 caracteres</li>
              <li>• Contenido: mínimo 300 palabras (ideal 1000+)</li>
              <li>• Etiquetas: 3-5 relevantes</li>
              <li>• Palabras clave: 3-5 principales</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
