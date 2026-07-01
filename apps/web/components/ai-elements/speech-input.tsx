"use client";

import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { playNotificationSound } from "@/lib/notification-sound";
import { MicIcon, SquareIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onresult:
    | ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void)
    | null;
  onerror:
    | ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void)
    | null;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

type SpeechInputMode = "speech-recognition" | "media-recorder" | "none";

export type SpeechInputProps = ComponentProps<typeof Button> & {
  onTranscriptionChange?: (text: string) => void;
  /**
   * Callback for when audio is recorded using MediaRecorder fallback.
   * This is called in browsers that don't support the Web Speech API (Firefox, Safari).
   * The callback receives an audio Blob that should be sent to a transcription service.
   * Return the transcribed text, which will be passed to onTranscriptionChange.
   */
  onAudioRecorded?: (audioBlob: Blob) => Promise<string>;
  lang?: string;
  /**
   * Force a specific mode regardless of browser capabilities.
   * Use "media-recorder" to force MediaRecorder mode (for server-side transcription).
   * Use "speech-recognition" to force Web Speech API mode.
   * Use "none" to disable.
   */
  forceMode?: SpeechInputMode;
  /**
   * Maximum recording duration in seconds. If set, recording will auto-stop after this time.
   * Useful for respecting API limits (e.g., local Whisper servers).
   */
  maxRecordingTime?: number;
};

const detectSpeechInputMode = (): SpeechInputMode => {
  if (typeof window === "undefined") {
    return "none";
  }

  if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
    return "speech-recognition";
  }

  if ("MediaRecorder" in window && "mediaDevices" in navigator) {
    return "media-recorder";
  }

  return "none";
};

export const SpeechInput = ({
  className,
  onTranscriptionChange,
  onAudioRecorded,
  lang = "en-US",
  forceMode,
  maxRecordingTime,
  ...props
}: SpeechInputProps) => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  // Detect once on mount (avoids SSR window access on every render)
  const [detectedMode] = useState<SpeechInputMode>(detectSpeechInputMode);
  // Derive from prop so mode updates when forceMode changes after async settings load
  const mode = forceMode ?? detectedMode;
  const [isRecognitionReady, setIsRecognitionReady] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isRecognitionStartedRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const onTranscriptionChangeRef = useRef<
    SpeechInputProps["onTranscriptionChange"]
  >(onTranscriptionChange);
  const onAudioRecordedRef =
    useRef<SpeechInputProps["onAudioRecorded"]>(onAudioRecorded);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Keep refs in sync
  onTranscriptionChangeRef.current = onTranscriptionChange;
  onAudioRecordedRef.current = onAudioRecorded;

  // Initialize Speech Recognition when mode is speech-recognition
  useEffect(() => {
    if (mode !== "speech-recognition") {
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const speechRecognition = new SpeechRecognition();

    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = lang;

    const handleStart = () => {
      isRecognitionStartedRef.current = true;
      setIsListening(true);
    };

    const handleEnd = () => {
      isRecognitionStartedRef.current = false;
      setIsListening(false);
      playNotificationSound();
    };

    const handleResult = (event: Event) => {
      const speechEvent = event as SpeechRecognitionEvent;
      let finalTranscript = "";

      for (
        let i = speechEvent.resultIndex;
        i < speechEvent.results.length;
        i += 1
      ) {
        const result = speechEvent.results[i];
        if (result.isFinal) {
          finalTranscript += result[0]?.transcript ?? "";
        }
      }

      if (finalTranscript) {
        onTranscriptionChangeRef.current?.(finalTranscript);
      }
    };

    const handleError = () => {
      isRecognitionStartedRef.current = false;
      setIsListening(false);
    };

    speechRecognition.addEventListener("start", handleStart);
    speechRecognition.addEventListener("end", handleEnd);
    speechRecognition.addEventListener("result", handleResult);
    speechRecognition.addEventListener("error", handleError);

    recognitionRef.current = speechRecognition;
    setIsRecognitionReady(true);

    return () => {
      speechRecognition.removeEventListener("start", handleStart);
      speechRecognition.removeEventListener("end", handleEnd);
      speechRecognition.removeEventListener("result", handleResult);
      speechRecognition.removeEventListener("error", handleError);
      if (isRecognitionStartedRef.current) {
        speechRecognition.stop();
      }
      isRecognitionStartedRef.current = false;
      recognitionRef.current = null;
      setIsRecognitionReady(false);
    };
  }, [mode, lang]);

  // Cleanup MediaRecorder and stream on unmount
  useEffect(
    () => () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }
    },
    []
  );

  // Start MediaRecorder recording
  const startMediaRecorder = useCallback(async () => {
    if (!onAudioRecordedRef.current) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      setRecordingTime(0);

      const handleDataAvailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      const handleStop = async () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        for (const track of stream.getTracks()) {
          track.stop();
        }
        streamRef.current = null;

        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });

        if (audioBlob.size > 0 && onAudioRecordedRef.current) {
          setIsProcessing(true);
          try {
            const transcript = await onAudioRecordedRef.current(audioBlob);
            if (transcript) {
              onTranscriptionChangeRef.current?.(transcript);
            }
          } catch {
            // Error handling delegated to the onAudioRecorded caller
          } finally {
            setIsProcessing(false);
          }
        }
      };

      const handleError = () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setIsListening(false);
        for (const track of stream.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      };

      mediaRecorder.addEventListener("dataavailable", handleDataAvailable);
      mediaRecorder.addEventListener("stop", handleStop);
      mediaRecorder.addEventListener("error", handleError);

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsListening(true);

      // Start timer if maxRecordingTime is set
      if (maxRecordingTime && maxRecordingTime > 0) {
        timerRef.current = setInterval(() => {
          setRecordingTime((prev) => {
            const newTime = prev + 1;
            if (newTime >= maxRecordingTime) {
              // Auto-stop when time limit reached
              if (mediaRecorderRef.current?.state === "recording") {
                mediaRecorderRef.current.stop();
              }
              return newTime;
            }
            return newTime;
          });
        }, 1000);
      }
    } catch {
      setIsListening(false);
    }
  }, [maxRecordingTime]);

  // Stop MediaRecorder recording
  const stopMediaRecorder = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current?.state === "recording") {
      playNotificationSound();
      mediaRecorderRef.current.stop();
    }
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (mode === "speech-recognition" && recognitionRef.current) {
      if (isListening || isRecognitionStartedRef.current) {
        recognitionRef.current.stop();
      } else {
        isRecognitionStartedRef.current = true;
        setIsListening(true);

        try {
          recognitionRef.current.start();
        } catch (error) {
          const isAlreadyStartedError =
            error instanceof DOMException && error.name === "InvalidStateError";

          if (!isAlreadyStartedError) {
            isRecognitionStartedRef.current = false;
            setIsListening(false);
          }
        }
      }
    } else if (mode === "media-recorder") {
      if (isListening) {
        stopMediaRecorder();
      } else {
        startMediaRecorder();
      }
    }
  }, [mode, isListening, startMediaRecorder, stopMediaRecorder]);

  // Determine if button should be disabled
  const isDisabled =
    mode === "none" ||
    (mode === "speech-recognition" && !isRecognitionReady) ||
    (mode === "media-recorder" && !onAudioRecorded) ||
    isProcessing;

  return (
    <div className="relative inline-flex items-center justify-center">
      {/* The Mic Button Wrapper */}
      <div className="relative z-10 flex items-center justify-center">
        {/* Animated pulse rings */}
        {isListening &&
          [0, 1, 2].map((index) => (
            <div
              className="absolute inset-0 animate-ping rounded-full border-2 border-destructive/30"
              key={index}
              style={{
                animationDelay: `${index * 0.3}s`,
                animationDuration: "2s",
              }}
            />
          ))}

        {/* Main record button */}
        <Button
          className={cn(
            "relative z-10 rounded-full transition-all duration-300",
            isListening
              ? "bg-destructive text-white hover:bg-destructive/80 hover:text-white"
              : "bg-primary text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground",
            className
          )}
          disabled={isDisabled}
          type="button"
          onClick={toggleListening}
          {...props}
        >
          {isProcessing && <Spinner />}
          {!isProcessing && isListening && <SquareIcon className="size-4" />}
          {!(isProcessing || isListening) && <MicIcon className="size-4" />}
        </Button>
      </div>

      {/* Recording timer tag extending from button */}
      <div
        className={cn(
          "z-0 overflow-hidden transition-all duration-300 ease-in-out",
          isListening && maxRecordingTime ? "max-w-[6rem] opacity-100 -ml-4" : "max-w-0 opacity-0 ml-0"
        )}
      >
        <div className="flex h-8 items-center whitespace-nowrap rounded-r-full border border-l-0 border-destructive/30 bg-destructive/10 pl-6 pr-3 text-xs font-mono font-medium text-destructive">
          {maxRecordingTime && (
            <>
              {Math.floor((maxRecordingTime - recordingTime) / 60)}:
              {((maxRecordingTime - recordingTime) % 60).toString().padStart(2, "0")}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
