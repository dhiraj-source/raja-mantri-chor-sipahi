const EMOJIS = ['🎨', '🖌️', '🧑‍🎨', '🦄', '🐱', '🦊', '🐸', '🐵', '🦉', '🐼', '🦁', '🐧'];

/** playerId se deterministic emoji — RMCS ke character-shop system se alag (DG me koi shop nahi). */
export function dgAvatarEmoji(playerId: string): string {
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) hash = (hash * 31 + playerId.charCodeAt(i)) >>> 0;
  return EMOJIS[hash % EMOJIS.length] as string;
}
