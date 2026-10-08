import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { PlantLogo } from "../src/components/PlantLogo"
import { LanguageProvider, LanguageSelect } from "../src/components/Language"

beforeEach(() => { localStorage.clear(); sessionStorage.clear() })
afterEach(() => { localStorage.clear(); sessionStorage.clear() })

describe("Movimiento de la plantita", () => {
  it("permite pausar y reanudar por teclado sin guardar otra preferencia ni remontar la imagen", async () => {
    render(<PlantLogo />)
    const button = screen.getByRole("button", { name: "Animación de la planta" })
    const image = button.querySelector("img")
    expect(button.getAttribute("aria-pressed")).toBe("true")
    button.focus()
    await userEvent.keyboard(" ")
    expect(button.getAttribute("aria-pressed")).toBe("false")
    expect(image?.getAttribute("src")).toBe("/plant-logo-static.svg")
    expect(document.activeElement).toBe(button)
    await userEvent.keyboard("{Enter}")
    expect(button.getAttribute("aria-pressed")).toBe("true")
    expect(button.querySelector("img")).toBe(image)
    expect(image?.getAttribute("src")).toBe("/plant-logo.svg")
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it("conserva la pausa al cambiar de idioma y traduce el nombre del control", () => {
    localStorage.setItem("activity-hub.language", "es")
    render(<LanguageProvider><LanguageSelect /><PlantLogo /></LanguageProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Animación de la planta" }))
    fireEvent.change(screen.getByRole("combobox", { name: "Idioma" }), { target: { value: "en" } })
    const button = screen.getByRole("button", { name: "Plant animation" })
    expect(button.getAttribute("aria-pressed")).toBe("false")
    expect(button.title).toBe("Resume animation")
    expect(button.querySelector("img")?.getAttribute("src")).toBe("/plant-logo-static.svg")
    expect(localStorage.length).toBe(1)
  })
})
