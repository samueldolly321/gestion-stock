/**
 * Conteneur à défilement horizontal dont la barre de défilement est EN HAUT
 * (celle du bas est masquée). Les deux restent synchronisées ; la barre du haut
 * n'apparaît que si le contenu est plus large que la zone visible.
 */
import React, { useEffect, useRef, useState } from 'react';

export default function TopScroll({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const top = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [overflow, setOverflow] = useState(false);
  const syncing = useRef(false);

  // Largeur du contenu → largeur de la piste de la barre du haut.
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.scrollWidth);
      setOverflow(el.scrollWidth > el.clientWidth + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  });

  const follow = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!from || !to || syncing.current) return;
    syncing.current = true;
    to.scrollLeft = from.scrollLeft;
    requestAnimationFrame(() => { syncing.current = false; });
  };

  return (
    <div className={className}>
      <div
        ref={top}
        onScroll={() => follow(top.current, body.current)}
        className={`overflow-x-auto overflow-y-hidden ${overflow ? '' : 'hidden'}`}
        style={{ height: 14 }}
        data-testid="top-scrollbar"
        aria-hidden="true"
      >
        <div style={{ width, height: 1 }} />
      </div>
      <div ref={body} onScroll={() => follow(body.current, top.current)} className="overflow-x-auto scrollbar-none">
        {children}
      </div>
    </div>
  );
}
