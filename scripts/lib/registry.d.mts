/** The fields of a registry entry that the build reads. See registry.mjs. */
export interface ParsedEffect {
  id: string
  name: string
  tagline: string
  category: string
  published: string | null
}
export const root: string
export function parseEffects(sourcePath?: string): ParsedEffect[]
