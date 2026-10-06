// Types only: sample.mjs stays byte-identical to the cyberpunk fixture/model.
import type { FrontDraft, FrontState } from "@/lib/api"
export type SampleFront = FrontDraft & { id: string; created: number; marks: string[] }
export const SIMULATED_TODAY: "2026-10-04"
export const MIN_DAY: "2026-09-07"
export const TIME_ZONE: "Europe/Madrid"
export const STATE_LABELS: Readonly<Record<FrontState, string>>
export class SampleError extends Error { field: string }
export function freshSample(): SampleFront[]
export function isDemoDay(day: unknown): day is string
export function inclusiveDays(start: string, end: string): string[]
export function periodDays(length: number): string[]
export function summarize(front: SampleFront, days: string[]): { count: number; total: number; percentage: number; last: string | null }
export function selectFronts(fronts: SampleFront[], options?: { state?: FrontState | "all"; search?: string; view?: "daily" | "dashboard"; period?: number }): SampleFront[]
export function setCheck(fronts: SampleFront[], id: string, day: string, marked: boolean): SampleFront[]
export function safeReference(value: string | null): string | null
export function saveFront(fronts: SampleFront[], id: string | null, draft: FrontDraft): SampleFront[]
