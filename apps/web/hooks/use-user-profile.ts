"use client"

import { useState, useEffect, useCallback } from "react"
import { opendora } from "@/lib/projectflows"

export function useUserProfile() {
  const [userName, setUserNameState] = useState("")
  const [userColor, setUserColorState] = useState("blue")

  useEffect(() => {
    opendora.user.get().then((profile) => {
      setUserNameState(profile.name)
      setUserColorState(profile.color)
    }).catch(() => {})
  }, [])

  const setUserName = useCallback((name: string) => {
    setUserNameState(name)
    opendora.user.update({ name }).catch(() => {})
  }, [])

  const setUserColor = useCallback((color: string) => {
    setUserColorState(color)
    opendora.user.update({ color }).catch(() => {})
  }, [])

  return { userName, setUserName, userColor, setUserColor }
}
