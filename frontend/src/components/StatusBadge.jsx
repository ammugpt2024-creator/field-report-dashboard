import React from 'react';
import { getStatusBadgeConfig } from '../workflow/workflowEngine';

const TONE_CLASSES = {
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  emerald: 'bg-emerald-50 text-emerald-800 border-emerald-100',
  red: 'bg-rose-50 text-rose-800 border-rose-100'
};

const StatusBadge = ({ status, className = '' }) => {
  const { label, tone, icon: Icon } = getStatusBadgeConfig(status);
  const toneClasses = TONE_CLASSES[tone] || TONE_CLASSES.slate;

  return (
    <span className={`inline-flex whitespace-nowrap items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${toneClasses} ${className}`}>
      {Icon && <Icon className="h-3 w-3" />}
      {label}
    </span>
  );
};

export default StatusBadge;
