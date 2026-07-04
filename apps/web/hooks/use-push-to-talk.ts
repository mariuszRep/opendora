"use client"

import { useEffect, useRef, useCallback } from "react"
import { matchesHotkey, type HotkeyConfig } from "./use-voice-settings"

interface UsePushToTalkOptions {
  hotkey: HotkeyConfig | null
  enabled: boolean
  onStart: () => void
  onStop: () => Promise<void> | void
  isActive: boolean
}

export function usePushToTalk({
  hotkey,
  enabled,
  onStart,
  onStop,
  isActive,
}: UsePushToTalkOptions) {
  const isHoldingRef = useRef(false)
  const startedByHotkeyRef = useRef(false)

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled || !hotkey) return

      // Debug logging
      console.log('[usePushToTalk] keydown event:', {
        key: event.key,
        code: event.code,
        keyCode: event.keyCode,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        isTrusted: event.isTrusted,
        target: (event.target as HTMLElement).tagName,
        matches: matchesHotkey(event, hotkey),
        hotkey: hotkey
      })

      // Always prevent default for Tab key combinations to avoid browser navigation
      if (hotkey.key === "Tab" || hotkey.key === " " ||
          (hotkey.ctrlKey && event.ctrlKey) ||
          (hotkey.altKey && event.altKey) ||
          (hotkey.shiftKey && event.shiftKey) ||
          (hotkey.metaKey && event.metaKey)) {
        // Check if this could be our hotkey combination
        if (matchesHotkey(event, hotkey)) {
          event.preventDefault()
          event.stopPropagation()
        }
      }

      // Ignore if typing in an input field (unless it's Space without modifiers)
      const target = event.target as HTMLElement
      const isInputField =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable

      // Allow Space hotkey even in input fields if modifiers are used
      const hasModifiers = hotkey.ctrlKey || hotkey.altKey || hotkey.shiftKey || hotkey.metaKey

      // For Tab key, always prevent default when matched to avoid browser navigation
      if (hotkey.key === "Tab" && matchesHotkey(event, hotkey)) {
        event.preventDefault()
        event.stopPropagation()
      }

      if (isInputField && !hasModifiers && hotkey.key !== "Tab") return

      if (matchesHotkey(event, hotkey) && !isHoldingRef.current) {
        console.log('[usePushToTalk] Hotkey matched, starting recording')
        event.preventDefault()
        event.stopPropagation()
        isHoldingRef.current = true
        startedByHotkeyRef.current = true
        onStart()
      }
    },
    [enabled, hotkey, onStart]
  )

  const handleKeyUp = useCallback(
    async (event: KeyboardEvent) => {
      if (!enabled || !hotkey) return

      if (matchesHotkey(event, hotkey) && isHoldingRef.current) {
        event.preventDefault()
        isHoldingRef.current = false
        if (startedByHotkeyRef.current) {
          startedByHotkeyRef.current = false
          await onStop()
        }
      }
    },
    [enabled, hotkey, onStop]
  )

  // Handle window blur (user switches tab/window while holding)
  const handleBlur = useCallback(async () => {
    if (isHoldingRef.current && startedByHotkeyRef.current) {
      isHoldingRef.current = false
      startedByHotkeyRef.current = false
      await onStop()
    }
  }, [onStop])

  useEffect(() => {
    if (!enabled || !hotkey) return

    // Use capture phase so the hotkey intercepts keydown before element handlers
    // (e.g. before PromptInputTextarea's Enter=submit fires). stopPropagation in
    // capture phase prevents the event from ever reaching the textarea.
    window.addEventListener("keydown", handleKeyDown, true)
    window.addEventListener("keyup", handleKeyUp, true)
    window.addEventListener("blur", handleBlur)

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true)
      window.removeEventListener("keyup", handleKeyUp, true)
      window.removeEventListener("blur", handleBlur)
    }
  }, [enabled, hotkey, handleKeyDown, handleKeyUp, handleBlur])

  return {
    isHotkeyTriggered: startedByHotkeyRef.current && isActive,
  }
}
