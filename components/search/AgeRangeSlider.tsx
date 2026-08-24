"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "@/components/i18n/I18nProvider";

const MIN_AGE = 18;
const MAX_AGE = 30;

function normalizeAge(value: string | undefined, fallback: number) {
  if (!value) return fallback;

  const age = Number(value);

  if (!Number.isFinite(age)) return fallback;

  return Math.min(MAX_AGE, Math.max(MIN_AGE, age));
}

function getPercent(value: number) {
  return ((value - MIN_AGE) / (MAX_AGE - MIN_AGE)) * 100;
}

type AgeRangeSliderProps = {
  initialMin?: string;
  initialMax?: string;
  onRangeChange?: (range: { min: number; max: number }) => void;
};

export function AgeRangeSlider({
  initialMin,
  initialMax,
  onRangeChange,
}: AgeRangeSliderProps) {
  const t = useTranslations();
  const id = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingThumbRef = useRef<"min" | "max" | null>(null);
  const [minAge, setMinAge] = useState(() =>
    normalizeAge(initialMin, MIN_AGE),
  );
  const [maxAge, setMaxAge] = useState(() =>
    normalizeAge(initialMax, MAX_AGE),
  );
  const [hasChanged, setHasChanged] = useState(false);
  const minAgeRef = useRef(minAge);
  const maxAgeRef = useRef(maxAge);
  const shouldSubmitValues = Boolean(initialMin || initialMax || hasChanged);
  const minPercent = getPercent(minAge);
  const maxPercent = getPercent(maxAge);

  const updateMinAge = useCallback((value: number) => {
    const nextMin = Math.min(MAX_AGE, Math.max(MIN_AGE, value));
    const boundedMin = Math.min(nextMin, maxAgeRef.current);

    minAgeRef.current = boundedMin;
    setHasChanged(true);
    setMinAge(boundedMin);
    onRangeChange?.({ min: boundedMin, max: maxAgeRef.current });
  }, [onRangeChange]);

  const updateMaxAge = useCallback((value: number) => {
    const nextMax = Math.min(MAX_AGE, Math.max(MIN_AGE, value));
    const boundedMax = Math.max(nextMax, minAgeRef.current);

    maxAgeRef.current = boundedMax;
    setHasChanged(true);
    setMaxAge(boundedMax);
    onRangeChange?.({ min: minAgeRef.current, max: boundedMax });
  }, [onRangeChange]);

  const getAgeFromPointer = useCallback((clientX: number) => {
    const track = trackRef.current;

    if (!track) return MIN_AGE;

    const rect = track.getBoundingClientRect();
    const percent = Math.min(
      1,
      Math.max(0, (clientX - rect.left) / rect.width),
    );

    return Math.round(MIN_AGE + percent * (MAX_AGE - MIN_AGE));
  }, []);

  const updateDraggingThumb = useCallback((clientX: number) => {
    const nextAge = getAgeFromPointer(clientX);
    const draggingThumb = draggingThumbRef.current;

    if (draggingThumb === "min") {
      updateMinAge(nextAge);
    }

    if (draggingThumb === "max") {
      updateMaxAge(nextAge);
    }
  }, [getAgeFromPointer, updateMaxAge, updateMinAge]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (!draggingThumbRef.current) return;

      event.preventDefault();
      updateDraggingThumb(event.clientX);
    }

    function handlePointerUp() {
      draggingThumbRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [updateDraggingThumb]);

  function handleTrackPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const nextAge = getAgeFromPointer(event.clientX);
    const targetThumb =
      Math.abs(nextAge - minAge) <= Math.abs(nextAge - maxAge) ? "min" : "max";

    draggingThumbRef.current = targetThumb;

    if (targetThumb === "min") {
      updateMinAge(nextAge);
    } else {
      updateMaxAge(nextAge);
    }
  }

  return (
    <div>
      {shouldSubmitValues ? (
        <>
          <input type="hidden" name="ageMin" value={minAge} />
          <input type="hidden" name="ageMax" value={maxAge} />
        </>
      ) : null}

      <div className="mb-2 flex items-center justify-between text-sm font-black text-[#25302d]/70">
        <span>{minAge}</span>
        <span>{maxAge}</span>
      </div>

      <div
        className="relative h-8 touch-none px-3"
        onPointerDown={handleTrackPointerDown}
      >
        <div ref={trackRef} className="relative h-full">
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--pa-primary)]/18" />
          <div
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--pa-primary)]/75"
            style={{
              left: `${minPercent}%`,
              right: `${100 - maxPercent}%`,
            }}
          />

          <span id={`${id}-min-label`} className="sr-only">
            {t("common.min")} {t("common.age")}
          </span>
          <button
            type="button"
            role="slider"
            aria-labelledby={`${id}-min-label`}
            aria-valuemin={MIN_AGE}
            aria-valuemax={MAX_AGE}
            aria-valuenow={minAge}
            className="absolute top-1/2 z-20 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#9aa5a1] bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#6f8793]"
            style={{ left: `${minPercent}%` }}
            onPointerDown={(event) => {
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              draggingThumbRef.current = "min";
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
                event.preventDefault();
                updateMinAge(minAge - 1);
              }

              if (event.key === "ArrowRight" || event.key === "ArrowUp") {
                event.preventDefault();
                updateMinAge(minAge + 1);
              }
            }}
          />

          <span id={`${id}-max-label`} className="sr-only">
            {t("common.max")} {t("common.age")}
          </span>
          <button
            type="button"
            role="slider"
            aria-labelledby={`${id}-max-label`}
            aria-valuemin={MIN_AGE}
            aria-valuemax={MAX_AGE}
            aria-valuenow={maxAge}
            className="absolute top-1/2 z-20 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#9aa5a1] bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#6f8793]"
            style={{ left: `${maxPercent}%` }}
            onPointerDown={(event) => {
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              draggingThumbRef.current = "max";
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
                event.preventDefault();
                updateMaxAge(maxAge - 1);
              }

              if (event.key === "ArrowRight" || event.key === "ArrowUp") {
                event.preventDefault();
                updateMaxAge(maxAge + 1);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
