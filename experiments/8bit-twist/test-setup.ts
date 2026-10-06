import { afterEach, vi } from "vitest"
import { cleanup } from "@testing-library/react"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (typeof window !== "undefined") {
    window.localStorage.clear()
    document.documentElement.removeAttribute("data-look")
  }
})
