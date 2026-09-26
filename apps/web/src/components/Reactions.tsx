import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { REACTIONS, type PlayerId, type Reaction } from '@rmc/shared-types';
import type { ReactionItem } from '../net/clientState';

const VISIBLE_MS = 3000;

/** Emoji buttons. Server cooldown/validation karta hai; galat dabane par sirf error aata hai. */
export function ReactionBar({ onReact }: { onReact: (emoji: Reaction) => void }) {
  return (
    <div className="flex justify-between gap-1 rounded-2xl bg-white/10 p-2">
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          aria-label={`Reaction ${emoji}`}
          onClick={() => onReact(emoji)}
          className="flex-1 rounded-xl py-2 text-2xl transition hover:bg-white/15 active:scale-90"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

/** Room ke doosre players ki haal ki reactions, kuch second baad gayab. */
export function ReactionFeed({
  items,
  nameOf,
  onExpire,
}: {
  items: ReactionItem[];
  nameOf: (id: PlayerId) => string;
  onExpire: (key: number) => void;
}) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-1/2 flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-1 px-4"
    >
      <AnimatePresence>
        {items.map((item) => (
          <FeedItem key={item.key} item={item} name={nameOf(item.playerId)} onExpire={onExpire} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function FeedItem({
  item,
  name,
  onExpire,
}: {
  item: ReactionItem;
  name: string;
  onExpire: (key: number) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onExpire(item.key), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [item.key, onExpire]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20 }}
      className="rounded-full bg-black/60 px-4 py-1 text-sm"
    >
      <span className="text-xl">{item.emoji}</span> {name}
    </motion.div>
  );
}
