
const INTENT_CLASSES = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200',
  neutral: 'bg-slate-900 text-white hover:bg-slate-800 shadow-slate-200',
  accent: 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-rose-200',
  warning: 'bg-amber-500 text-white hover:bg-amber-600 shadow-amber-200',
  outline: 'border border-blue-600 bg-white text-blue-600 hover:bg-blue-50'
};

const ActionButton = ({ 
  label, 
  icon: Icon, 
  intent = 'neutral', 
  onClick, 
  disabled, 
  loading,
  className = '',
  href,
  download
}) => {
  const baseClasses = 'inline-flex max-w-full items-center justify-center gap-2 rounded-2xl px-4 py-2 text-xs font-bold transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md active:scale-[0.98]';
  const intentClasses = INTENT_CLASSES[intent] || INTENT_CLASSES.neutral;
  const combinedClasses = `${baseClasses} ${intentClasses} ${className} min-h-11`;

  const content = (
    <>
      {Icon && <Icon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />}
      <span className="truncate">{loading ? 'Processing...' : label}</span>
    </>
  );

  if (href) {
    return (
      <a 
        href={href} 
        download={download}
        target={download ? undefined : "_blank"}
        rel="noreferrer"
        className={combinedClasses}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={combinedClasses}
    >
      {content}
    </button>
  );
};

export default ActionButton;
