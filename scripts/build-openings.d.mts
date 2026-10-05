export interface BookJson {
  version: 1
  positions: string[]
  named: Record<string, [eco: string, name: string]>
}
export function buildBook(tsv: string): BookJson
