/** Repeated passive condition reminders belong in the status panel. */
export function isStoryLineVisible(line: string): boolean {
  return line.trim() !== '다친 쪽에 체중이 실리자 걸음이 멈칫한다.'
}
