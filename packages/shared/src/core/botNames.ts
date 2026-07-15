/** One shared pool of nicknames so bot tables feel different every game. */
export const BOT_NAME_POOL: readonly string[] = [
  'Bot Chandu',
  'Bot Meena',
  'Bot Raju',
  'Bot Lakshmi',
  'Bot Ganpat',
  'Bot Shalu',
  'Bot Pinky',
  'Bot Bablu',
  'Bot Guddu',
  'Bot Chintu',
  'Bot Munna',
  'Bot Sweety',
  'Bot Golu',
  'Bot Dolly',
  'Bot Pappu',
  'Bot Tinku',
  'Bot Rani',
  'Bot Bunty',
  'Bot Neetu',
  'Bot Montu',
];

/** A random name not already at the table (falls back to Bot 1, Bot 2, …). */
export function pickBotName(used: Iterable<string>, rand: () => number = Math.random): string {
  const taken = new Set(used);
  const free = BOT_NAME_POOL.filter((n) => !taken.has(n));
  if (free.length > 0) return free[Math.floor(rand() * free.length)]!;
  let i = 1;
  while (taken.has(`Bot ${i}`)) i++;
  return `Bot ${i}`;
}
