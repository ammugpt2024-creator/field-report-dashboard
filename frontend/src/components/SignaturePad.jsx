import { useRef, useState, useEffect } from 'react';

export default function SignaturePad({
  label,
  value,
  onSave,
  disabled = false,
  saveLabel = 'Save Signature',
  typedSaveLabel = 'Save Typed Signature'
}) {
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const pointerEventsSupportedRef = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  const [mode, setMode] = useState('draw');
  const [typedSignature, setTypedSignature] = useState('');
  const [allowTypedSignature, setAllowTypedSignature] = useState(false);

  useEffect(() => {
    pointerEventsSupportedRef.current = 'PointerEvent' in window;
    const mediaQuery = window.matchMedia('(pointer: fine)');
    const updateModeAvailability = () => {
      setAllowTypedSignature(false);
      setMode('draw');
    };

    updateModeAvailability();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', updateModeAvailability);
      return () => mediaQuery.removeEventListener('change', updateModeAvailability);
    }

    mediaQuery.addListener?.(updateModeAvailability);
    return () => mediaQuery.removeListener?.(updateModeAvailability);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || value || mode !== 'draw') return;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#0f172a';
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.lineJoin = 'round';
  }, [mode, value]);

  const getCanvasPoint = (clientX, clientY) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height
    };
  };

  const configureCanvasStroke = (context) => {
    context.strokeStyle = '#0f172a';
    context.fillStyle = '#0f172a';
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.lineJoin = 'round';
  };

  const beginStroke = (clientX, clientY) => {
    if (disabled || value) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    configureCanvasStroke(context);
    const point = getCanvasPoint(clientX, clientY);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.arc(point.x, point.y, 0.5, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(point.x, point.y);
    isDrawingRef.current = true;
    setIsDirty(true);
  };

  const continueStroke = (clientX, clientY) => {
    if (disabled || value || !isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    configureCanvasStroke(context);
    const point = getCanvasPoint(clientX, clientY);
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const endStroke = () => {
    isDrawingRef.current = false;
  };

  const startPointerDrawing = (event) => {
    if (!pointerEventsSupportedRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.preventDefault();
    beginStroke(event.clientX, event.clientY);
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {
      // Some browser/device combinations do not allow pointer capture on synthetic pointer streams.
    }
  };

  const pointerDraw = (event) => {
    if (!pointerEventsSupportedRef.current) return;
    event.preventDefault();
    continueStroke(event.clientX, event.clientY);
  };

  const stopPointerDrawing = (event) => {
    if (!pointerEventsSupportedRef.current) return;
    const canvas = canvasRef.current;
    endStroke();
    try {
      if (event?.pointerId) canvas?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may not have been established on every browser.
    }
  };

  const startMouseDrawing = (event) => {
    if (pointerEventsSupportedRef.current) return;
    event.preventDefault();
    beginStroke(event.clientX, event.clientY);
  };

  const mouseDraw = (event) => {
    if (pointerEventsSupportedRef.current) return;
    event.preventDefault();
    continueStroke(event.clientX, event.clientY);
  };

  const startTouchDrawing = (event) => {
    if (pointerEventsSupportedRef.current) return;
    const touch = event.touches[0];
    if (!touch) return;
    event.preventDefault();
    beginStroke(touch.clientX, touch.clientY);
  };

  const touchDraw = (event) => {
    if (pointerEventsSupportedRef.current) return;
    const touch = event.touches[0];
    if (!touch) return;
    event.preventDefault();
    continueStroke(touch.clientX, touch.clientY);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    endStroke();
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
    onSave(canvas.toDataURL('image/png'));
  };

  return (
    <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">{label}</h2>
          <p className="text-sm text-slate-500">
            {allowTypedSignature
              ? 'Draw or type your signature to include it in the submitted compliance record.'
              : 'Draw your signature with your finger or stylus to include it in the submitted compliance record.'}
          </p>
        </div>
        {!value && (
          <div className="inline-flex rounded-2xl bg-slate-100 p-1">
            {['draw', ...(allowTypedSignature ? ['type'] : [])].map((option) => (
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
            className="w-full touch-none rounded-2xl bg-white"
            onPointerDown={startPointerDrawing}
            onPointerMove={pointerDraw}
            onPointerUp={stopPointerDrawing}
            onPointerCancel={stopPointerDrawing}
            onPointerLeave={stopPointerDrawing}
            onMouseDown={startMouseDrawing}
            onMouseMove={mouseDraw}
            onMouseUp={endStroke}
            onMouseLeave={endStroke}
            onTouchStart={startTouchDrawing}
            onTouchMove={touchDraw}
            onTouchEnd={endStroke}
            onTouchCancel={endStroke}
          />
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {mode === 'type' && !value ? (
          <button
            type="button"
            onClick={saveTypedSignature}
            disabled={disabled || !typedSignature.trim()}
            className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {typedSaveLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={saveSignature}
            disabled={disabled || !isDirty || Boolean(value)}
            className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveLabel}
          </button>
        )}
        <button
          type="button"
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
