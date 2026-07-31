import React, { useEffect, useRef, useState } from 'react';
import { X, Camera } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Appelé à chaque code détecté (les répétitions rapprochées du même code sont ignorées). */
  onDetect: (code: string) => void;
}

/**
 * Scan de code-barres par la webcam via l'API native `BarcodeDetector`
 * (disponible dans Chromium / Electron). Aucune dépendance externe.
 * Repli explicite si l'API n'est pas supportée → la douchette USB reste utilisable.
 */
export default function BarcodeScannerModal({ open, onClose, onDetect }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  // Garde l'identité de onDetect à jour sans relancer la caméra à chaque rendu.
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;
  // Anti-doublon : ignore le même code réémis dans les 1,5 s.
  const lastRef = useRef<{ code: string; t: number }>({ code: '', t: 0 });

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    setError('');

    const BD = (window as any).BarcodeDetector;

    async function start() {
      if (!BD) {
        setError("Le scan par caméra n'est pas supporté par cet appareil. Une douchette USB fonctionne directement (scannez dans la barre de recherche).");
        return;
      }
      try {
        const detector = new BD({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const tick = async () => {
          if (stopped) return;
          try {
            const v = videoRef.current;
            if (v && v.readyState === 4) {
              const codes = await detector.detect(v);
              if (codes && codes.length) {
                const val = String(codes[0].rawValue || '');
                const now = Date.now();
                if (val && (val !== lastRef.current.code || now - lastRef.current.t > 1500)) {
                  lastRef.current = { code: val, t: now };
                  onDetectRef.current(val);
                }
              }
            }
          } catch { /* frame illisible : on ignore */ }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setError("Accès à la caméra refusé ou indisponible. Vérifiez les autorisations, ou utilisez une douchette USB.");
      }
    }
    start();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 w-full max-w-md border border-slate-200 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Camera className="w-4 h-4 text-cyan-400" /> Scanner un code-barres
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-400 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        {error ? (
          <p className="text-xs text-amber-500 py-8 text-center leading-relaxed">{error}</p>
        ) : (
          <div className="relative">
            <video ref={videoRef} className="w-full rounded-xl bg-black aspect-video object-cover" muted playsInline />
            <div className="absolute inset-x-8 top-1/2 h-0.5 bg-red-500/70 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-2 text-center">
          {error ? 'Fermez cette fenêtre pour revenir à la caisse.' : "Visez le code-barres dans le cadre — chaque détection ajoute l'article au panier."}
        </p>
      </div>
    </div>
  );
}
