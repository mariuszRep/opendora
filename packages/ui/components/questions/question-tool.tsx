"use client"

import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { QuestionAnswer, QuestionRequest } from "@/lib/opendora"
import { cn } from "@/lib/utils"
import { CheckIcon } from "lucide-react"

function QuestionStep(props: {
  question: QuestionRequest["questions"][number]
  value: QuestionAnswer
  customValue: string
  onToggle: (label: string) => void
  onPickSingle: (label: string) => void
  onCustomChange: (value: string) => void
  submitted?: boolean
}) {
  const multi = props.question.multiple === true
  const allowCustom = props.question.custom !== false

  return (
    <div className="grid gap-4">
      <div className="space-y-1.5">
        <span className="inline-block rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {props.question.header}
        </span>
        <p className="text-sm font-medium leading-relaxed text-foreground">{props.question.question}</p>
        <p className="text-muted-foreground text-xs">
          {multi ? "Select all that apply." : "Select one answer."}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {props.question.options.map((option) => {
          const checked = props.value.includes(option.label)
          return (
            <button
              className={cn(
                "group flex min-h-32 items-start justify-between gap-3 rounded-lg border px-4 py-4 text-left transition-all",
                props.submitted
                  ? checked
                    ? "border-accent bg-accent/15"
                    : "border-border bg-secondary/30 opacity-60"
                  : checked
                    ? "border-accent bg-accent/10"
                    : "border-border bg-secondary/50 hover:border-accent/50 hover:bg-secondary",
              )}
              data-checked={checked}
              disabled={props.submitted}
              key={option.label}
              onClick={() => {
                if (multi) props.onToggle(option.label)
                else props.onPickSingle(option.label)
              }}
              type="button"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center pt-0.5">
                  {checked ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-foreground">
                      <CheckIcon className="h-3 w-3" />
                    </span>
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <span className={cn("block text-sm font-medium", props.submitted && !checked ? "text-muted-foreground" : "text-foreground")}>
                    {option.label}
                  </span>
                  <span className={cn("block text-xs", props.submitted && !checked ? "text-muted-foreground/60" : "text-muted-foreground")}>
                    {option.description}
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
      {allowCustom ? (
        <div className="space-y-3">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-2 text-muted-foreground">or type your response</span>
            </div>
          </div>
          <Input
            className="w-full border-border bg-input text-foreground placeholder:text-muted-foreground"
            disabled={props.submitted}
            onChange={(e) => props.onCustomChange(e.target.value)}
            placeholder="Type your response..."
            value={props.customValue}
          />
        </div>
      ) : null}
    </div>
  )
}

export function QuestionTool(props: {
  request: QuestionRequest
  onReply: (requestID: string, answers: QuestionAnswer[]) => Promise<void>
  onReject: (requestID: string) => Promise<void>
  json: React.ReactNode
  answered?: QuestionAnswer[]
  viewMode?: "code" | "view"
  onViewModeChange?: (mode: "code" | "view") => void
}) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<QuestionAnswer[]>(() => props.request.questions.map(() => []))
  const [custom, setCustom] = useState<string[]>(() => props.request.questions.map(() => ""))
  const submittedAnswers = props.answered
  const isSubmitted = Boolean(submittedAnswers)
  
  const mode = props.viewMode === "code" ? "json" : "interactive"

  const question = props.request.questions[step]
  const isLast = step === props.request.questions.length - 1
  const currentValue = answers[step] ?? []
  const customValue = custom[step] ?? ""
  const canContinue = useMemo(() => currentValue.length > 0 || customValue.trim().length > 0, [currentValue, customValue])

  function setSingleAnswer(label: string) {
    setAnswers((prev) => prev.map((item, index) => (index === step ? [label] : item)))
  }

  function toggleAnswer(label: string) {
    setAnswers((prev) =>
      prev.map((item, index) => {
        if (index !== step) return item
        return item.includes(label) ? item.filter((value) => value !== label) : [...item, label]
      }),
    )
  }

  function setCustomValue(value: string) {
    setCustom((prev) => prev.map((item, index) => (index === step ? value : item)))
  }

  async function handleContinue() {
    const finalAnswers = answers.map((item, index) => {
      const rawCustom = custom[index]
      const trimmedCustom = rawCustom?.trim()
      if (!trimmedCustom) return item
      return item.filter((value) => value !== rawCustom && value !== trimmedCustom).concat(trimmedCustom)
    })

    if (!isLast) {
      setAnswers(finalAnswers)
      setStep((prev) => prev + 1)
      return
    }

    await props.onReply(props.request.id, finalAnswers)
  }

  return (
    <>
      {mode === "json" ? (
        props.json
      ) : (
        <div className="space-y-4">
          {isSubmitted ? (
            <div className="space-y-4">
              {props.request.questions.map((question, index) => {
                const value = submittedAnswers?.[index] ?? []
                const customValue =
                  value.find((item) => !question.options.some((option) => option.label === item)) ?? ""
                return (
                  <QuestionStep
                    customValue={customValue}
                    key={`${props.request.id}:${index}`}
                    onCustomChange={() => {}}
                    onPickSingle={() => {}}
                    onToggle={() => {}}
                    question={question}
                    submitted
                    value={value}
                  />
                )
              })}
            </div>
          ) : (
            <>
              <QuestionStep
                customValue={customValue}
                onCustomChange={setCustomValue}
                onPickSingle={setSingleAnswer}
                onToggle={toggleAnswer}
                question={question}
                value={currentValue}
              />
              <div className="flex items-center justify-between gap-2">
                <Button onClick={() => props.onReject(props.request.id)} type="button" variant="ghost">
                  Dismiss
                </Button>
                <div className="flex items-center gap-2">
                  {step > 0 ? (
                    <Button onClick={() => setStep((prev) => prev - 1)} type="button" variant="outline">
                      Back
                    </Button>
                  ) : null}
                  <Button
                    className="bg-accent text-accent-foreground hover:bg-accent/90"
                    disabled={!canContinue}
                    onClick={() => void handleContinue()}
                    type="button"
                  >
                    {isLast ? "Submit" : "Continue"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
