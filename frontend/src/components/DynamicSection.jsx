import DynamicField from './DynamicField';

export default function DynamicSection({ title, fields, form, onFieldChange, disabled }) {
  return (
    <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => (
          <DynamicField
            key={field.name}
            field={field}
            value={form[field.name]}
            onChange={onFieldChange}
            disabled={disabled}
          />
        ))}
      </div>
    </section>
  );
}
