import AttachmentUploader from './AttachmentUploader';

export default function DynamicTable({
  columns,
  rows,
  onRowChange,
  onAddRow,
  onRemoveRow,
  rowAttachments,
  onAttachFiles,
  disabled
}) {
  return (
    <section className="w-full max-w-full overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Delivery & Testing Records</h2>
          <p className="text-sm text-slate-500">Compact engineering table with sticky headers and row-based ticket uploads.</p>
        </div>
        <button
          onClick={onAddRow}
          disabled={disabled}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          Add Record
        </button>
      </div>

      <div className="hidden lg:block">
        <table className="w-full table-fixed border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-slate-50">
            <tr className="text-slate-700">
              {columns.map((column) => (
                <th
                  key={column.name}
                  className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-3 text-left font-semibold"
                >
                  {column.label}
                </th>
              ))}
              <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-3 text-left font-semibold">
                Ticket Upload
              </th>
              <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-3 text-left font-semibold">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="even:bg-slate-50 hover:bg-slate-100">
                {columns.map((column) => (
                  <td key={`${row.id}-${column.name}`} className="border-b border-slate-200 px-2 py-2 align-top whitespace-nowrap">
                    {column.type === 'textarea' ? (
                      <textarea
                        value={row[column.name] || ''}
                        onChange={(event) => onRowChange(row.id, column.name, event.target.value)}
                        disabled={disabled}
                        className="min-h-[72px] w-full rounded-2xl border border-slate-300 px-3 py-2 text-slate-900"
                      />
                    ) : (
                      <input
                        type={column.type === 'number' ? 'number' : column.type === 'time' ? 'time' : 'text'}
                        value={row[column.name] || ''}
                        onChange={(event) => onRowChange(row.id, column.name, event.target.value)}
                        disabled={disabled}
                        className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-slate-900"
                      />
                    )}
                  </td>
                ))}
                <td className="border-b border-slate-200 px-2 py-2 align-top">
                  <AttachmentUploader
                    rowId={row.id}
                    attachments={rowAttachments[row.id] || []}
                    onUpload={onAttachFiles}
                    disabled={disabled}
                  />
                </td>
                <td className="border-b border-slate-200 px-2 py-2 align-top text-right">
                  <button
                    onClick={() => onRemoveRow(row.id)}
                    disabled={disabled}
                    className="rounded-2xl bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-4 lg:hidden">
        {rows.map((row, rowIndex) => (
          <article key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-600">Record #{rowIndex + 1}</h3>
              <button
                onClick={() => onRemoveRow(row.id)}
                disabled={disabled}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Remove
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {columns.map((column) => (
                <label key={`${row.id}-${column.name}`} className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{column.label}</span>
                  {column.type === 'textarea' ? (
                    <textarea
                      value={row[column.name] || ''}
                      onChange={(event) => onRowChange(row.id, column.name, event.target.value)}
                      disabled={disabled}
                      className="min-h-[88px] w-full rounded-2xl border border-slate-300 px-3 py-2 text-slate-900"
                    />
                  ) : (
                    <input
                      type={column.type === 'number' ? 'number' : column.type === 'time' ? 'time' : 'text'}
                      value={row[column.name] || ''}
                      onChange={(event) => onRowChange(row.id, column.name, event.target.value)}
                      disabled={disabled}
                      className="min-h-11 w-full rounded-2xl border border-slate-300 px-3 py-2 text-slate-900"
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Ticket Upload</p>
              <AttachmentUploader
                rowId={row.id}
                attachments={rowAttachments[row.id] || []}
                onUpload={onAttachFiles}
                disabled={disabled}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
