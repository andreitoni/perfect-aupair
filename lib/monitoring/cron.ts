import "server-only";

type CronMonitorStatus = "start" | "success" | "failure";

function jobEnvKey(jobName: string) {
  return jobName.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function monitorUrlFor(jobName: string, status: CronMonitorStatus) {
  const key = jobEnvKey(jobName);
  const statusUrl = process.env[`CRON_MONITOR_${key}_${status.toUpperCase()}_URL`];

  if (statusUrl) {
    return statusUrl;
  }

  if (status === "success") {
    return process.env[`CRON_MONITOR_${key}_URL`] ?? "";
  }

  return "";
}

export async function pingCronMonitor(
  jobName: string,
  status: CronMonitorStatus,
) {
  const url = monitorUrlFor(jobName, status);

  if (!url) {
    return;
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      console.warn("Cron monitor ping returned a non-success status.", {
        jobName,
        status,
        statusCode: response.status,
      });
      return false;
    }

    return true;
  } catch (error) {
    console.warn("Cron monitor ping failed.", {
      jobName,
      status,
      reason:
        error instanceof Error && error.name === "TimeoutError"
          ? "timeout"
          : "request_failed",
    });
    return false;
  }
}

export async function runMonitoredCronJob<T>(
  jobName: string,
  handler: () => Promise<T>,
) {
  await pingCronMonitor(jobName, "start");

  try {
    const result = await handler();
    await pingCronMonitor(jobName, "success");
    return result;
  } catch (error) {
    await pingCronMonitor(jobName, "failure");
    throw error;
  }
}
