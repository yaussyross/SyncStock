/** Only remove saved mappings that the merchant cleared in the loaded catalog. */
export function clearedMappingIds(
  loadedVariantIds: string[],
  savedVariantIds: string[],
  selections: Record<string, string>,
): string[] {
  const saved = new Set(savedVariantIds);
  return loadedVariantIds.filter((id) => saved.has(id) && !selections[id]);
}
