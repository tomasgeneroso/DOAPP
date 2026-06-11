import { useEffect, useState, useCallback } from "react";
import { useTranslation } from 'react-i18next';
import { useAuth } from "../../hooks/useAuth";
import {
  Shield, Ban, Unlock, RefreshCw, AlertTriangle, Activity,
  Bot, Clock, Zap, Globe, Lock, TrendingUp, Eye
} from "lucide-react";
import { Loader2 } from "lucide-react";

interface SecurityOverview {
  waf: {
    totalTrackedIPs: number;
    blacklistedIPs: number;
    whitelistedIPs: number;
    currentlyBlocked: number;
    totalRequests: number;
    blockedRequests: number;
    blockRate: string;
    attackBreakdown: {
      sqlInjection: number;
      xss: number;
      botDetections: number;
      rateLimitBlocks: number;
      zeroDayBlocks: number;
    };
  };
  temporarilyBlocked: Array<{ ip: string; blockedUntil: number; requests: number; botScore: number }>;
  permanentlyBlocked: Array<{ ip: string }>;
  suspiciousBots: Array<{ ip: string; botScore: number; requests: number }>;
  rateLimitBlocks: Array<{ key: string; expiresAt: string }>;
}

export default function SecurityPanel() {
  const { token } = useAuth();
  const { t } = useTranslation();
  const [data, setData] = useState<SecurityOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [blacklistInput, setBlacklistInput] = useState("");
  const [actioning, setActioning] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/security/overview", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) setData(json.data);
      else setError(json.message);
    } catch {
      setError("Error al cargar datos de seguridad");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // auto-refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleBlacklist = async (ip: string) => {
    if (!ip.trim()) return;
    setActioning(`block:${ip}`);
    try {
      const res = await fetch("/api/admin/security/blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ip }),
      });
      const json = await res.json();
      if (json.success) { setBlacklistInput(""); fetchData(); }
    } finally { setActioning(null); }
  };

  const handleUnblacklist = async (ip: string) => {
    setActioning(`unblock:${ip}`);
    try {
      const res = await fetch(`/api/admin/security/blacklist/${encodeURIComponent(ip)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) fetchData();
    } finally { setActioning(null); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
    </div>
  );

  if (error) return (
    <div className="p-6 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl">
      <AlertTriangle className="h-5 w-5 inline mr-2" />{error}
    </div>
  );

  const waf = data!.waf;
  const blockRatePct = parseFloat(waf.blockRate);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-7 w-7 text-sky-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Panel de Seguridad</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">WAF · Rate Limiting · IPs bloqueadas</p>
          </div>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Activity className="h-5 w-5 text-sky-500" />} label="Requests totales" value={waf.totalRequests.toLocaleString()} sub="desde el último reinicio" />
        <StatCard icon={<Ban className="h-5 w-5 text-red-500" />} label="Requests bloqueados" value={waf.blockedRequests.toLocaleString()} sub={`${waf.blockRate} del total`} color={blockRatePct > 10 ? "red" : blockRatePct > 5 ? "amber" : "green"} />
        <StatCard icon={<Lock className="h-5 w-5 text-orange-500" />} label="IPs bloqueadas ahora" value={waf.currentlyBlocked + waf.blacklistedIPs} sub={`${waf.currentlyBlocked} temp · ${waf.blacklistedIPs} perm`} />
        <StatCard icon={<Globe className="h-5 w-5 text-violet-500" />} label="IPs rastreadas" value={waf.totalTrackedIPs.toLocaleString()} sub={`${waf.whitelistedIPs} en whitelist`} />
      </div>

      {/* Attack breakdown */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-sky-500" /> Tipos de ataque detectados
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "SQL Injection", value: waf.attackBreakdown.sqlInjection, color: "red" },
            { label: "XSS", value: waf.attackBreakdown.xss, color: "orange" },
            { label: "Bots", value: waf.attackBreakdown.botDetections, color: "violet" },
            { label: "Rate Limit", value: waf.attackBreakdown.rateLimitBlocks, color: "amber" },
            { label: "Zero-Day", value: waf.attackBreakdown.zeroDayBlocks, color: "red" },
          ].map(({ label, value, color }) => (
            <div key={label} className={`p-3 rounded-lg bg-${color}-50 dark:bg-${color}-900/20 border border-${color}-200 dark:border-${color}-800 text-center`}>
              <p className={`text-2xl font-bold text-${color}-700 dark:text-${color}-400`}>{value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Temporarily blocked IPs */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            IPs bloqueadas temporalmente ({data!.temporarilyBlocked.length})
          </h2>
          {data!.temporarilyBlocked.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">Ninguna IP bloqueada actualmente</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {data!.temporarilyBlocked.map(({ ip, blockedUntil, requests, botScore }) => (
                <div key={ip} className="flex items-center justify-between p-2.5 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800">
                  <div>
                    <p className="text-sm font-mono font-semibold text-slate-900 dark:text-white">{ip}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {requests} req · Bot score: {botScore} · Expira: {new Date(blockedUntil).toLocaleTimeString('es-AR')}
                    </p>
                  </div>
                  <button
                    onClick={() => handleBlacklist(ip)}
                    disabled={actioning === `block:${ip}`}
                    className="text-xs px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                  >
                    Banear
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Suspicious bots */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
            <Bot className="h-4 w-4 text-violet-500" />
            IPs con comportamiento de bot ({data!.suspiciousBots.length})
          </h2>
          {data!.suspiciousBots.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">Sin bots detectados</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {data!.suspiciousBots.map(({ ip, botScore, requests }) => (
                <div key={ip} className="flex items-center justify-between p-2.5 bg-violet-50 dark:bg-violet-900/10 rounded-lg border border-violet-200 dark:border-violet-800">
                  <div>
                    <p className="text-sm font-mono font-semibold text-slate-900 dark:text-white">{ip}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{requests} req · Bot score: {botScore}/100</p>
                    <div className="mt-1 h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full w-32">
                      <div className="h-1.5 bg-violet-500 rounded-full" style={{ width: `${botScore}%` }} />
                    </div>
                  </div>
                  <button
                    onClick={() => handleBlacklist(ip)}
                    disabled={actioning === `block:${ip}`}
                    className="text-xs px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                  >
                    Banear
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Permanently blacklisted */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
            <Ban className="h-4 w-4 text-red-500" />
            IPs baneadas permanentemente ({data!.permanentlyBlocked.length})
          </h2>
          {data!.permanentlyBlocked.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">Sin IPs baneadas</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {data!.permanentlyBlocked.map(({ ip }) => (
                <div key={ip} className="flex items-center justify-between p-2.5 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800">
                  <p className="text-sm font-mono font-semibold text-slate-900 dark:text-white">{ip}</p>
                  <button
                    onClick={() => handleUnblacklist(ip)}
                    disabled={actioning === `unblock:${ip}`}
                    className="flex items-center gap-1 text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors disabled:opacity-50"
                  >
                    {actioning === `unblock:${ip}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlock className="h-3 w-3" />}
                    Desbloquear
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Manual ban */}
          <div className="mt-4 flex gap-2">
            <input
              type="text"
              value={blacklistInput}
              onChange={e => setBlacklistInput(e.target.value)}
              placeholder="IP a banear (ej: 1.2.3.4)"
              className="flex-1 px-3 py-2 text-sm bg-slate-100 dark:bg-slate-700 rounded-lg border-none focus:outline-none focus:ring-2 focus:ring-red-400 font-mono"
              onKeyDown={e => { if (e.key === 'Enter') handleBlacklist(blacklistInput); }}
            />
            <button
              onClick={() => handleBlacklist(blacklistInput)}
              disabled={!blacklistInput.trim() || actioning === `block:${blacklistInput}`}
              className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg disabled:opacity-50 transition-colors flex items-center gap-1"
            >
              <Ban className="h-4 w-4" /> Banear
            </button>
          </div>
        </div>

        {/* Rate limit blocks from PostgreSQL */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
            <Zap className="h-4 w-4 text-sky-500" />
            Bloques por rate limit (persistidos en DB)
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
            IPs bloqueadas en rutas de auth. Se mantienen tras reinicios del servidor.
          </p>
          {data!.rateLimitBlocks.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">Sin bloques activos</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {data!.rateLimitBlocks.map(({ key, expiresAt }) => (
                <div key={key} className="flex items-center justify-between p-2.5 bg-sky-50 dark:bg-sky-900/10 rounded-lg border border-sky-200 dark:border-sky-800">
                  <div>
                    <p className="text-sm font-mono font-semibold text-slate-900 dark:text-white">{key.replace(/^rl:[^_]+_/, '')}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Eye className="h-3 w-3" /> Expira: {new Date(expiresAt).toLocaleString('es-AR')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, color = "default" }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
  color?: "default" | "red" | "amber" | "green";
}) {
  const colors = {
    default: "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700",
    red: "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800",
    amber: "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800",
    green: "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800",
  };
  return (
    <div className={`${colors[color]} rounded-xl border p-4`}>
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span></div>
      <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</p>
    </div>
  );
}
