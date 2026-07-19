process.env.JUDGE0_URL = "http://localhost:2358";
process.env.JUDGE0_AUTH_TOKEN = "test-token";

import { runSubmission, Judge0UnavailableError } from "./client";

function fakeJudge0Response(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      status: { id: 3, description: "Accepted" },
      stdout: Buffer.from("ok").toString("base64"),
      stderr: null,
      compile_output: null,
      message: null,
      time: "0.01",
      memory: 1000,
      ...overrides,
    }),
  };
}

describe("runSubmission", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  // Regression guard: these values must never be derived from anything a
  // caller controls (RunOptions has no field for them) — see AQ-6's
  // finding that unbounded resource limits would be the highest-severity
  // bug in this file.
  it("always sends server-controlled resource limits, not caller-controlled ones", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(fakeJudge0Response());

    await runSubmission({ sourceCode: "print(1)", languageId: 71 });

    const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(requestInit.body);

    expect(body.cpu_time_limit).toBe(2);
    expect(body.wall_time_limit).toBe(5);
    expect(body.memory_limit).toBe(128_000);
    expect(body.max_file_size).toBe(1_024);
  });

  it("base64-encodes source, stdin, and expected_output", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(fakeJudge0Response());

    await runSubmission({
      sourceCode: "print(1)",
      languageId: 71,
      stdin: "in",
      expectedOutput: "out",
    });

    const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(requestInit.body);

    expect(Buffer.from(body.source_code, "base64").toString()).toBe("print(1)");
    expect(Buffer.from(body.stdin, "base64").toString()).toBe("in");
    expect(Buffer.from(body.expected_output, "base64").toString()).toBe("out");
  });

  it("decodes the response and maps snake_case to camelCase", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      fakeJudge0Response({ stdout: Buffer.from("hello").toString("base64") }),
    );

    const result = await runSubmission({ sourceCode: "x", languageId: 71 });

    expect(result.stdout).toBe("hello");
    expect(result.statusId).toBe(3);
  });

  it("throws Judge0UnavailableError when fetch itself fails", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(runSubmission({ sourceCode: "x", languageId: 71 })).rejects.toBeInstanceOf(
      Judge0UnavailableError,
    );
  });

  it("throws Judge0UnavailableError on a non-2xx response", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });

    await expect(runSubmission({ sourceCode: "x", languageId: 71 })).rejects.toBeInstanceOf(
      Judge0UnavailableError,
    );
  });
});
