import React from 'react';
import { ean13Modules, isValidEan13 } from '../services/barcode';

interface BarcodeProps {
  code: string;
  height?: number;
  moduleWidth?: number;
  showText?: boolean;
}

/** Rendu SVG d'un code-barres EAN-13, scannable par une douchette (fond blanc). */
export default function Barcode({ code, height = 56, moduleWidth = 2, showText = true }: BarcodeProps) {
  const bits = ean13Modules(code);
  if (!bits) {
    return <span className="text-[10px] text-red-500">Code-barres invalide (EAN-13 = 13 chiffres).</span>;
  }
  const quiet = moduleWidth * 6; // marge silencieuse gauche/droite
  const width = bits.length * moduleWidth + quiet * 2;
  const textH = showText ? 16 : 0;

  const bars: React.ReactElement[] = [];
  let x = quiet;
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '1') bars.push(<rect key={i} x={x} y={0} width={moduleWidth} height={height} fill="#000" />);
    x += moduleWidth;
  }

  return (
    <span className="inline-flex flex-col items-center">
      <svg width={width} height={height + textH} viewBox={`0 0 ${width} ${height + textH}`} style={{ background: '#fff' }} shapeRendering="crispEdges">
        {bars}
        {showText && (
          <text x={width / 2} y={height + 13} textAnchor="middle" fontSize="12" fontFamily="monospace" letterSpacing="1" fill="#000">{code}</text>
        )}
      </svg>
      {!isValidEan13(code) && (
        <span className="text-[9px] text-amber-500 mt-0.5">Clé de contrôle non conforme — utilisez « Générer ».</span>
      )}
    </span>
  );
}
