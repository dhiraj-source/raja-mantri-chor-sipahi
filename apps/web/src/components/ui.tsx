import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { motion } from 'framer-motion';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const base =
    'rounded-xl px-5 py-3 font-semibold transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed';
  const styles =
    variant === 'primary'
      ? 'bg-amber-400 text-stone-900 hover:bg-amber-300'
      : 'bg-white/10 text-stone-100 hover:bg-white/20';
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl bg-white/10 p-5 shadow-lg backdrop-blur ${className}`}
    >
      {children}
    </motion.div>
  );
}

export function ErrorBanner({
  message,
  closeLabel,
  onClose,
}: {
  message: string | null;
  closeLabel: string;
  onClose: () => void;
}) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-red-500/80 px-4 py-3 text-sm"
    >
      <span>{message}</span>
      <button aria-label={closeLabel} onClick={onClose} className="font-bold">
        ✕
      </button>
    </div>
  );
}
