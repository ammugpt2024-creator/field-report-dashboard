import { useState, useCallback } from 'react';
import { X, Download, Maximize2, Minimize2, ExternalLink } from 'lucide-react';

export default function PdfViewer({ url, fileName, onClose }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);

  const handleDownload = useCallback(() => {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'document.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [url, fileName]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  if (!url) {
    return (
      <div className="flex items-center justify-center h-96 bg-slate-100 rounded-2xl">
        <p className="text-slate-500">No PDF available</p>
      </div>
    );
  }

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-slate-950' : 'bg-white'} rounded-2xl shadow-lg`}>
      <div className="flex items-center justify-between gap-4 p-4 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-slate-900 truncate max-w-xs sm:max-w-md">
            {fileName || 'Document'}
          </h3>
          <span className="text-xs text-slate-500">PDF artifact</span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="p-2 rounded-lg hover:bg-slate-200"
            title="Open PDF in New Tab"
          >
            <ExternalLink className="h-4 w-4 text-slate-700" />
          </a>
          <button
            onClick={handleDownload}
            className="p-2 rounded-lg hover:bg-slate-200"
            title="Download PDF"
          >
            <Download className="h-4 w-4 text-slate-700" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg hover:bg-slate-200"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4 text-slate-700" />
            ) : (
              <Maximize2 className="h-4 w-4 text-slate-700" />
            )}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-200"
              title="Close"
            >
              <X className="h-4 w-4 text-slate-700" />
            </button>
          )}
        </div>
      </div>

      <div className={`relative ${isFullscreen ? 'h-[calc(100vh-64px)]' : 'h-[600px]'} overflow-auto bg-slate-100 flex justify-center p-4`}>
        {loading && (
          <div className="absolute inset-x-0 top-20 z-10 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
          </div>
        )}
        <iframe
          src={url}
          title={fileName || 'PDF report'}
          className="h-full min-h-[560px] w-full rounded-xl border-0 bg-white shadow-inner"
          onLoad={() => setLoading(false)}
        />
      </div>
    </div>
  );
}
