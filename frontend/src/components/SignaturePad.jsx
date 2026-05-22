import { useRef, useState, useEffect } from 'react';

export default function SignaturePad({ label, value, onSave, disabled = false }) {
  const canvasRef = useRef(null);
  const [isDirty, setIsDirty] = useState(false);
  const [mode, setMode] = useState('draw');
  const [typedSignature, setTypedSignature] = useState('');

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
    if (canvas) {
      const context = canvas.getContext('2d');
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
    setIsDirty(false);
    setTypedSignature('');
    onSave('');
  };

  const saveSignature = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onSave(dataUrl);
  };

  const saveTypedSignature = () => {
    const trimmedSignature = typedSignature.trim();
    if (!trimmedSignature) return;

    const canvas = document.createElement('canvas');
    canvas.width = 700;
    canvas.height = 200;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#cbd5e1';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(70, 138);
    context.lineTo(630, 138);
    context.stroke();
    context.fillStyle = '#0f172a';
    context.font = '52px "Brush Script MT", "Segoe Script", cursive';
    context.textAlign = 'center';
    context.fillText(trimmedSignature, canvas.width / 2, 118);
    context.fillStyle = '#475569';
    context.font = '14px Arial';
    context.fillText('Digitally typed signature', canvas.width / 2, 162);
    onSave(canvas.toDataURL('image/png'));
  };

  return (
    <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">{label}</h2>
          <p className="text-sm text-slate-500">Draw or type your signature to include it in the final report.</p>
        </div>
        {!value && (
          <div className="inline-flex rounded-2xl bg-slate-100 p-1">
            {['draw', 'type'].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                disabled={disabled}
                className={`rounded-xl px-4 py-2 text-sm font-semibold capitalize transition ${
                  mode === option ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="rounded-3xl border border-slate-300 bg-slate-50 p-3">
        {value ? (
          <img src={value} alt="Signature Preview" className="h-32 w-full rounded-2xl object-contain" />
        ) : mode === 'type' ? (
          <div className="rounded-2xl bg-white p-4">
            <input
              type="text"
              value={typedSignature}
              onChange={(event) => setTypedSignature(event.target.value)}
              disabled={disabled}
              placeholder="Type full legal name"
              className="h-12 w-full rounded-2xl border border-slate-300 px-4 text-lg font-semibold text-slate-950 outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
            />
            <div className="mt-4 flex min-h-24 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6">
              <p className="text-center font-serif text-4xl italic text-slate-950">
                {typedSignature || 'Signature preview'}
              </p>
            </div>
          </div>
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
        {mode === 'type' && !value ? (
          <button
            onClick={saveTypedSignature}
            disabled={disabled || !typedSignature.trim()}
            className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save Typed Signature
          </button>
        ) : (
          <button
            onClick={saveSignature}
            disabled={disabled || !isDirty || Boolean(value)}
            className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save Signature
          </button>
        )}
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
