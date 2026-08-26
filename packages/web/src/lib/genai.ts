/** Pick a random seed from the dicebear seed pool, for graceful fallback. */
export function pickRandomAvatarSeed<T>(pool: readonly T[]): T {
  if (pool.length === 0) throw new Error('empty avatar seed pool');
  return pool[Math.floor(Math.random() * pool.length)]!;
}
