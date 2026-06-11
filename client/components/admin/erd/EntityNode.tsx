import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Handle, Position } from '@xyflow/react';
import type { ERDEntity, FieldConstraint, EntityCategory } from './types.js';

const CATEGORY_STYLES: Record<EntityCategory, { header: string; border: string; bg: string; dot: string }> = {
  core:          { header: 'bg-blue-600',    border: 'border-blue-500/40',   bg: 'bg-blue-950/40',    dot: 'bg-blue-400' },
  const { t } = useTranslation();
  payments:      { header: 'bg-emerald-600', border: 'border-emerald-500/40',bg: 'bg-emerald-950/40', dot: 'bg-emerald-400' },
  communication: { header: 'bg-violet-600',  border: 'border-violet-500/40', bg: 'bg-violet-950/40',  dot: 'bg-violet-400' },
  support:       { header: 'bg-amber-600',   border: 'border-amber-500/40',  bg: 'bg-amber-950/40',   dot: 'bg-amber-400' },
  content:       { header: 'bg-indigo-600',  border: 'border-indigo-500/40', bg: 'bg-indigo-950/40',  dot: 'bg-indigo-400' },
  auth:          { header: 'bg-rose-600',    border: 'border-rose-500/40',   bg: 'bg-rose-950/40',    dot: 'bg-rose-400' },
};

const CONSTRAINT_BADGES: Record<FieldConstraint, { label: string; cls: string }> = {
  PK:      { label: 'PK',  cls: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40' },
  FK:      { label: 'FK',  cls: 'bg-blue-500/20 text-blue-300 border border-blue-500/40' },
  NN:      { label: 'NN',  cls: 'bg-slate-600/40 text-slate-400 border border-slate-600/40' },
  UNQ:     { label: 'U',   cls: 'bg-purple-500/20 text-purple-300 border border-purple-500/40' },
  IDX:     { label: 'I',   cls: 'bg-teal-500/20 text-teal-300 border border-teal-500/40' },
  DEFAULT: { label: 'D',   cls: 'bg-slate-700/40 text-slate-400 border border-slate-600/40' },
};

export interface EntityNodeData {
  entity: ERDEntity;
  collapsed: boolean;
  highlighted: boolean;
  onToggleCollapse: (id: string) => void;
}

function EntityNode({ id, data, selected }: { id: string; data: EntityNodeData; selected?: boolean }) {
  const { entity, collapsed, highlighted, onToggleCollapse } = data;
  const s = CATEGORY_STYLES[entity.category];

  return (
    <div
      className={`rounded-xl border shadow-xl transition-all duration-150 overflow-hidden min-w-[240px] max-w-[280px]
        ${s.bg} ${s.border}
        ${selected ? 'ring-2 ring-white/40 shadow-white/10' : ''}
        ${highlighted ? 'ring-2 ring-yellow-400/60' : ''}
      `}
      style={{ fontSize: 12 }}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#64748b', width: 8, height: 8, border: '2px solid #334155' }} />
      <Handle type="source" position={Position.Right} style={{ background: '#64748b', width: 8, height: 8, border: '2px solid #334155' }} />

      {/* Header */}
      <div
        className={`${s.header} px-3 py-2 flex items-center justify-between cursor-pointer select-none`}
        onClick={() => onToggleCollapse(id)}
      >
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${s.dot} ring-1 ring-white/20`} />
          <span className="text-white font-bold text-xs tracking-wide font-mono">{entity.tableName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/50 text-[10px]">{entity.fields.length}</span>
          <span className="text-white/60 text-[10px]">{collapsed ? '▶' : '▼'}</span>
        </div>
      </div>

      {/* Fields */}
      {!collapsed && (
        <div className="divide-y divide-slate-700/30">
          {entity.fields.map((field) => {
            const isPK = field.constraints.includes('PK');
            const isFK = field.constraints.includes('FK');
            const visibleConstraints = field.constraints.filter(c => c !== 'NN' && c !== 'IDX' && c !== 'DEFAULT');
            return (
              <div
                key={field.name}
                className={`flex items-center gap-2 px-3 py-1.5 ${isPK ? 'bg-yellow-500/5' : isFK ? 'bg-blue-500/5' : ''}`}
              >
                <span className={`font-mono text-[11px] flex-1 truncate ${isPK ? 'text-yellow-300 font-semibold' : isFK ? 'text-blue-300' : 'text-slate-300'}`}>
                  {field.name}
                </span>
                <span className="text-slate-500 text-[10px] shrink-0">{field.type}</span>
                <div className="flex gap-0.5 shrink-0">
                  {visibleConstraints.map(c => (
                    <span key={c} className={`text-[9px] px-1 py-0.5 rounded font-bold leading-none ${CONSTRAINT_BADGES[c].cls}`}>
                      {CONSTRAINT_BADGES[c].label}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default memo(EntityNode);
