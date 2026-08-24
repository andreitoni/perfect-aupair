import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  expect,
  test,
  type FilePayload,
  type Locator,
  type Page,
} from "@playwright/test";
import { detectValidImageMimeType } from "../../lib/images/validate-image-bytes";
import { shouldCompressMessageVideo } from "../../lib/videos/message-video-compression";
import {
  MESSAGE_VIDEO_COMPRESSION_THRESHOLD_SIZE,
  MESSAGE_VIDEO_STORAGE_MAX_SIZE,
} from "../../lib/videos/upload";
import {
  COOKIE_CONSENT_COOKIE_NAME,
  COOKIE_CONSENT_STORAGE_KEY,
} from "../../lib/analytics/consent";

type LocalEnv = Record<string, string>;

type TestUser = {
  email: string;
  id: string;
};

test.beforeEach(async ({ context, page, baseURL }) => {
  await context.addCookies([
    {
      name: COOKIE_CONSENT_COOKIE_NAME,
      value: "necessary",
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
  await page.addInitScript(
    ([storageKey]) => window.localStorage.setItem(storageKey, "necessary"),
    [COOKIE_CONSENT_STORAGE_KEY],
  );
});

function readLocalEnv(): LocalEnv {
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    const env: LocalEnv = {};

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const [key, ...valueParts] = trimmed.split("=");
      env[key] = cleanEnvValue(valueParts.join("="));
    }

    return env;
  } catch {
    return {};
  }
}

function cleanEnvValue(value?: string) {
  const trimmed = (value ?? "").trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function normalizeStatusKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isJwtLike(value?: string) {
  const cleaned = cleanEnvValue(value);

  return cleaned.startsWith("eyJ") && cleaned.split(".").length === 3;
}

function readStatusValue(output: string, wantedKeys: string[]) {
  const wanted = new Set(wantedKeys.map(normalizeStatusKey));

  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim().replace(/^export\s+/, "");

    if (!line) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    const colonIndex = line.indexOf(":");
    const separatorIndex =
      equalsIndex >= 0 && colonIndex >= 0
        ? Math.min(equalsIndex, colonIndex)
        : Math.max(equalsIndex, colonIndex);

    if (separatorIndex < 0) {
      continue;
    }

    const key = normalizeStatusKey(line.slice(0, separatorIndex));
    const value = cleanEnvValue(line.slice(separatorIndex + 1));

    if (wanted.has(key)) {
      return value;
    }
  }

  return "";
}

function getSupabaseCredentials() {
  const localEnv = readLocalEnv();

  let url = cleanEnvValue(
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
      process.env.SUPABASE_URL ??
      localEnv.NEXT_PUBLIC_SUPABASE_URL ??
      localEnv.SUPABASE_URL,
  );

  let serviceRoleKey = cleanEnvValue(
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SERVICE_ROLE_KEY ??
      localEnv.SUPABASE_SERVICE_ROLE_KEY ??
      localEnv.SERVICE_ROLE_KEY,
  );

  if (serviceRoleKey && !isJwtLike(serviceRoleKey)) {
    serviceRoleKey = "";
  }

  for (const command of ["supabase status -o env", "supabase status"]) {
    if (url && serviceRoleKey) {
      break;
    }

    try {
      const output = execSync(command, {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });

      url ||= readStatusValue(output, ["API_URL", "SUPABASE_URL", "Project URL"]);

      const statusServiceRoleKey = readStatusValue(output, [
        "SERVICE_ROLE_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "service_role key",
        "service role key",
      ]);

      if (!serviceRoleKey && isJwtLike(statusServiceRoleKey)) {
        serviceRoleKey = statusServiceRoleKey;
      }
    } catch {
      // Try the next status format.
    }
  }

  if (!url || !serviceRoleKey || !isJwtLike(serviceRoleKey)) {
    throw new Error(
      "Could not find local Supabase credentials. Start Supabase locally or add SUPABASE_SERVICE_ROLE_KEY to .env.local.",
    );
  }

  return { url, serviceRoleKey };
}

async function expectNoNextErrorPage(page: Page) {
  await expect(page.locator("body")).not.toContainText("Runtime Error");
  await expect(page.locator("body")).not.toContainText("Build Error");
  await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
  await expect(page.locator("body")).not.toContainText("Application error");
}

async function expectVisibleVideoFrame(video: Locator) {
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => {
        if (
          element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
          element.videoHeight <= 0 ||
          element.videoWidth <= 0
        ) {
          return false;
        }

        const canvas = document.createElement("canvas");
        canvas.width = 24;
        canvas.height = 24;
        const context = canvas.getContext("2d", { willReadFrequently: true });

        if (!context) {
          return false;
        }

        try {
          context.drawImage(element, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          ).data;

          for (let index = 0; index < pixels.length; index += 4) {
            if (
              pixels[index] > 18 ||
              pixels[index + 1] > 18 ||
              pixels[index + 2] > 18
            ) {
              return true;
            }
          }
        } catch {
          return false;
        }

        return false;
      }),
    )
    .toBe(true);
}

async function chooseMessageMediaFile(
  page: Page,
  file: string | FilePayload,
) {
  const attachButton = page.getByRole("button", { name: "Attach media" });
  const pickerButton = page.getByRole("button", { name: "Photos & videos" });

  if (!(await pickerButton.isVisible())) {
    await expect(attachButton).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(500);
    await attachButton.click();
  }

  await expect(pickerButton).toBeVisible();

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 15_000 }),
    pickerButton.click(),
  ]);
  await expect(
    page.locator('[data-attachment-preview-state="awaiting-file"]'),
  ).toHaveCount(0);
  await expect(page.locator('[data-photo-preview-card="true"]')).toHaveCount(0);
  await chooser.setFiles(file);
}

async function delayNextCanvasEncode(page: Page) {
  await page.evaluate(() => {
    type TestWindow = Window &
      typeof globalThis & {
        __paImageEncodeWaiting?: boolean;
        __paReleaseImageEncode?: () => void;
      };

    const testWindow = window as TestWindow;
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    let releaseEncode: () => void = () => undefined;
    const encodeGate = new Promise<void>((resolve) => {
      releaseEncode = resolve;
    });
    let delayed = false;

    HTMLCanvasElement.prototype.toBlob = function delayedToBlob(
      callback,
      type,
      quality,
    ) {
      if (delayed) {
        originalToBlob.call(this, callback, type, quality);
        return;
      }

      delayed = true;
      testWindow.__paImageEncodeWaiting = true;

      void encodeGate.then(() => {
        HTMLCanvasElement.prototype.toBlob = originalToBlob;
        testWindow.__paImageEncodeWaiting = false;
        originalToBlob.call(this, callback, type, quality);
      });
    };

    testWindow.__paReleaseImageEncode = () => {
      releaseEncode();
      delete testWindow.__paReleaseImageEncode;
    };
  });
}

async function releaseDelayedCanvasEncode(page: Page) {
  await page.evaluate(() => {
    const testWindow = window as Window &
      typeof globalThis & {
        __paReleaseImageEncode?: () => void;
      };

    testWindow.__paReleaseImageEncode?.();
  });
}

async function createCompressibleVideo(page: Page, outputPath: string) {
  const generatedVideo = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;

    const context = canvas.getContext("2d");

    if (!context || typeof MediaRecorder === "undefined") {
      throw new Error("This browser cannot generate the video test fixture.");
    }

    const captureStream = canvas.captureStream?.(30);

    if (!captureStream) {
      throw new Error("Canvas capture is unavailable for the video test fixture.");
    }

    const mimeType = [
      "video/mp4;codecs=avc1.42001e",
      "video/mp4",
      "video/webm;codecs=vp8",
      "video/webm",
    ].find((candidate) => MediaRecorder.isTypeSupported(candidate));

    if (!mimeType) {
      throw new Error("No supported recording format for the video test fixture.");
    }

    const recorder = new MediaRecorder(captureStream, {
      mimeType,
      videoBitsPerSecond: 24_000_000,
    });
    const chunks: Blob[] = [];
    let seed = 0x12345678;

    function random() {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    }

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    });

    const stopped = new Promise<void>((resolve, reject) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
      recorder.addEventListener(
        "error",
        () => reject(new Error("Could not generate the video test fixture.")),
        { once: true },
      );
    });

    recorder.start(250);
    const startedAt = performance.now();
    let frame = 0;

    while (performance.now() - startedAt < 4_000) {
      context.fillStyle = `hsl(${(frame * 13) % 360} 70% 48%)`;
      context.fillRect(0, 0, canvas.width, canvas.height);

      for (let index = 0; index < 900; index += 1) {
        const red = Math.floor(random() * 256);
        const green = Math.floor(random() * 256);
        const blue = Math.floor(random() * 256);
        context.fillStyle = `rgb(${red} ${green} ${blue})`;
        context.fillRect(
          Math.floor(random() * canvas.width),
          Math.floor(random() * canvas.height),
          8 + Math.floor(random() * 42),
          8 + Math.floor(random() * 42),
        );
      }

      context.fillStyle = "white";
      context.font = "700 72px sans-serif";
      context.fillText(`Perfect AuPair ${frame}`, 50, 100);
      frame += 1;

      await new Promise((resolve) => window.setTimeout(resolve, 33));
    }

    recorder.stop();
    captureStream.getTracks().forEach((track) => track.stop());
    await stopped;

    const blob = new Blob(chunks, { type: recorder.mimeType });
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result)), {
        once: true,
      });
      reader.addEventListener(
        "error",
        () => reject(new Error("Could not serialize the video test fixture.")),
        { once: true },
      );
      reader.readAsDataURL(blob);
    });
    const normalizedMimeType = recorder.mimeType.split(";")[0] || "video/mp4";

    return {
      base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
      mimeType: normalizedMimeType,
      name: normalizedMimeType === "video/mp4" ? "chat-video.mp4" : "chat-video.webm",
      size: blob.size,
    };
  });

  if (generatedVideo.size < 3 * 1024 * 1024) {
    throw new Error(
      `Generated video fixture is too small to test compression (${generatedVideo.size} bytes).`,
    );
  }

  const sourceBuffer = Buffer.from(generatedVideo.base64, "base64");
  let fixtureBuffer = sourceBuffer;
  let fixturePath = outputPath;
  let resumableFixturePath: string | null = null;
  let resumableFixtureByteLength = 0;
  let shouldCompress = false;

  if (generatedVideo.mimeType === "video/mp4") {
    const resumableTargetSize = 7 * 1024 * 1024 + 1024;
    const resumableFreeBoxSize = resumableTargetSize - sourceBuffer.byteLength;
    let resumableBuffer = sourceBuffer;

    if (resumableFreeBoxSize >= 8) {
      const resumableFreeBox = Buffer.alloc(resumableFreeBoxSize);
      resumableFreeBox.writeUInt32BE(resumableFreeBoxSize, 0);
      resumableFreeBox.write("free", 4, 4, "ascii");
      resumableBuffer = Buffer.concat([sourceBuffer, resumableFreeBox]);
    }

    resumableFixturePath = outputPath.replace(
      /\.mp4$/i,
      "-resumable.mp4",
    );
    resumableFixtureByteLength = resumableBuffer.byteLength;
    mkdirSync(dirname(resumableFixturePath), { recursive: true });
    writeFileSync(resumableFixturePath, resumableBuffer);

    const requiredCompressionSize = 50 * 1024 * 1024 + 1024;
    const freeBoxSize = requiredCompressionSize - sourceBuffer.byteLength;

    if (freeBoxSize < 8) {
      throw new Error(
        `Generated video fixture is unexpectedly large (${sourceBuffer.byteLength} bytes).`,
      );
    }

    // A trailing ISO BMFF `free` box keeps the MP4 valid while making the fixture
    // large enough to exercise the storage-limit compression path.
    const freeBox = Buffer.alloc(freeBoxSize);
    freeBox.writeUInt32BE(freeBoxSize, 0);
    freeBox.write("free", 4, 4, "ascii");
    fixtureBuffer = Buffer.concat([sourceBuffer, freeBox]);
    shouldCompress = true;
  } else if (generatedVideo.mimeType === "video/webm") {
    fixturePath = outputPath.replace(/\.mp4$/i, ".webm");
  } else {
    throw new Error(`Unsupported generated video type: ${generatedVideo.mimeType}.`);
  }

  mkdirSync(dirname(fixturePath), { recursive: true });
  writeFileSync(fixturePath, fixtureBuffer);

  return {
    path: fixturePath,
    byteLength: fixtureBuffer.byteLength,
    mimeType: generatedVideo.mimeType,
    resumablePath: resumableFixturePath,
    resumableByteLength: resumableFixtureByteLength,
    shouldCompress,
  };
}

async function createVideoWithAudio(page: Page, outputPath: string) {
  const generatedVideo = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext("2d");
    const videoStream = canvas.captureStream?.(15);

    if (!context || !videoStream || typeof MediaRecorder === "undefined") {
      throw new Error("This browser cannot generate the audio video fixture.");
    }

    const mimeType = ["video/webm;codecs=vp8,opus", "video/webm"].find(
      (candidate) => MediaRecorder.isTypeSupported(candidate),
    );

    if (!mimeType) {
      throw new Error("This browser cannot record a WebM video with audio.");
    }

    const audioContext = new AudioContext();
    const audioDestination = audioContext.createMediaStreamDestination();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    gain.gain.value = 0.08;
    oscillator.frequency.value = 440;
    oscillator.connect(gain);
    gain.connect(audioDestination);

    const recordingStream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...audioDestination.stream.getAudioTracks(),
    ]);
    const recorder = new MediaRecorder(recordingStream, {
      mimeType,
      videoBitsPerSecond: 1_000_000,
      audioBitsPerSecond: 96_000,
    });
    const chunks: Blob[] = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
      recorder.addEventListener("error", () => reject(new Error("Audio video recording failed.")), {
        once: true,
      });
    });

    context.fillStyle = "#172426";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "white";
    context.font = "700 42px sans-serif";
    context.fillText("Perfect AuPair audio", 40, 80);
    oscillator.start();
    recorder.start();
    await new Promise((resolve) => window.setTimeout(resolve, 1_200));
    context.fillStyle = "#1f6f8b";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    recorder.stop();
    oscillator.stop();
    recordingStream.getTracks().forEach((track) => track.stop());
    await stopped;
    await audioContext.close();

    const blob = new Blob(chunks, { type: "video/webm" });
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result)), { once: true });
      reader.addEventListener("error", () => reject(new Error("Audio video serialization failed.")), {
        once: true,
      });
      reader.readAsDataURL(blob);
    });

    return dataUrl.slice(dataUrl.indexOf(",") + 1);
  });

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, Buffer.from(generatedVideo, "base64"));
  return outputPath;
}

async function createLargeProfilePhoto(page: Page): Promise<FilePayload> {
  const generatedPhoto = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 2400;
    canvas.height = 1600;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not create the large image fixture.");
    }

    const gradient = context.createLinearGradient(0, 0, 2400, 1600);
    gradient.addColorStop(0, "#1f6f8b");
    gradient.addColorStop(0.5, "#f2b58f");
    gradient.addColorStop(1, "#172426");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 2400, 1600);

    let seed = 20260713;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    for (let index = 0; index < 900; index += 1) {
      context.fillStyle = `rgba(${Math.floor(random() * 255)}, ${Math.floor(
        random() * 255,
      )}, ${Math.floor(random() * 255)}, 0.32)`;
      context.fillRect(
        Math.floor(random() * 2400),
        Math.floor(random() * 1600),
        12 + Math.floor(random() * 120),
        12 + Math.floor(random() * 120),
      );
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new Error("Could not encode the large image fixture.")),
        "image/jpeg",
        0.86,
      );
    });
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result)), {
        once: true,
      });
      reader.addEventListener(
        "error",
        () => reject(new Error("Could not serialize the image fixture.")),
        { once: true },
      );
      reader.readAsDataURL(blob);
    });

    return {
      base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
    };
  });

  const encodedPhoto = Buffer.from(generatedPhoto.base64, "base64");

  return {
    name: "large-profile-photo.jpg",
    mimeType: "image/jpeg",
    buffer: encodedPhoto,
  };
}

async function createAuthUser(
  admin: ReturnType<typeof createClient>,
  email: string,
  password: string,
  accountType: "au_pair" | "family",
): Promise<TestUser> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      account_type: accountType,
    },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? `Could not create ${accountType} test user.`);
  }

  return {
    email,
    id: data.user.id,
  };
}

test("verification retry removes the oldest rejected selfie at the live limit", async ({
  page,
}) => {
  test.setTimeout(90_000);

  const { url, serviceRoleKey } = getSupabaseCredentials();
  const admin = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const fixturePath = join(process.cwd(), "tests/fixtures/profile-photo.png");
  const fixture = readFileSync(fixturePath);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = "TestPassword123!";
  let user: TestUser | null = null;
  const profilePhotoPath = `verification-retry-${suffix}.png`;

  try {
    user = await createAuthUser(
      admin,
      `verification-retry-${suffix}@example.com`,
      password,
      "au_pair",
    );

    const { error: profileError } = await admin.from("profiles").upsert({
      id: user.id,
      email: user.email,
      account_type: "au_pair",
      onboarding_completed: true,
      content_moderation_status: "approved",
      verification_status: "rejected",
      first_name: "Retry",
      last_name: "Verification",
      full_name: "Retry Verification",
      gender: "female",
      birth_date: "2000-01-01",
      date_of_birth: "2000-01-01",
      country: "Germany",
      city: "Berlin",
      nationality: "Romanian",
      preferred_host_countries: ["Germany"],
      mother_tongue: "Romanian",
      fluent_languages: ["English"],
      basic_languages: ["German"],
      availability_start: "2026-07-01",
      availability_start_from: "2026-07-01",
      availability_start_to: "2026-08-01",
      duration: "6 months",
      duration_min_months: 6,
      duration_max_months: 12,
      bio: "Verification retry regression profile.",
    });

    if (profileError) throw new Error(profileError.message);

    const fullProfilePhotoPath = `${user.id}/${profilePhotoPath}`;
    const { error: profilePhotoUploadError } = await admin.storage
      .from("profile-photos")
      .upload(fullProfilePhotoPath, fixture, { contentType: "image/png" });

    if (profilePhotoUploadError) {
      throw new Error(profilePhotoUploadError.message);
    }

    const { error: profilePhotoError } = await admin
      .from("profile_photos")
      .insert({
        profile_id: user.id,
        storage_path: fullProfilePhotoPath,
        is_primary: true,
      });

    if (profilePhotoError) throw new Error(profilePhotoError.message);

    for (let index = 0; index < 5; index += 1) {
      const selfiePath = `${user.id}/rejected-${suffix}-${index}.png`;
      const createdAt = new Date(Date.now() - index * 60_000).toISOString();
      const { error: selfieUploadError } = await admin.storage
        .from("verification-selfies")
        .upload(selfiePath, fixture, { contentType: "image/png" });

      if (selfieUploadError) throw new Error(selfieUploadError.message);

      const { error: usageError } = await admin
        .from("storage_upload_usage_events")
        .insert({
          uploader_id: user.id,
          bucket_id: "verification-selfies",
          object_name: selfiePath,
          size_bytes: fixture.byteLength,
          created_at: createdAt,
          committed_at: createdAt,
        });

      if (usageError) throw new Error(usageError.message);

      const { error: requestError } = await admin
        .from("profile_verification_requests")
        .insert({
          profile_id: user.id,
          selfie_path: selfiePath,
          status: "rejected",
          reviewer_note: "Take another selfie.",
          created_at: createdAt,
          reviewed_at: createdAt,
        });

      if (requestError) throw new Error(requestError.message);
    }

    await page.addInitScript(() => {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async () => ({
            getTracks: () => [{ stop: () => undefined }],
          }),
        },
      });
      Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
        configurable: true,
        get: () => null,
        set: () => undefined,
      });
      Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
        configurable: true,
        get: () => 800,
      });
      Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
        configurable: true,
        get: () => 600,
      });
      HTMLMediaElement.prototype.play = async () => undefined;
      CanvasRenderingContext2D.prototype.drawImage = function drawImage() {
        this.fillStyle = "#dce8ec";
        this.fillRect(0, 0, this.canvas.width, this.canvas.height);
      };
    });

    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/email/i).fill(user.email);
    await page.getByLabel(/password/i).fill(password);
    await page.locator("form").getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(/\/search-family/, { timeout: 15_000 });
    await page.goto("/account#profile-verification");
    await page.getByRole("button", { name: "Open camera" }).click();
    await page.getByRole("button", { name: "Take photo" }).click();
    await page.getByRole("button", { name: "Request verification" }).click();
    await page.waitForURL(/verification=sent/, { timeout: 15_000 });
    await expectNoNextErrorPage(page);
    await expect(page.getByText("The selfie could not be uploaded.")).toHaveCount(
      0,
    );

    const { data: requests, error: requestsError } = await admin
      .from("profile_verification_requests")
      .select("status")
      .eq("profile_id", user.id);

    if (requestsError) throw new Error(requestsError.message);

    expect(requests?.filter((request) => request.status === "rejected")).toHaveLength(
      4,
    );
    expect(requests?.filter((request) => request.status === "pending")).toHaveLength(
      1,
    );
  } finally {
    if (user) {
      const { data: verificationRequests } = await admin
        .from("profile_verification_requests")
        .select("selfie_path")
        .eq("profile_id", user.id);
      const selfiePaths =
        verificationRequests?.map((request) => request.selfie_path) ?? [];

      await admin
        .from("profile_verification_requests")
        .delete()
        .eq("profile_id", user.id);
      await admin.from("profile_photos").delete().eq("profile_id", user.id);

      if (selfiePaths.length > 0) {
        await admin.storage.from("verification-selfies").remove(selfiePaths);
      }

      await admin.storage
        .from("profile-photos")
        .remove([`${user.id}/${profilePhotoPath}`]);
      await admin.auth.admin.deleteUser(user.id);
    }
  }
});

test("profile photo fixture has valid PNG checksums", () => {
  const fixturePath = join(process.cwd(), "tests/fixtures/profile-photo.png");
  const validBytes = new Uint8Array(readFileSync(fixturePath));

  expect(detectValidImageMimeType(validBytes)).toBe("image/png");

  const corruptedBytes = validBytes.slice();
  const idatOffset = Buffer.from(corruptedBytes).indexOf(Buffer.from("IDAT"));

  expect(idatOffset).toBeGreaterThan(0);
  corruptedBytes[idatOffset + 4] ^= 1;
  expect(detectValidImageMimeType(corruptedBytes)).toBeNull();
});

test("a message video can fall back to its original below 100 MB", () => {
  const reportedVideoSize = Math.round(55.4 * 1024 * 1024);
  const reportedVideo = { size: reportedVideoSize } as File;

  expect(reportedVideoSize).toBeGreaterThan(
    MESSAGE_VIDEO_COMPRESSION_THRESHOLD_SIZE,
  );
  expect(shouldCompressMessageVideo(reportedVideo)).toBe(true);
  expect(reportedVideoSize).toBeLessThanOrEqual(
    MESSAGE_VIDEO_STORAGE_MAX_SIZE,
  );
});

test("orphan media endpoint rejects malformed and unauthenticated requests", async ({
  request,
}) => {
  const validBody = {
    bucket: "profile-photos",
    path: "00000000-0000-0000-0000-000000000000/test.webp",
  };
  const unauthenticated = await request.delete("/api/media/orphan", {
    data: validBody,
  });
  const crossOrigin = await request.delete("/api/media/orphan", {
    data: validBody,
    headers: { origin: "https://attacker.example" },
  });
  const invalidPath = await request.delete("/api/media/orphan", {
    data: { bucket: "profile-photos", path: "not-a-valid-path" },
  });
  const nullBody = await request.delete("/api/media/orphan", {
    data: "null",
    headers: { "content-type": "application/json" },
  });
  const oversizedBody = await request.delete("/api/media/orphan", {
    data: JSON.stringify({ ...validBody, padding: "x".repeat(2_100) }),
    headers: { "content-type": "application/json" },
  });
  const privateMediaHead = await request.head(
    "/api/media/private/message-videos/00000000-0000-4000-8000-000000000000/test.mp4",
    { maxRedirects: 0 },
  );

  expect(unauthenticated.status()).toBe(401);
  expect(crossOrigin.status()).toBe(400);
  expect(invalidPath.status()).toBe(404);
  expect(nullBody.status()).toBe(400);
  expect(oversizedBody.status()).toBe(400);
  expect(privateMediaHead.status()).toBe(405);
  expect(privateMediaHead.headers().allow).toBe("GET");
});

test("profile, story, and concurrent message media uploads keep working", async (
  { page },
  testInfo,
) => {
  test.setTimeout(360_000);

  const expectedIphoneBrowserToken =
    testInfo.project.name === "iphone-chrome-emulation"
      ? "CriOS/"
      : testInfo.project.name === "iphone-firefox-emulation"
        ? "FxiOS/"
        : null;

  if (expectedIphoneBrowserToken) {
    await expect
      .poll(() => page.evaluate(() => navigator.userAgent))
      .toContain(expectedIphoneBrowserToken);
  }

  const { url, serviceRoleKey } = getSupabaseCredentials();
  const admin = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const fixturePath = join(process.cwd(), "tests/fixtures/profile-photo.png");
  const fixture = readFileSync(fixturePath);
  const storyFixture: FilePayload = {
    name: "story-photo-over-5mb.png",
    mimeType: "image/png",
    buffer: Buffer.concat([
      fixture,
      Buffer.alloc(6 * 1024 * 1024 - fixture.length),
    ]),
  };
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = "TestPassword123!";

  let auPair: TestUser | null = null;
  let family: TestUser | null = null;
  let conversationId = "";

  try {
    auPair = await createAuthUser(
      admin,
      `upload-aupair-${suffix}@example.com`,
      password,
      "au_pair",
    );
    family = await createAuthUser(
      admin,
      `upload-family-${suffix}@example.com`,
      password,
      "family",
    );

    const { error: auPairProfileError } = await admin.from("profiles").upsert({
      id: auPair.id,
      email: auPair.email,
      account_type: "au_pair",
      onboarding_completed: true,
      content_moderation_status: "approved",
      first_name: "Upload",
      last_name: "Aupair",
      full_name: "Upload Aupair",
      gender: "female",
      birth_date: "2000-01-01",
      date_of_birth: "2000-01-01",
      country: "Germany",
      city: "Berlin",
      nationality: "Romanian",
      preferred_host_countries: ["Germany"],
      mother_tongue: "Romanian",
      fluent_languages: ["English"],
      basic_languages: ["German"],
      availability_start: "2026-07-01",
      availability_start_from: "2026-07-01",
      availability_start_to: "2026-08-01",
      duration: "6 months",
      duration_min_months: 6,
      duration_max_months: 12,
      bio: "Upload smoke au pair profile.",
    });

    if (auPairProfileError) {
      throw new Error(auPairProfileError.message);
    }

    const { error: familyProfileError } = await admin.from("profiles").upsert({
      id: family.id,
      email: family.email,
      account_type: "family",
      onboarding_completed: true,
      content_moderation_status: "approved",
      full_name: "Upload Family",
      country: "Germany",
      city: "Munich",
      children_info: "2 children",
      availability_start: "2026-07-01",
      availability_start_from: "2026-07-01",
      availability_start_to: "2026-08-01",
      duration: "6 months",
      duration_min_months: 6,
      duration_max_months: 12,
      bio: "Upload smoke family profile.",
    });

    if (familyProfileError) {
      throw new Error(familyProfileError.message);
    }

    const familyPhotoPath = `${family.id}/upload-test-${suffix}.png`;
    const { error: familyPhotoUploadError } = await admin.storage
      .from("profile-photos")
      .upload(familyPhotoPath, readFileSync(fixturePath), {
        contentType: "image/png",
      });

    if (familyPhotoUploadError) {
      throw new Error(familyPhotoUploadError.message);
    }

    const { error: familyPhotoError } = await admin
      .from("profile_photos")
      .insert({
        profile_id: family.id,
        storage_path: familyPhotoPath,
        is_primary: true,
      });

    if (familyPhotoError) {
      throw new Error(familyPhotoError.message);
    }

    const { data: conversation, error: conversationError } = await admin
      .from("conversations")
      .insert({
        family_id: family.id,
        au_pair_id: auPair.id,
        created_by: auPair.id,
      })
      .select("id")
      .single();

    if (conversationError || !conversation) {
      throw new Error(conversationError?.message ?? "Could not create conversation.");
    }

    conversationId = conversation.id;

    const { error: draftViewerError } = await admin
      .from("conversation_draft_viewers")
      .insert({ conversation_id: conversationId, user_id: auPair.id });

    if (draftViewerError) {
      throw new Error(draftViewerError.message);
    }

    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/email/i).fill(auPair.email);
    await page.getByLabel(/password/i).fill(password);
    await page.locator("form").getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(/\/profile\/photos/, { timeout: 15_000 });
    await expectNoNextErrorPage(page);
    const largeProfilePhoto = await createLargeProfilePhoto(page);

    await page
      .locator('input[type="file"][accept*="image"]')
      .setInputFiles(
        Array.from({ length: 6 }, () => fixturePath),
      );
    await expect(page.locator("body")).toContainText(
      "You can add only 5 more photo(s).",
    );
    await expect
      .poll(async () => {
        const { count } = await admin
          .from("profile_photos")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", auPair?.id);

        return count ?? 0;
      }, { timeout: 5_000 })
      .toBe(0);

    const profilePhotoInput = page.locator(
      'input[type="file"][accept*="image"]',
    );
    await expect(
      page.getByRole("button", { name: "Choose photos" }),
    ).toBeEnabled();
    await expect.poll(() => profilePhotoInput.inputValue()).toBe("");

    await page.setViewportSize({ width: 390, height: 844 });
    await profilePhotoInput.setInputFiles([fixturePath, fixturePath]);
    const cancelledCropDialog = page.getByRole("dialog", {
      name: "Adjust your photo",
    });
    await expect(cancelledCropDialog).toBeVisible();
    const mobileCropFrame = cancelledCropDialog.locator(
      '[data-profile-photo-crop-frame="true"]',
    );
    const mobileCropFrameBox = await mobileCropFrame.boundingBox();
    expect(mobileCropFrameBox).not.toBeNull();
    expect(
      Math.abs(
        (mobileCropFrameBox?.width ?? 0) -
          (mobileCropFrameBox?.height ?? 0),
      ),
    ).toBeLessThan(1);
    expect(mobileCropFrameBox?.width ?? Infinity).toBeLessThanOrEqual(358);
    const mobileCropAreaBox = await cancelledCropDialog
      .locator(".reactEasyCrop_CropArea")
      .boundingBox();
    expect(mobileCropAreaBox).not.toBeNull();
    expect(
      Math.abs(
        (mobileCropAreaBox?.width ?? 0) -
          (mobileCropAreaBox?.height ?? 0),
      ),
    ).toBeLessThan(1);
    await expect(cancelledCropDialog).toContainText("Photo 1 of 2");
    await cancelledCropDialog
      .getByRole("button", { name: "Next photo" })
      .click();
    await expect(cancelledCropDialog).toContainText("Photo 2 of 2");
    await cancelledCropDialog
      .getByRole("button", { name: "Previous photo" })
      .click();
    await expect(cancelledCropDialog).toContainText("Photo 1 of 2");
    await cancelledCropDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(cancelledCropDialog).toHaveCount(0);
    await expect.poll(() => profilePhotoInput.inputValue()).toBe("");

    await profilePhotoInput.setInputFiles(fixturePath);
    const repeatedPhotoCropDialog = page.getByRole("dialog", {
      name: "Adjust your photo",
    });
    await expect(repeatedPhotoCropDialog).toBeVisible();
    await repeatedPhotoCropDialog
      .getByRole("button", { name: "Cancel" })
      .click();
    await expect(repeatedPhotoCropDialog).toHaveCount(0);
    await expect.poll(() => profilePhotoInput.inputValue()).toBe("");

    await page.setViewportSize({ width: 1280, height: 720 });
    await expect
      .poll(async () => {
        const { count } = await admin
          .from("profile_photos")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", auPair?.id);

        return count ?? 0;
      })
      .toBe(0);

    await profilePhotoInput.setInputFiles(largeProfilePhoto);
    const cropDialog = page.getByRole("dialog", {
      name: "Adjust your photo",
    });
    await expect(cropDialog).toBeVisible();
    const desktopCropAreaBox = await cropDialog
      .locator(".reactEasyCrop_CropArea")
      .boundingBox();
    expect(desktopCropAreaBox).not.toBeNull();
    expect(
      Math.abs(
        (desktopCropAreaBox?.width ?? 0) -
          (desktopCropAreaBox?.height ?? 0),
      ),
    ).toBeLessThan(1);
    expect(desktopCropAreaBox?.width ?? 0).toBeGreaterThan(
      mobileCropAreaBox?.width ?? Infinity,
    );
    await expect(cropDialog.getByLabel("Zoom")).toHaveValue("1");
    await cropDialog.getByLabel("Zoom").press("End");
    await expect(cropDialog.getByLabel("Zoom")).toHaveValue("3");
    await cropDialog.getByRole("button", { name: "Use photo" }).click();

    await expect
      .poll(async () => {
        const { count } = await admin
          .from("profile_photos")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", auPair?.id);

        return count ?? 0;
      }, { timeout: 15_000 })
      .toBe(1);
    await expect(page.locator("body")).toContainText("1 / 5 uploaded");

    const { data: optimizedPhotoRow, error: optimizedPhotoRowError } =
      await admin
        .from("profile_photos")
        .select("storage_path")
        .eq("profile_id", auPair.id)
        .eq("is_primary", true)
        .single();
    expect(optimizedPhotoRowError).toBeNull();
    const { data: optimizedPhoto, error: optimizedPhotoError } =
      await admin.storage
        .from("profile-photos")
        .download(String(optimizedPhotoRow?.storage_path));
    expect(optimizedPhotoError).toBeNull();
    expect(optimizedPhoto).not.toBeNull();
    expect(optimizedPhoto?.size ?? Infinity).toBeLessThanOrEqual(768 * 1024);

    await page.addInitScript(() => {
      const tracks = [{ stop: () => undefined }];

      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async () => ({
            getTracks: () => tracks,
          }),
        },
      });
      Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
        configurable: true,
        get: () => null,
        set: () => undefined,
      });
      Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
        configurable: true,
        get: () => 800,
      });
      Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
        configurable: true,
        get: () => 600,
      });
      HTMLMediaElement.prototype.play = async () => undefined;
      CanvasRenderingContext2D.prototype.drawImage = function drawImage() {
        this.fillStyle = "#dce8ec";
        this.fillRect(0, 0, this.canvas.width, this.canvas.height);
      };
    });

    await page.goto("/account#profile-verification");
    await expectNoNextErrorPage(page);
    await expect(
      page.locator("#profile-verification input[type=file]"),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Open camera" }).click();
    await page.getByRole("button", { name: "Take photo" }).click();
    await expect(
      page.getByRole("img", { name: "Verification selfie" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Request verification" }).click();
    await page.waitForURL(/verification=sent/, { timeout: 15_000 });
    await expectNoNextErrorPage(page);
    const verificationScrollPosition = await page.evaluate(() => {
      const section = document.getElementById("profile-verification");

      return {
        scrollY: window.scrollY,
        sectionTop: section?.getBoundingClientRect().top ?? Infinity,
        viewportHeight: window.innerHeight,
      };
    });
    expect(verificationScrollPosition.scrollY).toBeGreaterThan(0);
    expect(verificationScrollPosition.sectionTop).toBeGreaterThanOrEqual(0);
    expect(verificationScrollPosition.sectionTop).toBeLessThan(
      verificationScrollPosition.viewportHeight,
    );

    const { data: verificationRequest, error: verificationRequestError } =
      await admin
        .from("profile_verification_requests")
        .select("selfie_path")
        .eq("profile_id", auPair.id)
        .eq("status", "pending")
        .single();
    expect(verificationRequestError).toBeNull();
    expect(verificationRequest?.selfie_path).toBeTruthy();

    const { data: storedVerificationSelfie, error: verificationSelfieError } =
      await admin.storage
        .from("verification-selfies")
        .download(String(verificationRequest?.selfie_path));
    expect(verificationSelfieError).toBeNull();
    expect(storedVerificationSelfie?.size ?? Infinity).toBeLessThanOrEqual(
      4 * 1024 * 1024,
    );

    await page.goto("/profile/photos");
    await expectNoNextErrorPage(page);

    const optimizedPhotoBuffer = Buffer.from(
      await (optimizedPhoto as Blob).arrayBuffer(),
    );
    const optimizedPhotoDimensions = await page.evaluate(
      async ({ base64, type }) => {
        const image = new Image();

        return await new Promise<{ height: number; width: number }>(
          (resolve, reject) => {
            image.addEventListener(
              "load",
              () =>
                resolve({
                  height: image.naturalHeight,
                  width: image.naturalWidth,
                }),
              { once: true },
            );
            image.addEventListener(
              "error",
              () => reject(new Error("Optimized profile photo is unreadable.")),
              { once: true },
            );
            image.src = `data:${type};base64,${base64}`;
          },
        );
      },
      {
        base64: optimizedPhotoBuffer.toString("base64"),
        type: optimizedPhoto?.type || "image/webp",
      },
    );
    expect(
      Math.max(optimizedPhotoDimensions.width, optimizedPhotoDimensions.height),
    ).toBeLessThan(600);
    expect(
      Math.max(optimizedPhotoDimensions.width, optimizedPhotoDimensions.height),
    ).toBeGreaterThan(500);
    expect(optimizedPhotoDimensions.width).toBe(optimizedPhotoDimensions.height);

    await expect(
      page.getByRole("button", { name: "Choose photos" }),
    ).toBeEnabled();
    await expect.poll(() => profilePhotoInput.inputValue()).toBe("");
    await profilePhotoInput.setInputFiles(fixturePath);
    await page
      .getByRole("dialog", { name: "Adjust your photo" })
      .getByRole("button", { name: "Use photo" })
      .click();
    await expect
      .poll(async () => {
        const { count } = await admin
          .from("profile_photos")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", auPair?.id);

        return count ?? 0;
      }, { timeout: 15_000 })
      .toBe(2);
    await expect(page.locator("body")).toContainText("2 / 5 uploaded");

    const { data: removablePhoto, error: removablePhotoError } = await admin
      .from("profile_photos")
      .select("id, storage_path")
      .eq("profile_id", auPair.id)
      .eq("is_primary", false)
      .single();
    expect(removablePhotoError).toBeNull();
    expect(removablePhoto?.storage_path).toBeTruthy();

    const referencedDelete = await page.request.delete("/api/media/orphan", {
      data: {
        bucket: "profile-photos",
        path: removablePhoto?.storage_path,
      },
    });
    expect(referencedDelete.status()).toBe(409);

    const orphanDeleteResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/media/orphan") &&
        response.request().method() === "DELETE",
    );
    await page
      .getByRole("button", { name: "Make main photo" })
      .locator("..")
      .getByRole("button", { name: "Delete" })
      .click();
    const orphanDelete = await orphanDeleteResponse;

    expect(orphanDelete.status()).toBe(200);
    await expect
      .poll(async () => {
        const { count } = await admin
          .from("profile_photos")
          .select("id", { count: "exact", head: true })
          .eq("id", removablePhoto?.id);

        return count ?? 0;
      })
      .toBe(0);
    await expect
      .poll(async () => {
        const download = await admin.storage
          .from("profile-photos")
          .download(String(removablePhoto?.storage_path));

        return download.error === null;
      })
      .toBe(false);

    const { data: deletedPhotoLedger, error: deletedPhotoLedgerError } =
      await admin
        .from("storage_upload_usage_events")
        .select("deleted_at, deletion_claim_token, deletion_claimed_at")
        .eq("bucket_id", "profile-photos")
        .eq("object_name", removablePhoto?.storage_path)
        .single();
    expect(deletedPhotoLedgerError).toBeNull();
    expect(deletedPhotoLedger?.deleted_at).not.toBeNull();
    expect(deletedPhotoLedger?.deletion_claim_token).toBeNull();
    expect(deletedPhotoLedger?.deletion_claimed_at).toBeNull();
    await expect(page.locator("body")).toContainText("1 / 5 uploaded");

    const verifiesFreshStoryFeed = testInfo.project.name === "chromium";

    if (verifiesFreshStoryFeed) {
      await page.goto("/search-family", { timeout: 15_000 });
      await expect(page).toHaveURL(/\/search-family/);
      await expectNoNextErrorPage(page);
      await page
        .getByRole("link", { name: "Add story" })
        .filter({ visible: true })
        .click();
    } else {
      await page.goto("/stories/new", { timeout: 15_000 });
    }

    await expect(page).toHaveURL(/\/stories\/new/);
    await expectNoNextErrorPage(page);
    const storyFileChooser = page.waitForEvent("filechooser", {
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Choose photo" }).click();
    await (await storyFileChooser).setFiles(storyFixture);
    await expect(page.locator("body")).toContainText("Selected:");
    await page.getByRole("button", { name: "Post story" }).click();
    await page.waitForURL(
      verifiesFreshStoryFeed ? /\/search-family/ : /\/account/,
      { timeout: 15_000 },
    );
    await expectNoNextErrorPage(page);

    if (verifiesFreshStoryFeed) {
      await expect(
        page.getByRole("link", { name: "Your story" }).filter({ visible: true }),
      ).toBeVisible();
    }

    await expect
      .poll(async () => {
        const { count } = await admin
          .from("profile_stories")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", auPair?.id);

        return count ?? 0;
      }, { timeout: 15_000 })
      .toBe(1);

    const { error: moderationFixtureError } = await admin
      .from("profiles")
      .update({ content_moderation_status: "approved" })
      .in("id", [auPair.id, family.id]);

    if (moderationFixtureError) {
      throw new Error(moderationFixtureError.message);
    }

    await page.goto(
      `/messages?conversation=${encodeURIComponent(conversationId)}`,
      { waitUntil: "domcontentloaded" },
    );
    await expectNoNextErrorPage(page);
    await expect(page.locator("[data-message-composer]")).toBeVisible({
      timeout: 20_000,
    });
    await chooseMessageMediaFile(page, fixturePath);
    await expect(page.locator('[data-photo-preview-card="true"]')).toBeVisible();

    await page
      .locator('[data-photo-preview-card="true"]')
      .getByRole("button", { name: "Remove" })
      .click();
    await expect(page.locator('[data-photo-preview-card="true"]')).toHaveCount(0);

    await chooseMessageMediaFile(page, largeProfilePhoto);
    await expect(page.locator('[data-photo-preview-card="true"]')).toBeVisible();
    const mediaPreview = page.locator('[data-photo-preview-card="true"]');
    await mediaPreview
      .getByPlaceholder("Write a message...")
      .fill("Smoke image message");
    await mediaPreview.getByRole("button", { name: "Send" }).click();

    await expect
      .poll(async () => {
        const { count } = await admin
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conversationId)
          .not("image_path", "is", null);

        return count ?? 0;
      }, { timeout: 15_000 })
      .toBe(1);
    await expect(page.locator('[data-photo-preview-card="true"]')).toHaveCount(0);

    if (testInfo.project.name === "chromium") {
      // Inspect the committed server representation in a separate page so the
      // main page keeps its optimistic FIFO upload queue intact.
      const committedMediaPage = await page.context().newPage();

      try {
        await committedMediaPage.goto(`/messages/${conversationId}`);
        await expectNoNextErrorPage(committedMediaPage);

        const committedMessageImage = committedMediaPage
          .locator('img[src*="/api/media/private/message-photos/"]')
          .last();
        await expect(committedMessageImage).toBeVisible();
        const committedMessageImageSrc =
          await committedMessageImage.getAttribute("src");

        if (!committedMessageImageSrc) {
          throw new Error("Committed message image URL is missing.");
        }

        expect(
          new URL(
            committedMessageImageSrc,
            committedMediaPage.url(),
          ).searchParams.get("width"),
        ).toBe("640");

        const messageImageResponse = await committedMediaPage.request.get(
          committedMessageImageSrc,
        );
        expect(messageImageResponse.status()).toBe(200);
        expect(messageImageResponse.headers()["cache-control"]).toContain(
          "must-revalidate",
        );
        const messageImageEtag = messageImageResponse.headers().etag;
        expect(messageImageEtag).toMatch(/^W\/"pa-private-v1-/);

        const unchangedMessageImageResponse =
          await committedMediaPage.request.get(committedMessageImageSrc, {
            headers: { "If-None-Match": messageImageEtag },
          });
        expect(unchangedMessageImageResponse.status()).toBe(304);

        const rangedTransformedMessageImageResponse =
          await committedMediaPage.request.get(committedMessageImageSrc, {
            headers: { Range: "bytes=0-1" },
          });
        expect(rangedTransformedMessageImageResponse.status()).toBe(416);
      } finally {
        await committedMediaPage.close();
      }
    }

    const messageImageButton = page
      .getByRole("button", { name: "Open image", exact: true })
      .last();
    await expect(messageImageButton).toBeVisible();
    await messageImageButton.click();

    const messageImageZoomSurface = page.locator(
      '[data-message-image-zoom-surface="true"]',
    );
    await expect(messageImageZoomSurface).toBeVisible();
    const zoomSurfaceBounds = await messageImageZoomSurface.boundingBox();

    if (!zoomSurfaceBounds) {
      throw new Error("Message image zoom surface bounds are unavailable.");
    }

    const zoomCenterX = zoomSurfaceBounds.x + zoomSurfaceBounds.width / 2;
    const zoomCenterY = zoomSurfaceBounds.y + zoomSurfaceBounds.height / 2;

    await messageImageZoomSurface.dispatchEvent("pointerdown", {
      bubbles: true,
      button: 0,
      buttons: 1,
      clientX: zoomCenterX - 40,
      clientY: zoomCenterY,
      pointerId: 41,
      pointerType: "touch",
    });
    await messageImageZoomSurface.dispatchEvent("pointerdown", {
      bubbles: true,
      button: 0,
      buttons: 1,
      clientX: zoomCenterX + 40,
      clientY: zoomCenterY,
      pointerId: 42,
      pointerType: "touch",
    });
    await messageImageZoomSurface.dispatchEvent("pointermove", {
      bubbles: true,
      buttons: 1,
      clientX: zoomCenterX + 120,
      clientY: zoomCenterY,
      pointerId: 42,
      pointerType: "touch",
    });
    await expect
      .poll(async () =>
        Number(
          await messageImageZoomSurface.getAttribute(
            "data-message-image-zoom-scale",
          ),
        ),
      )
      .toBeGreaterThan(1.5);
    await messageImageZoomSurface.dispatchEvent("pointerup", {
      bubbles: true,
      button: 0,
      buttons: 0,
      clientX: zoomCenterX - 40,
      clientY: zoomCenterY,
      pointerId: 41,
      pointerType: "touch",
    });
    await messageImageZoomSurface.dispatchEvent("pointerup", {
      bubbles: true,
      button: 0,
      buttons: 0,
      clientX: zoomCenterX + 120,
      clientY: zoomCenterY,
      pointerId: 42,
      pointerType: "touch",
    });
    await page
      .getByRole("button", { name: "Close image", exact: true })
      .click();
    await expect(messageImageZoomSurface).toHaveCount(0);

    const composer = page.locator("[data-message-composer]");
    const composerTextarea = composer.getByPlaceholder("Write a message...");
    const touchFirstProjects = new Set([
      "android-chrome",
      "samsung-internet-emulation",
      "ios-safari",
      "iphone-chrome-emulation",
      "iphone-firefox-emulation",
      "ipad-safari",
    ]);
    const expectsMobileNewline = touchFirstProjects.has(testInfo.project.name);
    const firstKeyboardLine = "Keyboard line one";
    const secondKeyboardLine = "Keyboard line two";

    await expect(composerTextarea).toBeEnabled();
    await composerTextarea.fill(firstKeyboardLine);
    const singleLineComposerHeight = await composerTextarea.evaluate(
      (textarea) => textarea.getBoundingClientRect().height,
    );
    await composerTextarea.press("Enter");

    let keyboardMessageBody = firstKeyboardLine;

    if (expectsMobileNewline) {
      await expect(composerTextarea).toHaveValue(`${firstKeyboardLine}\n`);
      await composerTextarea.type(secondKeyboardLine);
      keyboardMessageBody = `${firstKeyboardLine}\n${secondKeyboardLine}`;
      await expect(composerTextarea).toHaveValue(keyboardMessageBody);
      await expect
        .poll(() =>
          composerTextarea.evaluate(
            (textarea) => textarea.getBoundingClientRect().height,
          ),
        )
        .toBeGreaterThan(singleLineComposerHeight);
      await composer.getByRole("button", { name: "Send" }).click();
    } else {
      await expect(composerTextarea).toHaveValue("");
    }

    await expect
      .poll(async () => {
        const { data } = await admin
          .from("messages")
          .select("body")
          .eq("conversation_id", conversationId)
          .like("body", `${firstKeyboardLine}%`)
          .maybeSingle();

        return data?.body.replace(/\r\n/g, "\n") ?? null;
      }, { timeout: 15_000 })
      .toBe(keyboardMessageBody);

    await delayNextCanvasEncode(page);
    await chooseMessageMediaFile(page, fixturePath);
    const firstQueuedPreview = page.locator('[data-photo-preview-card="true"]');
    await firstQueuedPreview
      .getByPlaceholder("Write a message...")
      .fill("FIFO photo 1");
    await firstQueuedPreview.getByRole("button", { name: "Send" }).click();
    await expect(firstQueuedPreview).toHaveCount(0);
    const optimisticReadReceipt = page.locator(
      '[data-message-read-receipt][data-pending="true"]',
    );
    await expect(optimisticReadReceipt).toBeVisible();
    await expect(optimisticReadReceipt).toHaveAttribute("data-read", "false");

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            Boolean(
              (
                window as Window &
                  typeof globalThis & { __paImageEncodeWaiting?: boolean }
              ).__paImageEncodeWaiting,
            ),
        ),
      )
      .toBe(true);

    await expect(composerTextarea).toBeEnabled();
    await expect(
      composer.getByRole("button", { name: "Attach media" }),
    ).toBeEnabled();

    await composerTextarea.fill("FIFO text 2");
    await composer.getByRole("button", { name: "Send" }).click();
    await expect(composerTextarea).toHaveValue("");

    await chooseMessageMediaFile(page, fixturePath);
    const secondQueuedPreview = page.locator('[data-photo-preview-card="true"]');
    await secondQueuedPreview
      .getByPlaceholder("Write a message...")
      .fill("FIFO photo 3");
    await secondQueuedPreview.getByRole("button", { name: "Send" }).click();
    await expect(secondQueuedPreview).toHaveCount(0);

    await expect
      .poll(async () => {
        const { data } = await admin
          .from("messages")
          .select("body")
          .eq("conversation_id", conversationId)
          .in("body", ["FIFO photo 1", "FIFO text 2", "FIFO photo 3"]);

        return (data ?? []).map((message) => message.body).sort();
      }, { timeout: 15_000 })
      .toEqual(["FIFO photo 3", "FIFO text 2"]);

    const messageScroll = page.locator("[data-message-scroll-container]");
    await expect(messageScroll.getByText("FIFO photo 1", { exact: true })).toBeVisible();
    await expect(messageScroll.getByText("FIFO text 2", { exact: true })).toBeVisible();
    await expect(messageScroll.getByText("FIFO photo 3", { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        messageScroll.evaluate((container) => {
          const paragraphs = Array.from(container.querySelectorAll("p"));
          const first = paragraphs.find(
            (element) => element.textContent?.trim() === "FIFO photo 1",
          );
          const second = paragraphs.find(
            (element) => element.textContent?.trim() === "FIFO text 2",
          );
          const third = paragraphs.find(
            (element) => element.textContent?.trim() === "FIFO photo 3",
          );

          return Boolean(
            first &&
              second &&
              third &&
              (first.compareDocumentPosition(second) &
                Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
              (second.compareDocumentPosition(third) &
                Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
          );
        }),
      )
      .toBe(true);

    await releaseDelayedCanvasEncode(page);

    await expect
      .poll(async () => {
        const { count } = await admin
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conversationId)
          .in("body", ["FIFO photo 1", "FIFO text 2", "FIFO photo 3"]);

        return count ?? 0;
      }, { timeout: 30_000 })
      .toBe(3);

    const { data: logicalMessages } = await admin
      .from("messages")
      .select("body, created_at, sent_at, order_key")
      .eq("conversation_id", conversationId)
      .in("body", ["FIFO photo 1", "FIFO text 2", "FIFO photo 3"])
      .order("order_key", { ascending: true });
    const logicalMessageOrder = logicalMessages ?? [];

    expect(logicalMessageOrder.map((message) => message.body)).toEqual([
      "FIFO photo 1",
      "FIFO text 2",
      "FIFO photo 3",
    ]);
    expect(
      logicalMessageOrder.every(
        (message, index) =>
          index === 0 ||
          Number(message.order_key) >
            Number(logicalMessageOrder[index - 1]?.order_key),
      ),
    ).toBe(true);
    expect(
      logicalMessageOrder.every(
        (message, index) =>
          index === 0 ||
          new Date(message.sent_at).getTime() >=
            new Date(logicalMessageOrder[index - 1]?.sent_at ?? 0).getTime(),
      ),
    ).toBe(true);
    expect(
      new Date(logicalMessageOrder[0]?.created_at ?? 0).getTime(),
    ).toBeGreaterThan(
      new Date(logicalMessageOrder[1]?.created_at ?? 0).getTime(),
    );

    const supportsHevcMov = await page.evaluate(() => {
      const video = document.createElement("video");

      return [
        'video/quicktime; codecs="hvc1"',
        'video/mp4; codecs="hvc1"',
      ].some((mimeType) => video.canPlayType(mimeType) !== "");
    });

    if (supportsHevcMov) {
      await composerTextarea.fill("iPhone MOV message");
      await chooseMessageMediaFile(
        page,
        join(process.cwd(), "tests/fixtures/iphone-hevc.mov"),
      );
      await expect(
        page.locator('[data-photo-preview-card="true"]'),
      ).toHaveCount(0);
      await expect(composerTextarea).toHaveValue("");
      await expect(composerTextarea).toBeEnabled();
      await expect
        .poll(async () => {
          const { count } = await admin
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conversationId)
            .eq("body", "iPhone MOV message")
            .not("video_path", "is", null);

          return count ?? 0;
        }, { timeout: 60_000 })
        .toBe(1);
    }

    const privateMessageVideoRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/media/private/message-videos/")) {
        privateMessageVideoRequests.push(request.url());
      }
    });

    const videoFixture = await createCompressibleVideo(
      page,
      testInfo.outputPath("chat-video-over-storage-limit.mp4"),
    );

    if (testInfo.project.name === "chromium") {
      const audioVideoPath = await createVideoWithAudio(
        page,
        testInfo.outputPath("chat-video-with-audio.webm"),
      );
      await composerTextarea.fill("Video with audio");
      await chooseMessageMediaFile(page, audioVideoPath);

      await expect
        .poll(async () => {
          const { data } = await admin
            .from("messages")
            .select("video_path")
            .eq("conversation_id", conversationId)
            .eq("body", "Video with audio")
            .not("video_path", "is", null)
            .maybeSingle();

          return data;
        }, { timeout: 60_000 })
        .not.toBeNull();

      const { data: audioMessageRow, error: audioMessageError } = await admin
        .from("messages")
        .select("video_path")
        .eq("conversation_id", conversationId)
        .eq("body", "Video with audio")
        .single();

      if (audioMessageError || !audioMessageRow?.video_path) {
        throw new Error(
          audioMessageError?.message ?? "The audio video message was not stored.",
        );
      }

      const { data: audioVideoBlob, error: audioVideoError } = await admin.storage
        .from("message-videos")
        .download(audioMessageRow.video_path);

      if (audioVideoError || !audioVideoBlob) {
        throw new Error(
          audioVideoError?.message ?? "Could not download the audio video message.",
        );
      }

      const { ALL_FORMATS, BlobSource, Input } = await import("mediabunny");
      const audioVideoInput = new Input({
        formats: ALL_FORMATS,
        source: new BlobSource(audioVideoBlob),
      });

      try {
        expect(await audioVideoInput.canRead()).toBe(true);
        const storedAudioTrack = await audioVideoInput.getPrimaryAudioTrack();
        expect(storedAudioTrack).not.toBeNull();
        expect(await storedAudioTrack?.computeDuration()).toBeGreaterThan(0);
      } finally {
        audioVideoInput.dispose();
      }

      await expect(
        messageScroll.locator('[data-video-send-status]'),
      ).toHaveCount(0, { timeout: 30_000 });
    }

    const resumableUploadPattern = "**/storage/v1/upload/resumable**";

    if (testInfo.project.name === "chromium" && videoFixture.resumablePath) {
      let releaseNavigationUpload = () => undefined;
      const navigationUploadGate = new Promise<void>((resolve) => {
        releaseNavigationUpload = resolve;
      });
      let navigationUploadIntercepted = false;

      await page.route(resumableUploadPattern, async (route) => {
        if (
          !navigationUploadIntercepted &&
          route.request().method() === "PATCH"
        ) {
          navigationUploadIntercepted = true;
          await navigationUploadGate;
        }

        try {
          await route.continue();
        } catch (error) {
          if (!String(error).includes("Route is already handled")) {
            throw error;
          }
        }
      });

      try {
        const navigationVideoCaption = "Video sent across navigation";
        await composerTextarea.fill(navigationVideoCaption);
        await chooseMessageMediaFile(page, videoFixture.resumablePath);
        const navigationVideoMessage = messageScroll
          .locator('[data-message-optimistic="true"]')
          .last();
        await expect(
          navigationVideoMessage.locator('[data-video-send-status="uploading"]'),
        ).toBeVisible();
        await expect.poll(() => navigationUploadIntercepted).toBe(true);
        const navigationVideoMessageId =
          await navigationVideoMessage.getAttribute("data-message-id");
        expect(navigationVideoMessageId).toBeTruthy();

        const feedLink = page.locator('header a[href="/search-family"]').first();
        await expect(feedLink).toBeVisible();
        await feedLink.click({ timeout: 10_000 });
        await page.waitForURL(/\/search-family(?:\?|$)/, { timeout: 10_000 });
        await page.goBack({ timeout: 10_000 });
        await page.waitForURL(
          (url) =>
            url.pathname === `/messages/${conversationId}` ||
            (url.pathname === "/messages" &&
              url.searchParams.get("conversation") === conversationId),
          { timeout: 10_000 },
        );
        await expect(composerTextarea).toBeEnabled();

        const draftWrittenAfterReturn = "Draft written after returning";
        await composerTextarea.fill(draftWrittenAfterReturn);
        releaseNavigationUpload();

        await expect
          .poll(async () => {
            const { count } = await admin
              .from("messages")
              .select("id", { count: "exact", head: true })
              .eq("conversation_id", conversationId)
              .eq("id", String(navigationVideoMessageId))
              .not("video_path", "is", null);

            return count ?? 0;
          }, { timeout: 60_000 })
          .toBe(1);
        await expect(
          messageScroll.locator(
            `[data-message-id="${navigationVideoMessageId}"] [data-message-video="true"]`,
          ),
        ).toBeVisible();
        await expect(
          messageScroll.locator(
            `[data-message-id="${navigationVideoMessageId}"]`,
          ),
        ).not.toHaveAttribute("data-message-optimistic", "true");
        await expect(composerTextarea).toHaveValue(draftWrittenAfterReturn);
        await composerTextarea.fill("");
      } finally {
        releaseNavigationUpload();
        await page.unroute(resumableUploadPattern);
      }
    }

    if (testInfo.project.name === "chromium" && videoFixture.resumablePath) {
      let releaseFailedNavigationUpload = () => undefined;
      const failedNavigationUploadGate = new Promise<void>((resolve) => {
        releaseFailedNavigationUpload = resolve;
      });
      let failedNavigationUploadIntercepted = false;

      await page.route(resumableUploadPattern, async (route) => {
        if (
          !failedNavigationUploadIntercepted &&
          route.request().method() === "PATCH"
        ) {
          failedNavigationUploadIntercepted = true;
          await failedNavigationUploadGate;
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              statusCode: "400",
              error: "Bad Request",
              message: "Synthetic failure while away from chat",
            }),
          });
          return;
        }

        await route.continue();
      });

      try {
        await composerTextarea.fill("");
        await chooseMessageMediaFile(page, videoFixture.resumablePath);
        const failedNavigationVideoMessage = messageScroll
          .locator('[data-message-optimistic="true"]')
          .last();
        await expect(
          failedNavigationVideoMessage.locator(
            '[data-video-send-status="uploading"]',
          ),
        ).toBeVisible();
        await expect.poll(() => failedNavigationUploadIntercepted).toBe(true);
        const failedNavigationVideoMessageId =
          await failedNavigationVideoMessage.getAttribute("data-message-id");
        expect(failedNavigationVideoMessageId).toBeTruthy();

        const feedLink = page.locator('header a[href="/search-family"]').first();
        await feedLink.click({ timeout: 10_000 });
        await page.waitForURL(/\/search-family(?:\?|$)/, { timeout: 10_000 });
        releaseFailedNavigationUpload();

        await expect
          .poll(() =>
            page.evaluate(
              ({ profileId, currentConversationId, messageId }) => {
                const pendingDrafts = window.localStorage.getItem(
                  `pa_message_pending_drafts:v1:${profileId}:${currentConversationId}`,
                );

                return pendingDrafts?.includes(messageId) ?? false;
              },
              {
                profileId: auPair.id,
                currentConversationId: conversationId,
                messageId: String(failedNavigationVideoMessageId),
              },
            ),
          )
          .toBe(false);

        await page.goBack({ timeout: 10_000 });
        await page.waitForURL(
          (url) =>
            url.pathname === `/messages/${conversationId}` ||
            (url.pathname === "/messages" &&
              url.searchParams.get("conversation") === conversationId),
          { timeout: 10_000 },
        );
        await expect(composerTextarea).toBeEnabled();
        await expect(
          page.getByText("Could not send message.", { exact: true }),
        ).toBeVisible();

        const { count: failedNavigationMessageCount } = await admin
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conversationId)
          .eq("id", String(failedNavigationVideoMessageId));
        expect(failedNavigationMessageCount ?? 0).toBe(0);
      } finally {
        releaseFailedNavigationUpload();
        await page.unroute(resumableUploadPattern);
      }
    }

    if (testInfo.project.name === "ios-safari" && videoFixture.resumablePath) {
      expect(videoFixture.resumableByteLength).toBeGreaterThan(
        6 * 1024 * 1024,
      );
      expect(videoFixture.resumableByteLength).toBeLessThan(
        50 * 1024 * 1024,
      );

      let releaseDelayedUpload = () => undefined;
      const delayedUploadGate = new Promise<void>((resolve) => {
        releaseDelayedUpload = resolve;
      });
      let delayedUploadIntercepted = false;

      await page.route(resumableUploadPattern, async (route) => {
        if (
          !delayedUploadIntercepted &&
          route.request().method() === "PATCH"
        ) {
          delayedUploadIntercepted = true;
          await delayedUploadGate;
        }

        await route.continue();
      });

      try {

      await composerTextarea.fill("");
      await chooseMessageMediaFile(page, videoFixture.resumablePath);
      const slowVideoMessage = messageScroll
        .locator('[data-message-optimistic="true"]')
        .last();
      await expect(
        slowVideoMessage.locator('[data-video-send-status="uploading"]'),
      ).toBeVisible();
      await expect.poll(() => delayedUploadIntercepted).toBe(true);
      const slowVideoMessageId = await slowVideoMessage.getAttribute(
        "data-message-id",
      );
      expect(slowVideoMessageId).toBeTruthy();

      await page.evaluate((messageId) => {
        const scrollContainer = document.querySelector(
          "[data-message-scroll-container]",
        );
        const messageIsVisible = () =>
          Boolean(
            scrollContainer?.querySelector(
              `[data-message-id="${messageId}"]`,
            ),
          );
        const state = {
          gapObserved: false,
          observer: new MutationObserver(() => {
            if (!messageIsVisible()) state.gapObserved = true;
          }),
        };

        if (!scrollContainer) {
          throw new Error("Message scroll container is missing.");
        }

        state.observer.observe(scrollContainer, {
          childList: true,
          subtree: true,
        });
        (
          window as Window & {
            __slowVideoHandoff?: typeof state;
          }
        ).__slowVideoHandoff = state;
      }, slowVideoMessageId);

      await page.waitForTimeout(17_000);
      await expect(slowVideoMessage).toBeVisible();
      await expect(slowVideoMessage).toHaveAttribute(
        "data-message-optimistic",
        "true",
      );
      await expect(
        slowVideoMessage.locator('[data-video-send-status="uploading"]'),
      ).toBeVisible();
      await expect(composerTextarea).toHaveValue("");
      expect(
        await page.evaluate(
          () =>
            (
              window as Window & {
                __slowVideoHandoff?: { gapObserved: boolean };
              }
            ).__slowVideoHandoff?.gapObserved ?? false,
        ),
      ).toBe(false);

      releaseDelayedUpload();

      await expect
        .poll(async () => {
          const { count } = await admin
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conversationId)
            .eq("id", String(slowVideoMessageId))
            .not("video_path", "is", null);

          return count ?? 0;
        }, { timeout: 60_000 })
        .toBe(1);
      await expect(
        messageScroll.locator(
          `[data-message-id="${slowVideoMessageId}"] [data-message-video="true"]`,
        ),
      ).toBeVisible();
      await expect(
        messageScroll.locator(
          `[data-message-id="${slowVideoMessageId}"]`,
        ),
      ).not.toHaveAttribute("data-message-optimistic", "true");
      expect(
        await page.evaluate(
          () =>
            (
              window as Window & {
                __slowVideoHandoff?: { gapObserved: boolean };
              }
            ).__slowVideoHandoff?.gapObserved ?? false,
        ),
      ).toBe(false);
      await page.evaluate(() => {
        const target = (
          window as Window & {
            __slowVideoHandoff?: { observer: MutationObserver };
          }
        ).__slowVideoHandoff;

        target?.observer.disconnect();
        delete (
          window as Window & {
            __slowVideoHandoff?: { observer: MutationObserver };
          }
        ).__slowVideoHandoff;
      });
      } finally {
        releaseDelayedUpload();
        await page.unroute(resumableUploadPattern);
      }
    }

    if (
      ["chromium", "ios-safari"].includes(testInfo.project.name) &&
      videoFixture.resumablePath
    ) {
      let resumablePostCount = 0;
      let resumableHeadCount = 0;
      let resumablePatchCount = 0;
      let failedPatchUrl = "";
      const resumedHeadUrls: string[] = [];
      const successfulPatchUrls: string[] = [];
      const patchOffsets: string[] = [];

      await page.route(resumableUploadPattern, async (route) => {
        const request = route.request();
        const method = request.method();

        if (method === "POST") {
          resumablePostCount += 1;
        } else if (method === "HEAD") {
          resumableHeadCount += 1;
          resumedHeadUrls.push(request.url());
        } else if (method === "PATCH") {
          resumablePatchCount += 1;
          patchOffsets.push(request.headers()["upload-offset"] ?? "");

          if (!failedPatchUrl) {
            failedPatchUrl = request.url();
            await route.fulfill({
              status: 400,
              contentType: "application/json",
              body: JSON.stringify({
                statusCode: "400",
                error: "Bad Request",
                message: "Synthetic interrupted upload",
              }),
            });
            return;
          }
        }

        if (method === "PATCH") {
          successfulPatchUrls.push(request.url());
        }

        await route.continue();
      });

      const resumableCaption = `Resumed video ${testInfo.project.name}`;
      await composerTextarea.fill(resumableCaption);
      await chooseMessageMediaFile(page, videoFixture.resumablePath);
      const failedVideoStatus = messageScroll.locator(
        '[data-video-send-status="failed"]',
      );
      await expect(failedVideoStatus).toBeVisible({ timeout: 15_000 });
      await expect(failedVideoStatus).toContainText("Video upload interrupted");
      const failedVideoMessage = failedVideoStatus.locator(
        "xpath=ancestor::*[@data-message-id][1]",
      );
      const failedVideoMessageId = await failedVideoMessage.getAttribute(
        "data-message-id",
      );
      expect(failedVideoMessageId).toBeTruthy();
      expect(resumablePostCount).toBe(1);
      expect(resumablePatchCount).toBe(1);
      await failedVideoStatus
        .getByRole("button", { name: "Try again" })
        .click();

      await expect
        .poll(async () => {
          const { count } = await admin
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conversationId)
            .eq("id", String(failedVideoMessageId))
            .not("video_path", "is", null);

          return count ?? 0;
        }, { timeout: 60_000 })
        .toBe(1);
      await expect(
        messageScroll.locator(
          `[data-message-id="${failedVideoMessageId}"] [data-message-video="true"]`,
        ),
      ).toBeVisible();
      await expect(failedVideoStatus).toHaveCount(0);
      expect(resumablePostCount).toBe(1);
      expect(resumableHeadCount).toBeGreaterThanOrEqual(1);
      expect(resumablePatchCount).toBeGreaterThanOrEqual(2);
      expect(resumedHeadUrls).toContain(failedPatchUrl);
      expect(successfulPatchUrls).toContain(failedPatchUrl);
      expect(patchOffsets[0]).toBe(String(6 * 1024 * 1024));
      expect(
        patchOffsets.filter((offset) => offset === String(6 * 1024 * 1024)),
      ).toHaveLength(2);
      await page.unroute(resumableUploadPattern);
    }

    if (testInfo.project.name === "ios-safari" && videoFixture.resumablePath) {
      let failedDismissPatch = false;
      await page.route(resumableUploadPattern, async (route) => {
        if (
          !failedDismissPatch &&
          route.request().method() === "PATCH"
        ) {
          failedDismissPatch = true;
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              statusCode: "400",
              error: "Bad Request",
              message: "Synthetic interrupted upload",
            }),
          });
          return;
        }

        await route.continue();
      });

      const dismissedCaption = "Dismiss interrupted mobile video";
      await composerTextarea.fill(dismissedCaption);
      await chooseMessageMediaFile(page, videoFixture.resumablePath);
      const failedVideoStatus = messageScroll.locator(
        '[data-video-send-status="failed"]',
      );
      await expect(failedVideoStatus).toBeVisible({ timeout: 15_000 });
      await expect(failedVideoStatus).toContainText("Video upload interrupted");
      const failedVideoMessage = failedVideoStatus.locator(
        "xpath=ancestor::*[@data-message-id][1]",
      );
      const failedVideoMessageId = await failedVideoMessage.getAttribute(
        "data-message-id",
      );
      expect(failedVideoMessageId).toBeTruthy();
      await failedVideoStatus
        .getByRole("button", { name: "Remove" })
        .click();
      await expect(failedVideoStatus).toHaveCount(0);
      await expect(failedVideoMessage).toHaveCount(0);
      await expect(composerTextarea).toHaveValue(dismissedCaption);
      const { count: dismissedMessageCount } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
        .eq("id", String(failedVideoMessageId));
      expect(dismissedMessageCount ?? 0).toBe(0);
      expect(
        await page.evaluate(
          ({ profileId, currentConversationId, messageId }) => {
            const rawPendingDrafts = window.localStorage.getItem(
              `pa_message_pending_drafts:v1:${profileId}:${currentConversationId}`,
            );

            return rawPendingDrafts?.includes(messageId) ?? false;
          },
          {
            profileId: auPair.id,
            currentConversationId: conversationId,
            messageId: String(failedVideoMessageId),
          },
        ),
      ).toBe(false);
      await page.unroute(resumableUploadPattern);
    }

    const verifiesCompressedVideoRetry =
      testInfo.project.name === "chromium" && videoFixture.shouldCompress;
    let compressedVideoPostCount = 0;
    let failedCompressedVideoPost = false;

    if (verifiesCompressedVideoRetry) {
      await page.evaluate(() => {
        const testWindow = window as Window &
          typeof globalThis & {
            __paCompressedFileCreationCount?: number;
            __paOriginalFileConstructor?: typeof File;
          };
        const OriginalFile = window.File;

        testWindow.__paCompressedFileCreationCount = 0;
        testWindow.__paOriginalFileConstructor = OriginalFile;
        const CountingFile = new Proxy(OriginalFile, {
          construct(target, argumentsList) {
            const [fileBits, fileName, options] = argumentsList as [
              BlobPart[],
              string,
              FilePropertyBag | undefined,
            ];
            const file = new target(fileBits, fileName, options);

            if (file.name.endsWith("-compressed.mp4")) {
              testWindow.__paCompressedFileCreationCount =
                (testWindow.__paCompressedFileCreationCount ?? 0) + 1;
            }

            return file;
          },
        });

        Object.defineProperty(window, "File", {
          configurable: true,
          value: CountingFile,
          writable: true,
        });
      });

      await page.route(resumableUploadPattern, async (route) => {
        if (route.request().method() === "POST") {
          compressedVideoPostCount += 1;

          if (!failedCompressedVideoPost) {
            failedCompressedVideoPost = true;
            await route.fulfill({
              status: 400,
              contentType: "application/json",
              body: JSON.stringify({
                statusCode: "400",
                error: "Bad Request",
                message: "Synthetic compressed video interruption",
              }),
            });
            return;
          }
        }

        await route.continue();
      });
    }

    await composerTextarea.fill("Compressed video message");
    await chooseMessageMediaFile(page, videoFixture.path);
    const videoPreview = page.locator('[data-photo-preview-card="true"]');
    await expect(videoPreview).toHaveCount(0);
    const compressedVideoOptimisticMessage = messageScroll
      .locator('[data-message-optimistic="true"]')
      .last();
    const videoSendStatus = compressedVideoOptimisticMessage.locator(
      "[data-video-send-status]",
    );
    await expect(videoSendStatus).toBeVisible();
    await expect(videoSendStatus).toContainText(
      /Preparing video|Uploading video/,
    );
    await expect(composerTextarea).toBeEnabled();
    await expect(
      composer.getByRole("button", { name: "Attach media" }),
    ).toBeEnabled();
    await composerTextarea.fill("Text during video upload");
    await composer.getByRole("button", { name: "Send" }).click();
    await expect(composerTextarea).toHaveValue("");

    if (verifiesCompressedVideoRetry) {
      const failedCompressedVideoStatus = messageScroll.locator(
        '[data-video-send-status="failed"]',
      );
      await expect(failedCompressedVideoStatus).toBeVisible({ timeout: 60_000 });
      expect(
        await page.evaluate(
          () =>
            (
              window as Window & {
                __paCompressedFileCreationCount?: number;
              }
            ).__paCompressedFileCreationCount ?? 0,
        ),
      ).toBe(1);
      await failedCompressedVideoStatus
        .getByRole("button", { name: "Try again" })
        .click();
    }

    await expect
      .poll(async () => {
        const { count } = await admin
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conversationId)
          .eq("body", "Text during video upload");

        return count ?? 0;
      }, { timeout: 15_000 })
      .toBe(1);

    await expect
      .poll(async () => {
        const { data } = await admin
          .from("messages")
          .select("video_path, video_mime_type, video_size_bytes")
          .eq("conversation_id", conversationId)
          .eq("body", "Compressed video message")
          .maybeSingle();

        return data;
      }, { timeout: 60_000 })
      .toMatchObject({
        video_mime_type: videoFixture.mimeType,
      });

    if (verifiesCompressedVideoRetry) {
      expect(compressedVideoPostCount).toBe(2);
      expect(
        await page.evaluate(() => {
          const testWindow = window as Window &
            typeof globalThis & {
              __paCompressedFileCreationCount?: number;
              __paOriginalFileConstructor?: typeof File;
            };
          const compressedFileCreationCount =
            testWindow.__paCompressedFileCreationCount ?? 0;

          if (testWindow.__paOriginalFileConstructor) {
            Object.defineProperty(window, "File", {
              configurable: true,
              value: testWindow.__paOriginalFileConstructor,
              writable: true,
            });
          }

          delete testWindow.__paCompressedFileCreationCount;
          delete testWindow.__paOriginalFileConstructor;
          return compressedFileCreationCount;
        }),
      ).toBe(1);
      await page.unroute(resumableUploadPattern);
    }

    const { data: compressedVideoMessage } = await admin
      .from("messages")
      .select("video_path, video_size_bytes")
      .eq("conversation_id", conversationId)
      .eq("body", "Compressed video message")
      .single();

    expect(compressedVideoMessage?.video_path).toBeTruthy();
    const storedVideoSize = Number(
      compressedVideoMessage?.video_size_bytes ?? 0,
    );
    if (videoFixture.shouldCompress) {
      expect(storedVideoSize).toBeLessThan(videoFixture.byteLength * 0.92);
    } else {
      expect(storedVideoSize).toBe(videoFixture.byteLength);
    }

    await expect(videoSendStatus).toHaveCount(0);
    const sentVideo = messageScroll
      .getByText("Compressed video message", { exact: true })
      .locator("..")
      .locator('[data-message-video="true"]');
    const targetVideoRequestCount = () =>
      privateMessageVideoRequests.filter((url) =>
        url.includes(String(compressedVideoMessage?.video_path)),
      ).length;
    await expect(sentVideo).toBeVisible();
    await page.waitForTimeout(750);
    expect(targetVideoRequestCount()).toBe(0);
    const videoDeliveryResponse = page.waitForResponse(
      (response) =>
        response.url().includes(String(compressedVideoMessage?.video_path)),
      { timeout: 15_000 },
    );
    await sentVideo.evaluate(async (video: HTMLVideoElement) => {
      video.muted = true;
      video.load();
      await video.play();
    });
    expect([200, 206]).toContain((await videoDeliveryResponse).status());
    await expectVisibleVideoFrame(sentVideo);
    await sentVideo.evaluate((video: HTMLVideoElement) => video.pause());
    await expect
      .poll(targetVideoRequestCount)
      .toBeGreaterThan(0);
    await expect
      .poll(async () => {
        const requestCount = targetVideoRequestCount();
        await page.waitForTimeout(400);
        return targetVideoRequestCount() === requestCount;
      }, { timeout: 5_000 })
      .toBe(true);

    const requestsBeforeOpeningMedia = targetVideoRequestCount();
    await page.getByRole("button", { name: "Media", exact: true }).click();
    const mediaDialog = page.getByRole("dialog", {
      name: "Media",
      exact: true,
    });
    await expect(mediaDialog).toBeVisible();
    const mediaGalleryImages = mediaDialog.locator(
      '[data-conversation-media-image="true"]',
    );
    await expect(mediaGalleryImages.first()).toBeVisible();
    await expect
      .poll(() =>
        mediaGalleryImages.evaluateAll((images: HTMLImageElement[]) =>
          images.every((image) => image.complete && image.naturalWidth > 0),
        ),
      )
      .toBe(true);
    const mediaGalleryVideo = mediaDialog
      .locator('[data-conversation-media-video="true"]')
      .first();
    await expect(mediaGalleryVideo).toBeVisible();
    await page.waitForTimeout(750);
    expect(targetVideoRequestCount()).toBe(requestsBeforeOpeningMedia);
    await mediaGalleryVideo.locator("..").click();
    const openedMediaVideo = page
      .getByRole("dialog", { name: "Media", exact: true })
      .last()
      .locator("video");
    await expect(openedMediaVideo).toBeVisible();
    await expectVisibleVideoFrame(openedMediaVideo);
    await page
      .getByRole("button", { name: "Close media" })
      .last()
      .click();
    await mediaDialog.getByRole("button", { name: "Close media" }).click();
    await expect(mediaDialog).toHaveCount(0);

    await expect
      .poll(async () => {
        const { data } = await admin
          .from("messages")
          .select("body")
          .eq("conversation_id", conversationId)
          .in("body", ["Compressed video message", "Text during video upload"])
          .order("order_key", { ascending: true });

        return data?.map((message) => message.body) ?? [];
      }, { timeout: 30_000 })
      .toEqual(["Compressed video message", "Text during video upload"]);

    const { data: videoDeliveryOrder } = await admin
      .from("messages")
      .select("body, created_at, sent_at, order_key")
      .eq("conversation_id", conversationId)
      .in("body", ["Compressed video message", "Text during video upload"]);
    const compressedVideoRow = videoDeliveryOrder?.find(
      (message) => message.body === "Compressed video message",
    );
    const concurrentTextRow = videoDeliveryOrder?.find(
      (message) => message.body === "Text during video upload",
    );

    expect(Number(compressedVideoRow?.order_key)).toBeLessThan(
      Number(concurrentTextRow?.order_key),
    );
    expect(
      new Date(compressedVideoRow?.sent_at ?? 0).getTime(),
    ).toBeLessThanOrEqual(
      new Date(concurrentTextRow?.sent_at ?? 0).getTime(),
    );
    expect(
      new Date(concurrentTextRow?.created_at ?? 0).getTime(),
    ).toBeLessThan(
      new Date(compressedVideoRow?.created_at ?? 0).getTime(),
    );

    const { data: signedVideo } = await admin.storage
      .from("message-videos")
      .createSignedUrl(compressedVideoMessage?.video_path ?? "", 60);

    if (!signedVideo?.signedUrl) {
      throw new Error("Could not create a signed URL for compressed video QA.");
    }

    const compressedVideoMetadata = await page.evaluate(async (videoUrl) => {
      const video = document.createElement("video");
      video.preload = "metadata";

      return new Promise<{ duration: number; height: number; width: number }>(
        (resolve, reject) => {
          const timeout = window.setTimeout(
            () => reject(new Error("Compressed video metadata timed out.")),
            10_000,
          );

          video.addEventListener(
            "loadedmetadata",
            () => {
              window.clearTimeout(timeout);
              resolve({
                duration: video.duration,
                height: video.videoHeight,
                width: video.videoWidth,
              });
            },
            { once: true },
          );
          video.addEventListener(
            "error",
            () => {
              window.clearTimeout(timeout);
              reject(new Error("Compressed video is not playable."));
            },
            { once: true },
          );
          video.src = videoUrl;
        },
      );
    }, signedVideo.signedUrl);

    expect(
      Math.max(compressedVideoMetadata.width, compressedVideoMetadata.height),
    ).toBeLessThanOrEqual(1280);
    // Firefox's canvas MediaRecorder fixture can expose only the final MP4
    // fragment duration after conversion. Real uploaded files are not produced
    // by this browser-only fixture, so keep Firefox focused on readability and
    // dimensions while the other projects verify the generated duration.
    expect(compressedVideoMetadata.duration).toBeGreaterThan(
      testInfo.project.name === "firefox" ? 0 : 3,
    );
    if (videoFixture.shouldCompress) {
      expect(compressedVideoMetadata.duration).toBeLessThan(6);
    }
  } finally {
    for (const profileId of [auPair?.id, family?.id]) {
      if (!profileId) {
        continue;
      }

      const { data: photos } = await admin
        .from("profile_photos")
        .select("storage_path")
        .eq("profile_id", profileId);
      const photoPaths = photos?.map((photo) => photo.storage_path) ?? [];

      if (photoPaths.length > 0) {
        await admin.storage.from("profile-photos").remove(photoPaths);
      }
    }

    if (auPair?.id) {
      const { data: verificationRequests } = await admin
        .from("profile_verification_requests")
        .select("selfie_path")
        .eq("profile_id", auPair.id);
      const verificationSelfiePaths =
        verificationRequests
          ?.map((request) => request.selfie_path)
          .filter((path): path is string => Boolean(path)) ?? [];

      if (verificationSelfiePaths.length > 0) {
        await admin.storage
          .from("verification-selfies")
          .remove(verificationSelfiePaths);
      }

      const { data: stories } = await admin
        .from("profile_stories")
        .select("storage_path")
        .eq("profile_id", auPair.id);
      const storyPaths = stories?.map((story) => story.storage_path) ?? [];

      if (storyPaths.length > 0) {
        await admin.storage.from("profile-stories").remove(storyPaths);
      }
    }

    if (conversationId) {
      const { data: messages } = await admin
        .from("messages")
        .select("image_path, video_path")
        .eq("conversation_id", conversationId);
      const messagePaths =
        messages
          ?.map((message) => message.image_path)
          .filter((path): path is string => Boolean(path)) ?? [];

      if (messagePaths.length > 0) {
        await admin.storage.from("message-photos").remove(messagePaths);
      }

      const messageVideoPaths =
        messages
          ?.map((message) => message.video_path)
          .filter((path): path is string => Boolean(path)) ?? [];

      if (messageVideoPaths.length > 0) {
        await admin.storage.from("message-videos").remove(messageVideoPaths);
      }

      await admin.from("messages").delete().eq("conversation_id", conversationId);
      await admin.from("conversations").delete().eq("id", conversationId);
    }

    if (auPair?.id) {
      await admin.from("profile_stories").delete().eq("profile_id", auPair.id);
      await admin.from("profile_photos").delete().eq("profile_id", auPair.id);
      await admin.from("profiles").delete().eq("id", auPair.id);
      await admin.auth.admin.deleteUser(auPair.id);
    }

    if (family?.id) {
      await admin.from("profiles").delete().eq("id", family.id);
      await admin.auth.admin.deleteUser(family.id);
    }
  }
});
