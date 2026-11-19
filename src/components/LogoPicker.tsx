/**
 * Choix du logo de la société : l'image est réduite (256 px max) dans le navigateur puis
 * conservée en Data URL (WebP, ou PNG si le navigateur ne sait pas encoder le WebP).
 * Utilisé par la fiche société du 1er démarrage et par Configuration ERP.
 */
import React, { useRef } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { showAlert } from '../services/dialog';

const MAX_SIDE = 256;

function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const ratio = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * ratio));
      const h = Math.max(1, Math.round(img.height * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas'));
      ctx.drawImage(img, 0, 0, w, h);
      let out = canvas.toDataURL('image/webp', 0.9);
      if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/png');
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}

export default function LogoPicker({
  value, onChange, fallback,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  /** Initiales affichées tant qu'aucun logo n'est choisi */
  fallback: string;
}) {
  const input = useRef<HTMLInputElement>(null);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showAlert('Choisissez une image (PNG, JPG, WEBP…).', { variant: 'warning' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showAlert('Image trop volumineuse (10 Mo maximum).', { variant: 'warning' });
      return;
    }
    try {
      onChange(await shrinkImage(file));
    } catch {
      showAlert('Impossible de lire cette image.', { variant: 'error' });
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="w-20 h-20 shrink-0 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-cyan-500 bg-slate-50 dark:bg-slate-950/30 flex items-center justify-center overflow-hidden"
        aria-label="Choisir le logo"
      >
        {value ? (
          <img src={value} alt="Logo" className="w-full h-full object-contain" />
        ) : (
          <span className="w-12 h-12 rounded-lg bg-cyan-500 text-white font-extrabold text-lg flex items-center justify-center">
            {fallback}
          </span>
        )}
      </button>
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 hover:border-cyan-500"
        >
          <ImagePlus className="w-4 h-4" /> {value ? 'Changer le logo' : 'Ajouter un logo'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="px-3 py-1 rounded-lg text-[11px] font-semibold text-rose-500 hover:text-rose-600 flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" /> Retirer
          </button>
        )}
        <p className="text-[10px] text-slate-500">Imprimé sur les reçus et factures. Facultatif.</p>
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={pick} />
    </div>
  );
}
