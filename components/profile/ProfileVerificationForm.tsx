"use client";

import { useEffect, useRef, useState } from "react";
import {
  IMAGE_UPLOAD_MAX_SIZE,
  compressImageForUpload,
  validateImageUploadFile,
} from "@/lib/images/compress";

const VERIFICATION_IMAGE_OUTPUT_MAX_SIZE = 4 * 1024 * 1024;
const CAMERA_CAPTURE_MAX_DIMENSION = 1600;

type ProfileVerificationFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  selfieLabel: string;
  openCameraLabel: string;
  takePhotoLabel: string;
  retakePhotoLabel: string;
  requestButtonLabel: string;
  missingSelfieMessage: string;
  invalidTypeMessage: string;
  tooLargeMessage: string;
  uploadFailedMessage: string;
  cameraUnavailableMessage: string;
  cameraPermissionMessage: string;
};

function stopCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function SubmitButton({
  label,
  disabled,
}: {
  label: string;
  disabled: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-[0.7rem] bg-[var(--pa-primary)] px-5 text-sm font-black text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)] disabled:cursor-wait disabled:opacity-70"
    >
      {disabled ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-[#25302d]/25 border-t-[#25302d]"
        />
      ) : null}
      {label}
    </button>
  );
}

export function ProfileVerificationForm({
  action,
  selfieLabel,
  openCameraLabel,
  takePhotoLabel,
  retakePhotoLabel,
  requestButtonLabel,
  missingSelfieMessage,
  invalidTypeMessage,
  tooLargeMessage,
  uploadFailedMessage,
  cameraUnavailableMessage,
  cameraPermissionMessage,
}: ProfileVerificationFormProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraSectionRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const capturedFileRef = useRef<File | null>(null);
  const submittedRef = useRef(false);
  const previewUrlRef = useRef<string | null>(null);
  const scrollToCameraRef = useRef(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const errorId = "verification-selfie-error";

  useEffect(() => {
    if (!cameraOpen || !streamRef.current || !videoRef.current) return;

    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => {
      setError(cameraUnavailableMessage);
    });
  }, [cameraOpen, cameraUnavailableMessage]);

  useEffect(() => {
    if (!cameraOpen || !scrollToCameraRef.current) return;

    scrollToCameraRef.current = false;
    const animationFrame = window.requestAnimationFrame(() => {
      cameraSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [cameraOpen]);

  useEffect(
    () => () => {
      stopCamera(streamRef.current);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  const clearPreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    capturedFileRef.current = null;
  };

  const openCamera = async (scrollToCamera: boolean) => {
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(cameraUnavailableMessage);
      return;
    }

    stopCamera(streamRef.current);
    streamRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 1280 },
        },
      });
      streamRef.current = stream;
      scrollToCameraRef.current = scrollToCamera;
      clearPreview();
      setCameraOpen(true);
    } catch (cameraError) {
      const permissionDenied =
        cameraError instanceof DOMException &&
        (cameraError.name === "NotAllowedError" ||
          cameraError.name === "SecurityError");
      setError(
        permissionDenied ? cameraPermissionMessage : cameraUnavailableMessage,
      );
    }
  };

  const takePhoto = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      setError(cameraUnavailableMessage);
      return;
    }

    const scale = Math.min(
      1,
      CAMERA_CAPTURE_MAX_DIMENSION /
        Math.max(video.videoWidth, video.videoHeight),
    );
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      setError(cameraUnavailableMessage);
      return;
    }

    canvas.width = width;
    canvas.height = height;
    context.translate(width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.9);
    });

    if (!blob) {
      setError(cameraUnavailableMessage);
      return;
    }

    const capturedFile = new File(
      [blob],
      `verification-selfie-${Date.now()}.jpg`,
      { type: "image/jpeg" },
    );
    const nextPreviewUrl = URL.createObjectURL(capturedFile);
    capturedFileRef.current = capturedFile;
    previewUrlRef.current = nextPreviewUrl;
    stopCamera(streamRef.current);
    streamRef.current = null;
    setCameraOpen(false);
    setPreviewUrl(nextPreviewUrl);
    setError(null);
  };

  return (
    <form
      action={action}
      noValidate
      className="grid w-full gap-3 lg:w-[360px] lg:min-w-[360px]"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;

        if (submittedRef.current) return;

        const file = capturedFileRef.current;
        if (!file) {
          setError(missingSelfieMessage);
          return;
        }

        const validationError = validateImageUploadFile(file, {
          maxSizeBytes: IMAGE_UPLOAD_MAX_SIZE,
          messages: {
            type: invalidTypeMessage,
            size: tooLargeMessage,
          },
        });

        if (validationError) {
          setError(validationError);
          return;
        }

        setError(null);
        submittedRef.current = true;
        setIsSubmitting(true);

        let preparedSelfie: File;

        try {
          preparedSelfie = await compressImageForUpload(file, {
            maxDimension: 1400,
            quality: 0.8,
            maxOutputSizeBytes: VERIFICATION_IMAGE_OUTPUT_MAX_SIZE,
            messages: {
              type: invalidTypeMessage,
              size: tooLargeMessage,
              compressedSize: uploadFailedMessage,
            },
          });
        } catch {
          submittedRef.current = false;
          setIsSubmitting(false);
          setError(uploadFailedMessage);
          return;
        }

        const formData = new FormData();
        formData.set("selfie", preparedSelfie);

        form
          .closest<HTMLElement>("#profile-verification")
          ?.scrollIntoView({ behavior: "auto", block: "start" });

        await action(formData);
      }}
    >
      <p className="text-sm font-black text-[#25302d]">{selfieLabel}</p>

      {cameraOpen ? (
        <div ref={cameraSectionRef} className="grid gap-3">
          <div className="overflow-hidden rounded-[1rem] bg-[#172426]">
            <video
              ref={videoRef}
              aria-label={selfieLabel}
              autoPlay
              muted
              playsInline
              className="aspect-[4/3] w-full scale-x-[-1] object-cover"
            />
          </div>
          <button
            type="button"
            onClick={() => void takePhoto()}
            className="inline-flex h-11 items-center justify-center rounded-[0.7rem] bg-[var(--pa-primary)] px-5 text-sm font-black text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)]"
          >
            {takePhotoLabel}
          </button>
        </div>
      ) : previewUrl ? (
        <div className="grid gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={selfieLabel}
            className="aspect-[4/3] w-full rounded-[1rem] bg-[#f0f5f7] object-cover"
          />
          <button
            type="button"
            onClick={() => void openCamera(false)}
            disabled={isSubmitting}
            className="inline-flex h-11 items-center justify-center rounded-[0.7rem] border border-[#b9cbd2] bg-white px-5 text-sm font-black text-[#25302d] transition hover:bg-[#f3f7f8] disabled:opacity-70"
          >
            {retakePhotoLabel}
          </button>
          <SubmitButton
            label={requestButtonLabel}
            disabled={isSubmitting}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void openCamera(true)}
          disabled={isSubmitting}
          className="inline-flex h-11 items-center justify-center rounded-[0.7rem] bg-[var(--pa-primary)] px-5 text-sm font-black text-[var(--pa-primary-ink)] transition hover:bg-[var(--pa-primary-hover)] disabled:opacity-70"
        >
          {openCameraLabel}
        </button>
      )}

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="rounded-2xl border border-[#d95f49]/25 bg-[#fff2ed] px-4 py-3 text-sm font-black text-[#9d3f2f]"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
