"use client"

import { useState, useEffect, useCallback } from "react"

const USER_NAME_KEY = "opendora:user-name"
const USER_COLOR_KEY = "opendora:user-color"

export function useUserProfile() {
  const [userName, setUserNameState] = useState("")
  const [userColor, setUserColorState] = useState("blue")

  useEffect(() => {
    try {
      setUserNameState(localStorage.getItem(USER_NAME_KEY) ?? "")
      setUserColorState(localStorage.getItem(USER_COLOR_KEY) ?? "blue")
    } catch {}
  }, [])

  const setUserName = useCallback((name: string) => {
    setUserNameState(name)
    try {
      if (name) {
        localStorage.setItem(USER_NAME_KEY, name)
      } else {
        localStorage.removeItem(USER_NAME_KEY)
      }
    } catch {}
  }, [])

  const setUserColor = useCallback((color: string) => {
    setUserColorState(color)
    try {
      localStorage.setItem(USER_COLOR_KEY, color)
    } catch {}
  }, [])

  return { userName, setUserName, userColor, setUserColor }
}
