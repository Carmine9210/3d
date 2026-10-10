'use client';

import { useFormStatus } from 'react-dom';

export default function SubmitButton({
  children,
  className = 'btn-primary',
  pendingLabel,
}: {
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
