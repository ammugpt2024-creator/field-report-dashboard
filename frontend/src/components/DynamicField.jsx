export default function DynamicField({ field, value, onChange, disabled = false }) {
  const inputType = field.type === 'textarea' ? 'textarea' : field.type;
  const isReadOnly = field.readonly || disabled;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-slate-700">
        {field.label}
        {field.required && <span className="text-red-600"> *</span>}
      </label>

      {field.type === 'textarea' ? (
        <textarea
          name={field.name}
          value={value || ''}
          placeholder={field.placeholder}
          readOnly={isReadOnly}
          onChange={(event) => onChange(field.name, event.target.value)}
          className={`w-full min-h-[100px] rounded-2xl border px-4 py-3 text-slate-900 ${
            isReadOnly ? 'border-slate-200 bg-slate-100' : 'border-slate-300 bg-white'
          }`}
        />
      ) : (
        <input
          name={field.name}
          type={inputType}
          value={value || ''}
          placeholder={field.placeholder}
          readOnly={isReadOnly}
          onChange={(event) => onChange(field.name, event.target.value)}
          className={`w-full rounded-2xl border px-4 py-3 text-slate-900 ${
            isReadOnly ? 'border-slate-200 bg-slate-100' : 'border-slate-300 bg-white'
          }`}
        />
      )}
    </div>
  );
}
