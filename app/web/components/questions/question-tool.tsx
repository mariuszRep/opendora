"use client"

import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { QuestionAnswer, QuestionRequest } from "@/lib/opendora"
import { cn } from "@/lib/utils"
import { CheckIcon } from "lucide-react"

export function QuestionStep(props: {
  question: QuestionRequest["questions"][number]
  value: QuestionAnswer
  customValue: string
  onToggle: (label: string) => void
  onPickSingle: (label: string) => void
  onCustomChange: (value: string) => void
  submitted?: boolean
  hideCustomInput?: boolean
}) {
  const multi = props.question.multiple === true
  const allowCustom = !props.hideCustomInput && props.question.custom !== false
  const hasOptions = (props.question.options ?? []).length > 0
  const hasDescriptions = (props.question.options ?? []).some((o) => o.description)

  return (
    <div className="grid gap-3">
      <div className="space-y-0.5">
        <p className="text-sm font-medium leading-relaxed text-foreground">{props.question.question}</p>
        {hasOptions ? (
          <p className="text-muted-foreground text-xs">
            {multi ? "Select all that apply." : "Select one answer."}
          </p>
        ) : null}
      </div>
      <div className={cn("grid gap-2", hasDescriptions ? "sm:grid-cols-2 xl:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4")}>
        {(props.question.options ?? []).map((option) => {
          const checked = props.value.includes(option.label)
          return (
            <button
              className={cn(
                "group flex w-full rounded-lg border text-left transition-all duration-150",
                hasDescriptions ? "items-start gap-3 px-4 py-3" : "items-center gap-2.5 px-3 py-2",
                props.submitted
                  ? checked
                    ? "border-accent bg-accent/15"
                    : "border-border bg-secondary/30 opacity-50"
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
              <div className={cn("flex min-w-0 flex-1 gap-2", hasDescriptions ? "items-start" : "items-center")}>
                <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {checked ? (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-foreground">
                      <CheckIcon className="h-2.5 w-2.5" />
                    </span>
                  ) : (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full border border-border/50" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-sm font-medium",
                      props.submitted && !checked ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {option.label}
                  </span>
                  {option.description ? (
                    <span
                      className={cn(
                        "mt-0.5 block text-xs",
                        props.submitted && !checked ? "text-muted-foreground/60" : "text-muted-foreground",
                      )}
                    >
                      {option.description}
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {allowCustom ? (
        props.submitted ? (
          props.customValue ? (
            <div className="rounded-md border border-accent/25 bg-accent/5 px-3 py-2">
              <p className="mb-0.5 text-xs text-muted-foreground/70">Custom response</p>
              <p className="text-sm text-foreground">{props.customValue}</p>
            </div>
          ) : null
        ) : hasOptions ? (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground/60">or type your response</p>
            <Input
              className="w-full border-border bg-input text-foreground placeholder:text-muted-foreground"
              disabled={props.submitted}
              onChange={(e) => props.onCustomChange(e.target.value)}
              placeholder="Type your response..."
              value={props.customValue}
            />
          </div>
        ) : (
          <Input
            className="w-full border-border bg-input text-foreground placeholder:text-muted-foreground"
            disabled={props.submitted}
            onChange={(e) => props.onCustomChange(e.target.value)}
            placeholder="Type your response..."
            value={props.customValue}
          />
        )
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
  const totalSteps = props.request.questions.length
  const question = props.request.questions[step]
  const isLast = step === totalSteps - 1
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
      ) : isSubmitted ? (
        <div className="space-y-3">
          {props.request.questions.map((question, index) => {
            const value = submittedAnswers?.[index] ?? []
            const customValue =
              value.find((item) => !(question.options ?? []).some((option) => option.label === item)) ?? ""
            const optionValues = value.filter((item) =>
              (question.options ?? []).some((option) => option.label === item),
            )
            return (
              <div
                key={`${props.request.id}:${index}`}
                className={cn(totalSteps > 1 && "rounded-lg border border-border bg-card px-4 py-3")}
              >
                {totalSteps > 1 ? (
                  <p className="mb-3 text-xs font-semibold text-muted-foreground">
                    {index + 1} of {totalSteps}
                  </p>
                ) : null}
                <QuestionStep
                  customValue={customValue}
                  onCustomChange={() => {}}
                  onPickSingle={() => {}}
                  onToggle={() => {}}
                  question={question}
                  submitted
                  value={optionValues}
                />
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {totalSteps > 1 ? (
            <div className="flex items-center gap-1.5">
              {props.request.questions.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1 rounded-full transition-all duration-300",
                    i === step ? "w-5 bg-accent" : i < step ? "w-2 bg-accent/40" : "w-2 bg-border",
                  )}
                />
              ))}
              <span className="ml-1 text-xs text-muted-foreground">{step + 1} of {totalSteps}</span>
            </div>
          ) : null}
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
        </div>
      )}
    </>
  )
}
