// Fails if two tracked files share a name apart from letter case or extension, e.g. Insights.tsx and insights.ts.
// Linux treats them as different files; macOS and Windows resolve `import './Insights'` to the wrong one, so the
// project builds in CI and breaks on a developer's machine.
import { execFileSync } from 'node:child_process'

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean)
const byStem = new Map()
for (const f of files) {
  const stem = f.replace(/\.[^./]+$/, '').toLowerCase()
  byStem.set(stem, [...(byStem.get(stem) ?? []), f])
}
const clashes = [...byStem.values()].filter(
  (group) => new Set(group.map((f) => f.replace(/\.[^./]+$/, ''))).size > 1,
)
if (clashes.length) {
  console.error('File names that differ only by case (they collide on macOS and Windows):')
  for (const group of clashes) console.error('  ' + group.join('  vs  '))
  process.exit(1)
}
console.log(`no case-only name clashes in ${files.length} files`)
