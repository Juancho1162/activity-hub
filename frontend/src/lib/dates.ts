export function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value < "0001-01-01") return false
  const parsed = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

export function todayInMadrid(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now)
  const part = (type: string) => parts.find((item) => item.type === type)!.value
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`
}

export function shiftDay(day: string, amount: number): string {
  if (!isDay(day) || !Number.isInteger(amount)) throw new Error("Invalid calendar date")
  const value = new Date(`${day}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + amount)
  const result = value.toISOString().slice(0, 10)
  if (!isDay(result)) throw new Error("Date out of range")
  return result
}

export function daysInWindow(start: string, end: string): string[] {
  if (!isDay(start) || !isDay(end) || end < start) return []
  const count = Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000) + 1
  if (count > 366) return []
  return Array.from({ length: count }, (_, i) => shiftDay(start, i))
}

export function formatDay(day: string, short = false, locale = "es-ES"): string {
  if (!isDay(day)) return "—"
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", day: "numeric", month: short ? "short" : "long", ...(short ? {} : { year: "numeric" }) }).format(new Date(`${day}T12:00:00Z`))
}
