export function createLocalId(
  prefix: string,
  randomLength: number,
  separator: '-' | '_' = '-'
): string {
  const randomSuffix = Math.random()
    .toString(36)
    .slice(2, 2 + randomLength);
  return `${prefix}${separator}${Date.now()}${separator}${randomSuffix}`;
}
