"use client"

import { useState, useEffect, useCallback } from "react"

const USER_NAME_KEY = "opendora:user-name"

export function useUserProfile() {
  const [userName, setUserNameState] = useState("")

  useEffect(() => {
    try {
      setUserNameState(localStorage.getItem(USER_NAME_KEY) ?? "")
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

  return { userName, setUserName }
}
