import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Paperclip, Trash2 } from 'lucide-react';
import AttachmentUploader from './AttachmentUploader';

export default function RecordsTable({
  columns,
  rows,
  onRowChange,
  onAddRow,
  onRemoveRow,
  rowAttachments,
  onAttachFiles,
  disabled
}) {
  const [expandedRows, setExpandedRows] = useState({});

  const summaryFields = useMemo(
    () => columns.filter((field) => field.summaryVisible),
    [columns]
  );

  const detailFields = useMemo(
    () => columns.filter((field) => field.expandableDetailVisible),
    [columns]
  );

  const toggleRow = (rowId) => {
    setExpandedRows((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Testing Records</h2>
          <p className="text-sm text-slate-500">Compact row summaries with expandable engineering details and attachment tracking.</p>
        </div>
        <button
          type="button"
          onClick={onAddRow}
          disabled={disabled}
          className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add Record
        </button>
      </div>

      <div className="space-y-4">
        {rows.map((row, index) => (
          <div key={row.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
            <div className="grid gap-3 border-b border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 sm:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_0.8fr] sm:items-center">
              {summaryFields.map((field) => (
                <div key={`${row.id}-${field.name}`} className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{field.label}</p>
                  <p className="mt-1 font-semibold text-slate-900">{row[field.name] || '—'}</p>
                </div>
              ))}
              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => toggleRow(row.id)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-400"
                >
                  {expandedRows[row.id] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  Details
                </button>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => onRemoveRow(row.id)}
                    className="inline-flex items-center gap-2 rounded-2xl bg-rose-500 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                )}
              </div>
            </div>

            {expandedRows[row.id] && (
              <div className="grid gap-4 px-4 py-5 sm:grid-cols-2 xl:grid-cols-3">
                {detailFields.map((field) => (
                  <div key={`${row.id}-detail-${field.name}`} className="space-y-2 rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{field.label}</p>
                      {field.unit && <span className="text-xs text-slate-400">{field.unit}</span>}
                    </div>
                    {field.type === 'textarea' ? (
                      <textarea
                        value={row[field.name] || ''}
                        placeholder={field.placeholder}
                        readOnly={disabled}
                        onChange={(event) => onRowChange(row.id, field.name, event.target.value)}
                        className="h-24 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
                      />
                    ) : (
                      <input
                        type={field.type === 'number' ? 'number' : field.type === 'time' ? 'time' : 'text'}
                        value={row[field.name] || ''}
                        placeholder={field.placeholder}
                        readOnly={disabled}
                        onChange={(event) => onRowChange(row.id, field.name, event.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
                      />
                    )}
                  </div>
                ))}

                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-slate-500" />
                    <p className="text-sm font-semibold text-slate-900">Attachments</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">Upload ticket scans, photos, or PDFs for this test record.</p>
                  <div className="mt-4">
                    <AttachmentUploader
                      rowId={row.id}
                      attachments={rowAttachments[row.id] || []}
                      onUpload={onAttachFiles}
                      disabled={disabled}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {rows.length === 0 && (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-center text-slate-600">
            No records yet. Use Add Record to create the first test delivery row.
          </div>
        )}
      </div>
    </section>
  );
}
