type BrowserStorageName = "localStorage" | "sessionStorage";

function getBrowserStorage(name: BrowserStorageName) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window[name];
  } catch {
    return null;
  }
}

export function readBrowserStorage(
  name: BrowserStorageName,
  key: string,
) {
  const storage = getBrowserStorage(name);

  if (!storage) {
    return null;
  }

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function writeBrowserStorage(
  name: BrowserStorageName,
  key: string,
  value: string,
) {
  const storage = getBrowserStorage(name);

  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, value);
  } catch {
    // Web Storage is optional and may be blocked in private or in-app browsers.
  }
}

export function removeBrowserStorage(
  name: BrowserStorageName,
  key: string,
) {
  const storage = getBrowserStorage(name);

  if (!storage) {
    return;
  }

  try {
    storage.removeItem(key);
  } catch {
    // Cleanup must never block authentication redirects.
  }
}
