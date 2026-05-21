import { useRef, useState, useEffect } from 'react';

export default function SignaturePad({ label, value, onSave, disabled = false }) {
  const canvasRef = useRef(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.strokeStyle = '#0f172a';
    context.lineWidth = 2;
    context.lineCap = 'round';
  }, []);

  const startDrawing = (event) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    context.beginPath();
    context.moveTo(event.clientX - rect.left, event.clientY - rect.top);
    canvas.isDrawing = true;
  };

  const draw = (event) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas || !canvas.isDrawing) return;
    const context = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    context.lineTo(event.clientX - rect.left, event.clientY - rect.top);
    context.stroke();
    setIsDirty(true);
  };

  const stopDrawing = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.isDrawing = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    setIsDirty(false);
    onSave('');
  };

  const saveSignature = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onSave(dataUrl);
  };

  return (
    <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">{label}</h2>
          <p className="text-sm text-slate-500">Draw your signature below and save it to include it in the final report.</p>
        </div>
      </div>
      <div className="rounded-3xl border border-slate-300 bg-slate-50 p-3">
        {value ? (
          <img src={value} alt="Signature Preview" className="h-32 w-full rounded-2xl object-contain" />
        ) : (
          <canvas
            ref={canvasRef}
            width={700}
            height={200}
            className="w-full rounded-2xl bg-white"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
          />
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={saveSignature}
          disabled={disabled || !isDirty}
          className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save Signature
        </button>
        <button
          onClick={clearCanvas}
          disabled={disabled}
          className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear
        </button>
      </div>
    </section>
  );
}
