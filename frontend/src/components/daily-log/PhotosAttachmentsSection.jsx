import { useEffect, useRef, useState } from "react";
import { Camera, FileText, Image, Paperclip, RotateCcw, Trash2, Upload, X } from "lucide-react";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { supabase } from "../../services/supabase";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const DAILY_LOG_ATTACHMENT_BUCKET = "daily-log-attachments";
const FALLBACK_ATTACHMENT_BUCKETS = [DAILY_LOG_ATTACHMENT_BUCKET, "report-attachments"];
const ALLOWED_FILE_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif"];
const BLOCKED_FILE_EXTENSIONS = [".bat", ".cmd", ".com", ".exe", ".js", ".jar", ".msi", ".ps1", ".sh", ".vbs"];

function getExtension(fileName = "") {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
}

export function isAllowedDailyLogAttachment(file, attachmentType) {
  const extension = getExtension(file.name);
  if (BLOCKED_FILE_EXTENSIONS.includes(extension)) return false;
  if (file.size > MAX_FILE_SIZE) return false;
  if (attachmentType === "photo") return file.type.startsWith("image/") || [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif"].includes(extension);
  return file.type.startsWith("image/") || file.type === "application/pdf" || ALLOWED_FILE_EXTENSIONS.includes(extension);
}

export function formatFileSize(size = 0) {
  if (!size) return "0 KB";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentUrl(attachment) {
  return attachment.dataUrl ||
    attachment.data_url ||
    attachment.url ||
    attachment.publicUrl ||
    attachment.public_url ||
    attachment.signedUrl ||
    attachment.signed_url ||
    attachment.downloadUrl ||
    attachment.download_url ||
    attachment.fileUrl ||
    attachment.file_url ||
    attachment.previewUrl ||
    attachment.preview_url ||
    attachment.objectUrl ||
    attachment.object_url ||
    "";
}

function attachmentStoragePath(attachment) {
  return attachment.storagePath ||
    attachment.storage_path ||
    attachment.filePath ||
    attachment.file_path ||
    attachment.objectPath ||
    attachment.object_path ||
    attachment.path ||
    "";
}

function attachmentStorageBucket(attachment) {
  return attachment.storageBucket ||
    attachment.storage_bucket ||
    attachment.bucketName ||
    attachment.bucket_name ||
    attachment.bucket ||
    DAILY_LOG_ATTACHMENT_BUCKET;
}

function attachmentBucketAttempts(attachment) {
  return [attachmentStorageBucket(attachment), ...FALLBACK_ATTACHMENT_BUCKETS]
    .filter(Boolean)
    .filter((bucket, index, buckets) => buckets.indexOf(bucket) === index);
}

function attachmentFileName(attachment) {
  return attachment.fileName || attachment.file_name || attachment.name || "";
}

function attachmentFileType(attachment) {
  return attachment.fileType || attachment.file_type || attachment.mimeType || attachment.mime_type || "";
}

function hasRenderableAttachmentSource(attachment) {
  const durableUrl = attachment.dataUrl ||
    attachment.data_url ||
    attachment.url ||
    attachment.downloadUrl ||
    attachment.fileUrl ||
    attachment.file_url;
  const storagePath = attachmentStoragePath(attachment);
  const previewUrl = attachment.previewUrl || attachment.objectUrl || "";

  if (durableUrl) return true;
  if (storagePath) return true;
  return Boolean(previewUrl && !String(previewUrl).startsWith("blob:"));
}

function isImageAttachment(attachment) {
  return attachment.attachmentType === "photo" || attachmentFileType(attachment).startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(attachmentFileName(attachment));
}

function isPdfAttachment(attachment) {
  return attachmentFileType(attachment) === "application/pdf" || /\.pdf$/i.test(attachmentFileName(attachment));
}

function isDocxAttachment(attachment) {
  return /\.docx$/i.test(attachmentFileName(attachment));
}

function getPdfRenderScale(page) {
  const viewport = page.getViewport({ scale: 1 });
  const targetWidth = viewport.width > viewport.height ? 1800 : 1300;
  const rawScale = targetWidth / Math.max(viewport.width, 1);
  const maxPixels = 4_500_000;
  const pixelScale = Math.sqrt(maxPixels / Math.max(viewport.width * viewport.height, 1));
  return Math.max(1, Math.min(rawScale, pixelScale, 2.25));
}

function canUseNativeCameraCapture() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod/i.test(userAgent) || window.matchMedia?.("(pointer: coarse)")?.matches;
}

function getCameraErrorMessage(error) {
  const errorName = error?.name || "";
  if (errorName === "NotAllowedError" || errorName === "SecurityError") {
    return "Camera permission is blocked. Click the site controls in the address bar, allow Camera for this site, then try again.";
  }
  if (errorName === "NotFoundError" || errorName === "OverconstrainedError") {
    return "No camera was found on this device. Use Upload Photo to attach an existing image, or try on a phone/tablet with a camera.";
  }
  if (errorName === "NotReadableError") {
    return "The camera is already in use by another app. Close the other app and try again.";
  }
  if (typeof window !== "undefined" && window.location.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return "Camera capture requires HTTPS or localhost.";
  }
  return "Unable to access the camera. Please allow camera permission and try again.";
}

export function AttachmentRenderer({ attachment }) {
  const [docxHtml, setDocxHtml] = useState("");
  const [pdfPages, setPdfPages] = useState([]);
  const [renderError, setRenderError] = useState("");
  const [resolvedUrl, setResolvedUrl] = useState(attachmentUrl(attachment));
  const url = resolvedUrl;

  useEffect(() => {
    let active = true;

    async function resolveAttachmentUrl() {
      const existingUrl = attachmentUrl(attachment);
      const storagePath = attachmentStoragePath(attachment);
      if (existingUrl?.startsWith("data:")) {
        setResolvedUrl(existingUrl);
        return existingUrl;
      }

      if (!storagePath) {
        setResolvedUrl(existingUrl || "");
        return existingUrl || "";
      }

      let lastError = null;
      for (const bucket of attachmentBucketAttempts(attachment)) {
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

        if (!error && data?.signedUrl) {
          const signedUrl = data.signedUrl;
          if (active) setResolvedUrl(signedUrl);
          return signedUrl;
        }
        lastError = error;
      }

      if (existingUrl) {
        setResolvedUrl(existingUrl);
        return existingUrl;
      }
      throw lastError || new Error("Attachment source is unavailable.");
    }

    async function renderAttachment() {
      try {
        setRenderError("");
        setDocxHtml("");
        setPdfPages([]);
        const nextUrl = await resolveAttachmentUrl();

        if (!nextUrl) {
          setRenderError("This attachment does not have a saved file URL. Please re-upload it.");
          return;
        }

        if (isPdfAttachment(attachment)) {
          const response = await fetch(nextUrl);
          if (!response.ok) throw new Error(`PDF fetch failed: ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
          pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
          const loadingTask = pdfjs.getDocument({ data: arrayBuffer.slice(0) });
          const pdf = await loadingTask.promise;
          const renderedPages = [];

          for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            const page = await pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale: getPdfRenderScale(page) });
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Canvas rendering is not available.");
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            context.save();
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.restore();
            await page.render({ canvasContext: context, viewport }).promise;
            renderedPages.push({
              pageNumber,
              imageUrl: canvas.toDataURL("image/png"),
              width: canvas.width,
              height: canvas.height
            });
          }

          if (active) setPdfPages(renderedPages);
          return;
        }

        if (isDocxAttachment(attachment)) {
          const response = await fetch(nextUrl);
          if (!response.ok) throw new Error(`Document fetch failed: ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          const mammoth = await import("mammoth/mammoth.browser");
          const result = await mammoth.convertToHtml({ arrayBuffer });
          if (active) setDocxHtml(result.value || "");
        }
      } catch (error) {
        console.error("Unable to render attachment", error);
        if (active) setRenderError("Attachment source is unavailable. Re-upload this file to include it in the submitted report.");
      }
    }

    renderAttachment();
    return () => {
      active = false;
    };
  }, [attachment]);

  if (isImageAttachment(attachment) && url) {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        <img
          src={url}
          alt={attachmentFileName(attachment) || "Attachment"}
          className="mx-auto block max-h-[400px] w-auto max-w-full object-contain"
          onError={() => {
            setResolvedUrl("");
            setRenderError("Attachment source is unavailable. Re-upload this file to include it in the submitted report.");
          }}
        />
        {renderError && <p className="p-4 text-sm font-semibold text-slate-500">{renderError}</p>}
      </div>
    );
  }

  if (isImageAttachment(attachment) && renderError) {
    return <p className="rounded-xl bg-white p-4 text-sm font-semibold text-slate-500">{renderError}</p>;
  }

  if (isPdfAttachment(attachment)) {
    return (
      <div className="space-y-4 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-100 p-3">
        {pdfPages.length ? (
          pdfPages.map((page) => (
            <div key={page.pageNumber} className="mx-auto w-full max-w-[820px] rounded-xl bg-white p-2 shadow-sm">
              <img
                src={page.imageUrl}
                alt={`Page ${page.pageNumber}`}
                className="mx-auto block h-auto w-full object-contain"
                style={{ aspectRatio: `${page.width} / ${page.height}` }}
              />
            </div>
          ))
        ) : (
          <p className="rounded-xl bg-white p-4 text-sm font-semibold text-slate-500">{renderError || "Rendering PDF..."}</p>
        )}
      </div>
    );
  }

  if (isDocxAttachment(attachment)) {
    return (
      <div className="max-h-[720px] overflow-auto rounded-2xl border border-slate-200 bg-white p-6">
        {docxHtml ? (
          <div className="prose prose-sm max-w-none text-slate-900" dangerouslySetInnerHTML={{ __html: docxHtml }} />
        ) : (
          <p className="text-sm font-semibold text-slate-500">{renderError || "Rendering document..."}</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          <FileText className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-950">Inline renderer unavailable for this file type.</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{attachmentFileType(attachment) || "Unknown file type"}</p>
        </div>
      </div>
    </div>
  );
}

function AttachmentCard({ attachment, onRemove, onRetry }) {
  const fileName = attachmentFileName(attachment) || "Attachment";
  const fileType = attachmentFileType(attachment) || (attachment.attachmentType === "photo" ? "Photo" : "File");
  const fileSize = attachment.fileSize || attachment.file_size || attachment.size;
  const uploadedAt = attachment.uploadedAt || attachment.uploaded_at || attachment.createdAt || attachment.created_at;
  const Icon = isImageAttachment(attachment) ? Image : isPdfAttachment(attachment) || isDocxAttachment(attachment) ? FileText : Paperclip;
  const details = [
    fileSize ? formatFileSize(fileSize) : "",
    uploadedAt ? new Date(uploadedAt).toLocaleString() : "",
    attachment.uploadStatus === "failed" ? "Upload failed" : ""
  ].filter(Boolean);

  return (
    <article className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <Icon className="h-4 w-4" />
          </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-950">{fileName}</p>
          <p className={`mt-0.5 truncate text-xs font-semibold ${attachment.uploadStatus === "failed" ? "text-rose-700" : "text-slate-500"}`}>
            {[fileType, ...details].filter(Boolean).join(" • ")}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 justify-end gap-2">
        {attachment.uploadStatus === "failed" && (
          <button type="button" onClick={() => onRetry(attachment.id)} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-xs font-bold text-amber-900">
            <RotateCcw className="h-3.5 w-3.5" /> Retry
          </button>
        )}
        <button type="button" onClick={() => onRemove(attachment.id)} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 text-xs font-bold text-rose-700">
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </button>
      </div>
    </article>
  );
}

function AttachmentList({ attachments, onRemove, onRetry }) {
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="divide-y divide-slate-100">
        {attachments.map((attachment) => (
          <AttachmentCard key={attachment.id} attachment={attachment} onRemove={onRemove} onRetry={onRetry} />
        ))}
      </div>
    </div>
  );
}

export default function PhotosAttachmentsSection({ attachments = [], onAddFiles, onRemove, onRetry }) {
  const visibleAttachments = attachments.filter(Boolean);
  const orderedAttachments = [
    ...visibleAttachments.filter((attachment) => attachment.attachmentType === "photo"),
    ...visibleAttachments.filter((attachment) => attachment.attachmentType !== "photo")
  ];
  const showNativeCameraCapture = canUseNativeCameraCapture();
  const videoRef = useRef(null);
  const cameraPanelRef = useRef(null);
  const nativeCameraInputRef = useRef(null);
  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState("");

  function handleFileInputChange(event, attachmentType, { closeCapture = false } = {}) {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length > 0) {
      onAddFiles?.(selectedFiles, attachmentType);
    }
    event.target.value = "";
    if (closeCapture) closeCamera();
  }

  function stopCamera() {
    cameraStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function openCamera() {
    setCameraError("");
    setCameraOpen(true);
    setCameraLoading(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      if (showNativeCameraCapture) {
        setCameraOpen(false);
        setCameraLoading(false);
        nativeCameraInputRef.current?.click();
        return;
      }
      setCameraError("Camera capture is not available in this browser.");
      setCameraLoading(false);
      return;
    }

    try {
      stopCamera();
      const cameraConstraints = [
        {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        },
        { video: true, audio: false }
      ];
      let stream = null;
      let lastError = null;

      for (const constraints of cameraConstraints) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!stream) throw lastError;
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play?.();
      }
    } catch (error) {
      console.error("Unable to open camera", error);
      setCameraError(getCameraErrorMessage(error));
    } finally {
      setCameraLoading(false);
    }
  }

  function closeCamera() {
    stopCamera();
    setCameraOpen(false);
    setCameraLoading(false);
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video?.videoHeight) {
      setCameraError("Camera is not ready yet.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Unable to capture photo.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraError("Unable to capture photo.");
        return;
      }
      const file = new File([blob], `activity-photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      onAddFiles?.([file], "photo");
      closeCamera();
    }, "image/jpeg", 0.92);
  }

  useEffect(() => stopCamera, []);

  useEffect(() => {
    if (!cameraOpen || !videoRef.current || !cameraStreamRef.current) return;
    videoRef.current.srcObject = cameraStreamRef.current;
    videoRef.current.play?.().catch((error) => {
      console.error("Unable to play camera stream", error);
      setCameraError("Camera opened, but the video preview could not start.");
    });
  }, [cameraOpen]);

  useEffect(() => {
    if (!cameraOpen) return;
    window.setTimeout(() => {
      cameraPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 0);
  }, [cameraOpen]);

  const uploadActions = (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={openCamera} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3.5 text-sm font-bold text-white">
        <Camera className="h-4 w-4" />
        Take Photo
      </button>
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => handleFileInputChange(event, "photo", { closeCapture: true })}
      />
      <button
        type="button"
        onClick={() => photoInputRef.current?.click()}
        className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 text-sm font-bold text-blue-800"
      >
        <Image className="h-4 w-4" />
        Upload Photo
      </button>
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(event) => handleFileInputChange(event, "photo")}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-800"
      >
        <Upload className="h-4 w-4" />
        Upload File
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx"
        multiple
        className="sr-only"
        onChange={(event) => handleFileInputChange(event, "file")}
      />
    </div>
  );

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
            <Camera className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-slate-950">Photos & Attachments</h4>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">Capture field photos and supporting files for this activity report.</p>
          </div>
        </div>
        {uploadActions}
      </div>
      <div className="p-4">

      {cameraError && (
        <p className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">
          {cameraError}
        </p>
      )}

      {cameraOpen && (
        <div ref={cameraPanelRef} className="mb-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-white">Camera Capture</p>
              <p className="mt-0.5 text-xs font-semibold text-white/70">
                {showNativeCameraCapture ? "Use browser camera access or open the device camera." : "Browser camera access requires an available webcam and Camera permission for this site."}
              </p>
            </div>
            <button type="button" onClick={closeCamera} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="relative bg-black">
            <video ref={videoRef} playsInline autoPlay muted className="max-h-[520px] w-full bg-black object-contain" />
            {cameraLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4 text-center text-sm font-bold text-white">
                Requesting camera access. Please allow camera permission in the browser prompt.
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 bg-white p-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={closeCamera} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800">
              Cancel
            </button>
            {showNativeCameraCapture && (
              <button type="button" onClick={() => nativeCameraInputRef.current?.click()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-800">
                <Camera className="h-4 w-4" />
                Open Device Camera
              </button>
            )}
            <button type="button" onClick={capturePhoto} disabled={cameraLoading || !cameraStreamRef.current} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white disabled:bg-slate-300 disabled:text-slate-500">
              <Camera className="h-4 w-4" />
              Capture Photo
            </button>
          </div>
        </div>
      )}

      {orderedAttachments.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-8 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400">
            <Image className="h-5 w-5" />
          </span>
          <p className="mt-1 text-sm font-bold text-slate-700">No photos or files added yet</p>
          <p className="text-xs font-semibold text-slate-500">Use Take Photo, Upload Photo, or Upload File above to document this activity.</p>
        </div>
      ) : (
        <AttachmentList attachments={orderedAttachments} onRemove={onRemove} onRetry={onRetry} />
      )}

      <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500">
        <Paperclip className="h-3.5 w-3.5" />
        Allowed: photos, PDF, DOC, DOCX, XLS, XLSX. Executable and script files are blocked.
      </p>
      </div>
    </section>
  );
}
