import { describe, expect, it } from "vitest"
import { daysInWindow, formatDay, isDay, shiftDay, todayInMadrid } from "../src/lib/dates"

describe("Calendario Europe/Madrid", () => {
  it("resuelve el día de Madrid aunque UTC aún sea ayer", () => {
    expect(todayInMadrid(new Date("2026-10-03T22:01:00Z"))).toBe("2026-10-04")
  })
  it.each([
    ["2026-03-28T23:01:00Z", "2026-03-29"],
    ["2026-03-29T01:01:00Z", "2026-03-29"],
    ["2026-03-29T22:01:00Z", "2026-03-30"],
    ["2026-10-25T01:01:00Z", "2026-10-25"],
    ["2026-10-25T22:59:00Z", "2026-10-25"],
    ["2026-10-25T23:01:00Z", "2026-10-26"],
  ])("respeta cambio horario: %s", (timestamp, expected) => {
    expect(todayInMadrid(new Date(timestamp))).toBe(expected)
  })
  it("suma días de calendario sin depender de duración del día", () => {
    expect(shiftDay("2026-03-29", 1)).toBe("2026-03-30")
    expect(shiftDay("2026-10-25", -1)).toBe("2026-10-24")
    expect(shiftDay("2024-03-01", -1)).toBe("2024-02-29")
    expect(formatDay("2026-10-03")).toBe("3 de octubre de 2026")
  })
  it("rechaza fechas inválidas y limita ventanas a 366 días inclusivos", () => {
    for (const value of ["2026-02-30", "2026-1-01", "0000-01-01", "today", 17]) expect(isDay(value)).toBe(false)
    expect(daysInWindow("2024-01-01", "2024-12-31")).toHaveLength(366)
    expect(daysInWindow("2024-01-01", "2025-01-01")).toEqual([])
    expect(daysInWindow("2026-01-02", "2026-01-01")).toEqual([])
  })
})
