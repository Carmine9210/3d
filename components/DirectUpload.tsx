'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { getBrowserClient } from '@/lib/supabase/browser';

/**
 * Upload diretto dal browser a Supabase Storage.
 * Evita il limite di ~6 MB delle funzioni serverless (Netlify): il file non passa dal server,
 * che riceve solo il percorso e lo verifica. Le policy Storage limitano la scrittura alla cartella del proprio shop.
 * Le immagini grandi vengono ridimensionate (lato lungo max 2000 px) prima del caricamento.
 */
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 2000;

type Labels = { choose: string; uploading: string; failed: string; invalid: string; done: string };

async function shrink(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size <= 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.86));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export default function DirectUpload({
  bucket,
  prefix,
  name,
  id,
  multiple = false,
  maxFiles = 8,
  filePrefix = '',
  autoSubmit = false,
  labels,
}: {
  bucket: 'product-images' | 'store-assets';
  prefix: string;
  name: string;
  id: string;
  multiple?: boolean;
  maxFiles?: number;
  filePrefix?: string;
  autoSubmit?: boolean;
  labels: Labels;
}) {
  const [paths, setPaths] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  // Blocca l'invio del form mentre un caricamento è in corso.
  useEffect(() => {
    const form = wrapper.current?.closest('form');
    if (!form) return;
    const guard = (e: Event) => {
      if (busyRef.current) e.preventDefault();
    };
    form.addEventListener('submit', guard, true);
    return () => form.removeEventListener('submit', guard, true);
  }, []);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, maxFiles);
    e.target.value = '';
    if (files.length === 0) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(labels.uploading);
    const supabase = getBrowserClient();
    const uploaded: string[] = [];
    let skipped = 0;
    for (const file of files) {
      const blob = await shrink(file);
      const type = blob.type || file.type;
      const ext = TYPES[type];
      if (!ext || blob.size > MAX_BYTES) {
        skipped++;
        continue;
      }
      const path = `${prefix}/${filePrefix}${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: type, upsert: false });
      if (error) skipped++;
      else uploaded.push(path);
    }
    const next = multiple ? [...paths, ...uploaded] : uploaded.slice(0, 1);
    busyRef.current = false;
    // flushSync: gli input nascosti con i percorsi devono essere nel DOM prima dell'invio del form.
    flushSync(() => {
      setPaths(next);
      setBusy(false);
      setMessage(skipped ? (uploaded.length ? labels.invalid : labels.failed) : labels.done);
    });
    if (autoSubmit && uploaded.length > 0) wrapper.current?.closest('form')?.requestSubmit();
  }

  return (
    <div ref={wrapper} className="space-y-1">
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={multiple}
        onChange={onChange}
        disabled={busy}
        aria-label={labels.choose}
        className="field"
      />
      {paths.map((p) => (<input key={p} type="hidden" name={name} value={p} />))}
      {message && <p className="text-xs text-ink-mute" role="status" aria-live="polite">{message}</p>}
    </div>
  );
}
