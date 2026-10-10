'use client';

import Image from 'next/image';
import { useState } from 'react';

type Img = { src: string; alt: string };

/** `labels[i]` = etichetta accessibile della miniatura i (stringhe già tradotte: le funzioni non passano ai Client Component). */
export default function Gallery({ images, emptyLabel, labels }: { images: Img[]; emptyLabel: string; labels: string[] }) {
  const [active, setActive] = useState(0);
  if (images.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-card bg-print-tint text-ink-mute">{emptyLabel}</div>
    );
  }
  const current = images[Math.min(active, images.length - 1)];
  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-card bg-print-tint">
        <Image src={current.src} alt={current.alt} fill priority sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
      </div>
      {images.length > 1 && (
        <ul className="mt-3 grid grid-cols-5 gap-2" aria-label="Gallery">
          {images.slice(0, 5).map((img, i) => (
            <li key={img.src}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={labels[i] ?? `${i + 1} / ${images.length}`}
                aria-current={i === active}
                className={`relative block aspect-square w-full overflow-hidden rounded-card bg-print-tint ring-2 ${
                  i === active ? 'ring-print' : 'ring-transparent hover:ring-line'
                }`}
              >
                <Image src={img.src} alt="" fill sizes="12vw" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
