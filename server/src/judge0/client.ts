import { env } from "../env";

// Must match (or stay within) the limits configured in judge0.conf.
const CPU_TIME_LIMIT_SECONDS = 2;
const WALL_TIME_LIMIT_SECONDS = 5;
const MEMORY_LIMIT_KB = 128_000;
const REQUEST_TIMEOUT_MS = 15_000;

export class Judge0UnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Judge0 is unavailable");
    this.cause = cause;
  }
}

export interface Judge0Result {
  statusId: number;
  statusDescription: string;
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  message: string | null;
  time: string | null;
  memory: number | null;
}

interface RunOptions {
  sourceCode: string;
  languageId: number;
  stdin?: string;
  expectedOutput?: string;
}

function toBase64(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64");
}

function fromBase64(value: string | null): string | null {
  return value ? Buffer.from(value, "base64").toString("utf-8") : null;
}

export async function runSubmission(options: RunOptions): Promise<Judge0Result> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${env.JUDGE0_URL}/submissions?base64_encoded=true&wait=true`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Judge0-Auth-Token": env.JUDGE0_AUTH_TOKEN,
      },
      body: JSON.stringify({
        source_code: toBase64(options.sourceCode),
        language_id: options.languageId,
        stdin: options.stdin ? toBase64(options.stdin) : undefined,
        expected_output: options.expectedOutput ? toBase64(options.expectedOutput) : undefined,
        cpu_time_limit: CPU_TIME_LIMIT_SECONDS,
        wall_time_limit: WALL_TIME_LIMIT_SECONDS,
        memory_limit: MEMORY_LIMIT_KB,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    throw new Judge0UnavailableError(error);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Judge0UnavailableError(`Judge0 responded with HTTP ${response.status}`);
  }

  const body = (await response.json()) as {
    status: { id: number; description: string };
    stdout: string | null;
    stderr: string | null;
    compile_output: string | null;
    message: string | null;
    time: string | null;
    memory: number | null;
  };

  return {
    statusId: body.status.id,
    statusDescription: body.status.description,
    stdout: fromBase64(body.stdout),
    stderr: fromBase64(body.stderr),
    compileOutput: fromBase64(body.compile_output),
    message: fromBase64(body.message),
    time: body.time,
    memory: body.memory,
  };
}
