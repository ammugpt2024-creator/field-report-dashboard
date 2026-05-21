export default function AttachmentUploader({ rowId, attachments = [], onUpload, disabled = false }) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-slate-700">Truck Ticket Upload</label>
      <div className="flex items-center gap-2">
        <label className="cursor-pointer rounded-2xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
          Upload
          <input
            type="file"
            accept="image/*,.pdf"
            multiple
            capture="environment"
            disabled={disabled}
            onChange={(event) => onUpload(rowId, Array.from(event.target.files || []))}
            className="hidden"
          />
        </label>
      </div>
      {attachments.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {attachments.map((file, index) => (
            <div key={`${rowId}-${index}`} className="truncate">
              {file.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
