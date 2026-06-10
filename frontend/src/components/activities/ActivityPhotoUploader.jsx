import { Camera, Upload } from "lucide-react";

export default function ActivityPhotoUploader({ photos = [], attachments = [] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-slate-950">Photos & Attachments</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">Capture from camera/gallery. Compression and Supabase upload can be wired in the next phase.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800">
            <Camera className="h-4 w-4" />
            Photo
          </button>
          <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800">
            <Upload className="h-4 w-4" />
            File
          </button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-slate-600 sm:grid-cols-4">
        <span className="rounded-xl bg-slate-50 px-3 py-2">{photos.length} photos</span>
        <span className="rounded-xl bg-slate-50 px-3 py-2">{attachments.length} attachments</span>
      </div>
    </div>
  );
}
