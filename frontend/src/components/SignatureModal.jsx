import { useEffect, useState } from 'react';
import SignaturePad from './SignaturePad';

export default function SignatureModal({
  open,
  title,
  description,
  value,
  onSave,
  onClose,
  disabled,
  onClear,
  onConfirm,
  autoConfirmOnSave = false,
  signatureActionLabel = 'Save Signature'
}) {
  const [savedValue, setSavedValue] = useState(value || '');
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    if (open) {
      setSavedValue(value || '');
      setIsConfirming(false);
    }
  }, [open, value]);

  if (!open) return null;

  const handleSignatureSave = async (nextValue) => {
    setSavedValue(nextValue);
    onSave(nextValue);
    if (autoConfirmOnSave && nextValue) {
      setIsConfirming(true);
      try {
        const confirmed = await onConfirm?.(nextValue);
        // Anything other than an explicit success must re-enable the modal,
        // otherwise it stays locked with every control disabled.
        if (confirmed !== true) setIsConfirming(false);
      } catch (error) {
        console.error("Signature confirmation failed", error);
        setIsConfirming(false);
      }
    }
  };

  const isDisabled = disabled || isConfirming;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-3xl rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          </div>
          <button
            onClick={onClose}
            disabled={isDisabled}
            className="rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-600 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <div className="p-6">
          <SignaturePad
            label="Draw your signature"
            value={savedValue}
            onSave={handleSignatureSave}
            disabled={isDisabled}
            saveLabel={signatureActionLabel}
            typedSaveLabel={signatureActionLabel}
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          {!autoConfirmOnSave && (
            <button
              onClick={() => {
                setSavedValue('');
                onClear?.();
              }}
              disabled={isDisabled}
              className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            disabled={isDisabled}
            className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          {!autoConfirmOnSave && (
            <button
              onClick={async () => {
                setIsConfirming(true);
                try {
                  const confirmed = await onConfirm?.(savedValue);
                  if (confirmed !== true) setIsConfirming(false);
                } catch (error) {
                  console.error("Signature confirmation failed", error);
                  setIsConfirming(false);
                }
              }}
              disabled={isDisabled}
              className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Confirm Signature
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
