// Diary dates. A "week" is identified by its Monday as 'YYYY-MM-DD'. All maths uses
// local calendar dates so India's UTC+5:30 never shifts a day.
export const pad2 = (n) => String(n).padStart(2, '0')
export const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
export const parseYMD = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d) }
export const addDays = (s, n) => { const d = parseYMD(s); d.setDate(d.getDate() + n); return ymd(d) }
export const addWeeks = (s, n) => addDays(s, 7 * n)
export function mondayOf(input) {
  const d = typeof input === 'string' ? parseYMD(input) : new Date(input)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return ymd(d)
}
export const fmtDate = (s) => { if (!s) return ''; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}/${y}` }
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const today = () => ymd(new Date())

// Course week 1 = the week containing the class start date (a Sunday counts from the coming Monday)
export function startWeek(classStart) {
  if (!classStart) return null
  const d = parseYMD(classStart)
  if (d.getDay() === 0) d.setDate(d.getDate() + 1)
  return mondayOf(d)
}
export function courseWeekNo(weekStart, classStart) {
  const sw = startWeek(classStart)
  if (!sw) return null
  return Math.round((parseYMD(weekStart) - parseYMD(sw)) / 604800000) + 1
}
export function weekLabel(weekStart, classStart) {
  const n = courseWeekNo(weekStart, classStart)
  if (n === null) return 'Week of ' + fmtDate(weekStart)
  return n >= 1 ? `Week ${n}` : 'Before class start'
}
