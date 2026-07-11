import { describe, expect, it } from "vitest"
import { shouldForwardSidebarSearchChange } from "@/components/ui/input"
import { normalizeSidebarSearchValue } from "@/lib/sidebarSearchBridge"

type NativeEventShape = Parameters<typeof shouldForwardSidebarSearchChange>[0]

function eventOf(values: Partial<NativeEventShape>): NativeEventShape {
  return values as NativeEventShape
}

describe("sidebar search IME event routing", () => {
  it("does not forward intermediate composition input", () => {
    expect(shouldForwardSidebarSearchChange(
      eventOf({ isTrusted: true, isComposing: true }),
      true,
    )).toBe(false)
  })

  it("forwards normal trusted user input", () => {
    expect(shouldForwardSidebarSearchChange(
      eventOf({ isTrusted: true, isComposing: false }),
      false,
    )).toBe(true)
  })

  it("ignores untrusted programmatic synchronization from SearchCenter", () => {
    expect(shouldForwardSidebarSearchChange(
      eventOf({ isTrusted: false, isComposing: false }),
      false,
    )).toBe(false)
  })

  it("reads only valid sidebar bridge string payloads", () => {
    expect(normalizeSidebarSearchValue({ value: "我" })).toBe("我")
    expect(normalizeSidebarSearchValue({ value: "" })).toBe("")
    expect(normalizeSidebarSearchValue({ value: 1 })).toBeNull()
    expect(normalizeSidebarSearchValue(null)).toBeNull()
  })
})
