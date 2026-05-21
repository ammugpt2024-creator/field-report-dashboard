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
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Delivery & Testing Records</h2>
          <p className="text-sm text-slate-500">Compact engineering table with sticky headers and row-based ticket uploads.</p>
        </div>
        <button
          onClick={onAddRow}
          disabled={disabled}
          className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add Record
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1200px] w-full border-separate border-spacing-0 text-sm text-left">
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
                <td className="border-b border-slate-200 px-2 py-2 align-top w-[260px]">
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
    </section>
  );
}
