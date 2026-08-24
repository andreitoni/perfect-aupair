"use client";

import Image from "next/image";
import { useRef, useState, type PointerEvent } from "react";

type Point = {
  x: number;
  y: number;
};

export type MessageImageZoomTransform = Point & {
  scale: number;
};

type PinchGesture = {
  kind: "pinch";
  distance: number;
  midpoint: Point;
  transform: MessageImageZoomTransform;
};

type PanGesture = {
  kind: "pan";
  pointerId: number;
  point: Point;
  transform: MessageImageZoomTransform;
};

type ActiveGesture = PinchGesture | PanGesture;

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const INITIAL_TRANSFORM: MessageImageZoomTransform = {
  scale: MIN_SCALE,
  x: 0,
  y: 0,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function getDistance(first: Point, second: Point) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function getMidpoint(first: Point, second: Point): Point {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

export function calculateMessageImagePinchTransform({
  container,
  currentMidpoint,
  distanceRatio,
  naturalImage,
  startMidpoint,
  startTransform,
}: {
  container: { height: number; left: number; top: number; width: number };
  currentMidpoint: Point;
  distanceRatio: number;
  naturalImage: { height: number; width: number } | null;
  startMidpoint: Point;
  startTransform: MessageImageZoomTransform;
}): MessageImageZoomTransform {
  const scale = clamp(
    startTransform.scale * distanceRatio,
    MIN_SCALE,
    MAX_SCALE,
  );

  if (scale <= MIN_SCALE) {
    return INITIAL_TRANSFORM;
  }

  const centerX = container.left + container.width / 2;
  const centerY = container.top + container.height / 2;
  const imageCoordinateX =
    (startMidpoint.x - centerX - startTransform.x) /
    startTransform.scale;
  const imageCoordinateY =
    (startMidpoint.y - centerY - startTransform.y) /
    startTransform.scale;
  const nextTransform = {
    scale,
    x: currentMidpoint.x - centerX - imageCoordinateX * scale,
    y: currentMidpoint.y - centerY - imageCoordinateY * scale,
  };

  return clampMessageImageTransform(
    nextTransform,
    container,
    naturalImage,
  );
}

function clampMessageImageTransform(
  transform: MessageImageZoomTransform,
  container: { height: number; width: number },
  naturalImage: { height: number; width: number } | null,
): MessageImageZoomTransform {
  if (transform.scale <= MIN_SCALE) {
    return INITIAL_TRANSFORM;
  }

  const imageWidth = naturalImage?.width ?? container.width;
  const imageHeight = naturalImage?.height ?? container.height;
  const containRatio = Math.min(
    container.width / imageWidth,
    container.height / imageHeight,
  );
  const displayedWidth = imageWidth * containRatio;
  const displayedHeight = imageHeight * containRatio;
  const maximumX = Math.max(
    0,
    (displayedWidth * transform.scale - container.width) / 2,
  );
  const maximumY = Math.max(
    0,
    (displayedHeight * transform.scale - container.height) / 2,
  );

  return {
    scale: transform.scale,
    x: clamp(transform.x, -maximumX, maximumX),
    y: clamp(transform.y, -maximumY, maximumY),
  };
}

export function ZoomableMessageImage({
  src,
  sizes,
  onError,
}: {
  src: string;
  sizes: string;
  onError: () => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<ActiveGesture | null>(null);
  const naturalImageRef = useRef<{ height: number; width: number } | null>(null);
  const transformRef = useRef(INITIAL_TRANSFORM);
  const [transform, setTransform] = useState(INITIAL_TRANSFORM);

  const commitTransform = (nextTransform: MessageImageZoomTransform) => {
    const surface = surfaceRef.current;

    if (!surface) return;

    const bounds = surface.getBoundingClientRect();
    const clampedTransform = clampMessageImageTransform(
      nextTransform,
      bounds,
      naturalImageRef.current,
    );

    transformRef.current = clampedTransform;
    setTransform(clampedTransform);
  };

  const beginGesture = () => {
    const pointers = [...pointersRef.current.entries()];

    if (pointers.length >= 2) {
      const first = pointers[0]?.[1];
      const second = pointers[1]?.[1];

      if (!first || !second) return;

      gestureRef.current = {
        kind: "pinch",
        distance: Math.max(getDistance(first, second), 1),
        midpoint: getMidpoint(first, second),
        transform: transformRef.current,
      };
      return;
    }

    const firstPointer = pointers[0];

    if (firstPointer && transformRef.current.scale > MIN_SCALE) {
      gestureRef.current = {
        kind: "pan",
        pointerId: firstPointer[0],
        point: firstPointer[1],
        transform: transformRef.current,
      };
    } else {
      gestureRef.current = null;
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events and older WebKit builds may not expose capture.
    }

    beginGesture();
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;

    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    const pointers = [...pointersRef.current.values()];

    if (pointers.length >= 2) {
      event.preventDefault();

      if (gestureRef.current?.kind !== "pinch") {
        beginGesture();
      }

      const gesture = gestureRef.current;
      const first = pointers[0];
      const second = pointers[1];
      const surface = surfaceRef.current;

      if (!surface || gesture?.kind !== "pinch" || !first || !second) return;

      const bounds = surface.getBoundingClientRect();
      commitTransform(
        calculateMessageImagePinchTransform({
          container: bounds,
          currentMidpoint: getMidpoint(first, second),
          distanceRatio: getDistance(first, second) / gesture.distance,
          naturalImage: naturalImageRef.current,
          startMidpoint: gesture.midpoint,
          startTransform: gesture.transform,
        }),
      );
      return;
    }

    const gesture = gestureRef.current;

    if (
      gesture?.kind !== "pan" ||
      gesture.pointerId !== event.pointerId ||
      transformRef.current.scale <= MIN_SCALE
    ) {
      return;
    }

    event.preventDefault();
    commitTransform({
      scale: gesture.transform.scale,
      x: gesture.transform.x + event.clientX - gesture.point.x,
      y: gesture.transform.y + event.clientY - gesture.point.y,
    });
  };

  const finishPointer = (event: PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already have been released by the browser.
    }

    beginGesture();
  };

  return (
    <div
      ref={surfaceRef}
      data-message-image-zoom-surface="true"
      data-message-image-zoom-scale={transform.scale.toFixed(3)}
      className="relative h-full w-full touch-none overflow-hidden rounded-[1.25rem] select-none"
      onDoubleClick={() => {
        commitTransform(
          transformRef.current.scale > MIN_SCALE
            ? INITIAL_TRANSFORM
            : { scale: 2, x: 0, y: 0 },
        );
      }}
      onPointerCancel={finishPointer}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
    >
      <div
        data-message-image-zoom-layer="true"
        className="absolute inset-0 will-change-transform"
        style={{
          transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
          transformOrigin: "center",
        }}
      >
        <Image
          src={src}
          alt=""
          fill
          sizes={sizes}
          unoptimized
          draggable={false}
          className="pa-protected-media object-contain"
          onLoad={(event) => {
            naturalImageRef.current = {
              height: event.currentTarget.naturalHeight,
              width: event.currentTarget.naturalWidth,
            };
          }}
          onError={onError}
        />
      </div>
    </div>
  );
}
