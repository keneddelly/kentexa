export function mergeActiveRole(
  current: string[] | null | undefined,
  role: string,
): string[] {
  const set = new Set(current || []);
  set.add(role);
  return Array.from(set);
}
