"use client"

import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import type { QuestionAnswer, QuestionRequest } from "@/lib/opendora"
import { CircleIcon } from "lucide-react"

function QuestionStep(props: {
  question: QuestionRequest["questions"][number]
  value: QuestionAnswer
  customValue: string
  onToggle: (label: string) => void
  onPickSingle: (label: string) => void
  onCustomChange: (value: string) => void
}) {
  const multi = props.question.multiple === true
  const allowCustom = props.question.custom !== false

  return (
    <div className="grid gap-4">
      <div>
        <div className="font-medium">{props.question.question}</div>
        <div className="text-muted-foreground text-sm">
          {multi ? "Select all that apply." : "Select one answer."}
        </div>
      </div>
      <div className="grid gap-3">
        <ItemGroup className="gap-2">
          {props.question.options.map((option) => {
          const checked = props.value.includes(option.label)
          return (
            <Item
              asChild
              className="cursor-pointer data-[checked=true]:border-primary data-[checked=true]:bg-primary/5"
              key={option.label}
              size="sm"
              variant="outline"
              data-checked={checked}
            >
              <label>
                <ItemMedia>
                  {multi ? (
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => {
                        if (multi) props.onToggle(option.label)
                        else props.onPickSingle(option.label)
                      }}
                    />
                  ) : (
                    <span className="flex size-4 items-center justify-center rounded-full border border-input">
                      {checked ? <CircleIcon className="size-2.5 fill-current" /> : null}
                    </span>
                  )}
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{option.label}</ItemTitle>
                  <ItemDescription>{option.description}</ItemDescription>
                </ItemContent>
              </label>
            </Item>
          )
          })}
        </ItemGroup>
        {allowCustom ? (
          <Item className="grid gap-2" size="sm" variant="outline">
            <ItemContent>
              <ItemTitle>Something else</ItemTitle>
              <ItemDescription>Type a custom answer if none of the listed items fit.</ItemDescription>
            </ItemContent>
            <Input
              onChange={(e) => props.onCustomChange(e.target.value)}
              placeholder="Type your own answer"
              value={props.customValue}
            />
          </Item>
        ) : null}
      </div>
    </div>
  )
}

export function QuestionDock(props: {
  request: QuestionRequest
  onReply: (requestID: string, answers: QuestionAnswer[]) => Promise<void>
  onReject: (requestID: string) => Promise<void>
}) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<QuestionAnswer[]>(() => props.request.questions.map(() => []))
  const [custom, setCustom] = useState<string[]>(() => props.request.questions.map(() => ""))
  const question = props.request.questions[step]
  const isLast = step === props.request.questions.length - 1

  const currentValue = answers[step] ?? []
  const customValue = custom[step] ?? ""
  const canContinue = useMemo(() => {
    const answered = currentValue.length > 0
    const customAnswered = customValue.trim().length > 0
    return answered || customAnswered
  }, [currentValue, customValue])

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
      const customValue = custom[index]?.trim()
      if (!customValue) return item
      return item.includes(customValue) ? item : [...item.filter((value) => value !== custom[index]), customValue]
    })

    if (!isLast) {
      setAnswers(finalAnswers)
      setStep((prev) => prev + 1)
      return
    }
    await props.onReply(props.request.id, finalAnswers)
  }

  return (
    <Card className="border-primary/30 bg-background/95 shadow-sm">
      <CardHeader>
        <CardTitle>{props.request.questions.length === 1 ? question.header : `${question.header} (${step + 1}/${props.request.questions.length})`}</CardTitle>
      </CardHeader>
      <CardContent>
        <QuestionStep
          customValue={customValue}
          onCustomChange={setCustomValue}
          onPickSingle={setSingleAnswer}
          onToggle={toggleAnswer}
          question={question}
          value={currentValue}
        />
      </CardContent>
      <CardFooter className="justify-between gap-2">
        <Button onClick={() => props.onReject(props.request.id)} type="button" variant="ghost">
          Dismiss
        </Button>
        <div className="flex gap-2">
          {step > 0 ? (
            <Button onClick={() => setStep((prev) => prev - 1)} type="button" variant="outline">
              Back
            </Button>
          ) : null}
          <Button disabled={!canContinue} onClick={() => void handleContinue()} type="button">
            {isLast ? "Submit" : "Continue"}
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
