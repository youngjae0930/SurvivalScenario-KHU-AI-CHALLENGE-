import fixedStageSummaries from './fixed-stage-summaries.json'
import resultSummaries from './fixed-stage-result-summaries.json'
/** Short display copy only; the original result and saved evidence stay intact. */
const summaries: Readonly<Record<string, string>> = {
  '문틈으로 그림자가 사라지는 것을 확인했다. 출발할 틈은 찾았지만 소리에 귀를 세우느라 긴장은 남았다.':
    '위험을 피해 출발할 틈을 찾았지만 긴장은 남았다.',
}

export function historyResultSummary(lines: readonly string[], scriptId?: string): string {
  const matchingResult = lines.map(line => (resultSummaries as Readonly<Record<string, string>>)[line]).find(Boolean)
  if (matchingResult) return matchingResult
  const authored = (fixedStageSummaries as Readonly<Record<string, string>>)[scriptId ?? '']
  if (authored) return authored
  const narrative = lines.find(line => line.trim() && !/^[“「‘"]/.test(line.trim())) ?? lines[0] ?? ''
  if (summaries[narrative]) return summaries[narrative]
  // Use the first complete outcome sentence when no dedicated short copy exists.
  return narrative.match(/^.*?[.!?。](?:\s|$)/)?.[0].trim() ?? narrative
}
