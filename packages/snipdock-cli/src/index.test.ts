import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

const cliModule = await import("./index.ts");
const {
  dataDirPath,
  discoverEndpoint,
  postJson,
  runCliCommand,
  showHelp,
  showVersion,
} = cliModule as unknown as {
  dataDirPath: () => string;
  discoverEndpoint: () => { token: string; port: number } | null;
  postJson: (
    endpoint: { token: string; port: number },
    path: string,
    body: Record<string, unknown>,
  ) => Promise<unknown>;
  runCliCommand: (
    argv: string[],
    deps?: { discover: () => { token: string; port: number } | null },
  ) => Promise<number>;
  showHelp: () => void;
  showVersion: () => void;
};

let tempDir: string;
let originalEnv: Record<string, string | undefined>;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "snipdock-cli-test-"));
  originalEnv = {
    APPDATA: process.env.APPDATA,
    XDG_DATA_HOME: process.env.XDG_DATA_HOME,
    HOME: process.env.HOME,
  };
  if (process.platform === "win32") {
    process.env.APPDATA = tempDir;
  } else {
    process.env.XDG_DATA_HOME = tempDir;
    process.env.HOME = tempDir;
  }
});

afterEach(() => {
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

function seedEndpoint(token: string, port: number) {
  const dir = dataDirPath();
  writeFileSync(join(dir, "cli-token"), token);
  writeFileSync(join(dir, "cli-port"), String(port));
}

describe("dataDirPath", () => {
  it("returns the platform-specific SnipDock data directory", () => {
    if (process.platform === "win32") {
      expect(dataDirPath()).toBe(join(tempDir, "com.snipdock.app"));
    } else if (process.platform === "darwin") {
      expect(dataDirPath()).toBe(join(tempDir, "Library", "Application Support", "com.snipdock.app"));
    } else {
      expect(dataDirPath()).toBe(join(tempDir, "com.snipdock.app"));
    }
  });
});

describe("discoverEndpoint", () => {
  it("returns null when the token file is missing", () => {
    expect(discoverEndpoint()).toBeNull();
  });

  it("returns null when the port file is missing", () => {
    const dir = dataDirPath();
    writeFileSync(join(dir, "cli-token"), "abc");
    expect(discoverEndpoint()).toBeNull();
  });

  it("returns the token and port when both files are present", () => {
    seedEndpoint("abc123", 4567);
    expect(discoverEndpoint()).toEqual({ token: "abc123", port: 4567 });
  });

  it("returns null when the port is not a number", () => {
    const dir = dataDirPath();
    writeFileSync(join(dir, "cli-token"), "abc");
    writeFileSync(join(dir, "cli-port"), "not-a-port");
    expect(discoverEndpoint()).toBeNull();
  });

  it("rejects a port file that is not a plain in-range port number", () => {
    for (const portText of ["123junk", "1.5", "0", "65536", ""]) {
      seedEndpoint("abc123", portText as unknown as number);
      expect(discoverEndpoint()).toBeNull();
    }
  });

  it("trims whitespace around the token and port", () => {
    const dir = dataDirPath();
    writeFileSync(join(dir, "cli-token"), "  abc123  \n");
    writeFileSync(join(dir, "cli-port"), "  4567  \n");
    expect(discoverEndpoint()).toEqual({ token: "abc123", port: 4567 });
  });
});

describe("runCliCommand", () => {
  function fakeEndpoint(): { token: string; port: number } {
    return { token: "test-token", port: 12345 };
  }

  it("prints the help text and exits zero", async () => {
    let captured = "";
    const spy = spyOn(console, "log").mockImplementation((...args) => {
      captured += args.join(" ");
    });
    const code = await runCliCommand(["help"]);
    spy.mockRestore();
    expect(code).toBe(0);
    expect(captured).toContain("SnipDock CLI");
    expect(captured).toContain("pin <id>");
  });

  it("rejects pin without an id", async () => {
    const errors: string[] = [];
    const spy = spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.join(" "));
    });
    const code = await runCliCommand(["pin"]);
    spy.mockRestore();
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("Usage: snipdock pin <id>");
  });

  it("rejects tag without an id or name", async () => {
    const errors: string[] = [];
    const spy = spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.join(" "));
    });
    const code = await runCliCommand(["tag"]);
    spy.mockRestore();
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("Usage: snipdock tag <id> <tag>");
  });

  it("rejects search without a query", async () => {
    const errors: string[] = [];
    const spy = spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.join(" "));
    });
    const code = await runCliCommand(["search"]);
    spy.mockRestore();
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("Usage: snipdock search <query>");
  });

  it("rejects paste without an id", async () => {
    const errors: string[] = [];
    const spy = spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.join(" "));
    });
    const code = await runCliCommand(["paste"]);
    spy.mockRestore();
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("Usage: snipdock paste <id>");
  });

  it("rejects export without a path", async () => {
    const errors: string[] = [];
    const spy = spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.join(" "));
    });
    const code = await runCliCommand(["export"]);
    spy.mockRestore();
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("Usage: snipdock export <path>");
  });

  it("reports the not-running error when the token file is missing", async () => {
    const errors: string[] = [];
    const spy = spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.join(" "));
    });
    const code = await runCliCommand(["pin", "abc"]);
    spy.mockRestore();
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("snipdock run");
  });

  it("posts to the /pin endpoint with the bearer token", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url, init) => {
      calls.push({ url: url.toString(), init });
      return new Response(JSON.stringify({ item: { id: "abc" } }), { status: 200 });
    }) as typeof fetch;
    const logs: string[] = [];
    const spy = spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });
    try {
      const code = await runCliCommand(["pin", "abc"], { discover: () => fakeEndpoint() });
      expect(code).toBe(0);
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("http://127.0.0.1:12345/pin");
      const headers = (calls[0].init?.headers ?? {}) as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer test-token");
      const body = JSON.parse(calls[0].init?.body as string);
      expect(body).toEqual({ id: "abc" });
      expect(logs.join("\n")).toContain("pinned abc");
    } finally {
      globalThis.fetch = realFetch;
      spy.mockRestore();
    }
  });

  it("joins multi-word search arguments into the query", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url, init) => {
      calls.push({ url: url.toString(), init });
      return new Response(JSON.stringify({ ids: ["x"], total: 1 }), { status: 200 });
    }) as typeof fetch;
    const logs: string[] = [];
    const spy = spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });
    try {
      const code = await runCliCommand(
        ["search", "alpha", "beta", "gamma"],
        { discover: () => fakeEndpoint() },
      );
      expect(code).toBe(0);
      const body = JSON.parse(calls[0].init?.body as string);
      expect(body.query).toBe("alpha beta gamma");
      expect(logs.join("\n")).toContain("x");
    } finally {
      globalThis.fetch = realFetch;
      spy.mockRestore();
    }
  });

  it("prints the not-found error from the server", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({ error: { code: "not_found", message: "missing" } }),
        { status: 404 },
      ),
    ) as typeof fetch;
    const errors: string[] = [];
    const spy = spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.join(" "));
    });
    try {
      const code = await runCliCommand(
        ["pin", "abc"],
        { discover: () => fakeEndpoint() },
      );
      expect(code).toBe(1);
      expect(errors.join("\n")).toContain("item not found");
    } finally {
      globalThis.fetch = realFetch;
      spy.mockRestore();
    }
  });

  it("returns non-zero for unknown commands", async () => {
    const errors: string[] = [];
    const spy = spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.join(" "));
    });
    const code = await runCliCommand(["nope"]);
    spy.mockRestore();
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("Unknown command: nope");
  });
});

describe("postJson", () => {
  it("rejects on non-2xx with a structured error", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({ error: { code: "validation", message: "bad" } }),
        { status: 400 },
      ),
    ) as typeof fetch;
    try {
      await expect(
        postJson({ token: "abc", port: 1 }, "/pin", { id: "x" }),
      ).rejects.toEqual({ code: "validation", message: "bad" });
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("help and version", () => {
  it("showHelp lists every subcommand", () => {
    let captured = "";
    const spy = spyOn(console, "log").mockImplementation((...args) => {
      captured += args.join(" ");
    });
    showHelp();
    spy.mockRestore();
    for (const command of [
      "install", "run", "update", "uninstall", "version", "help",
      "pin", "unpin", "favorite", "unfavorite", "tag",
      "search", "paste", "export",
    ]) {
      expect(captured).toContain(command);
    }
  });

  it("showVersion prints the package version", () => {
    let captured = "";
    const spy = spyOn(console, "log").mockImplementation((...args) => {
      captured += args.join(" ");
    });
    showVersion();
    spy.mockRestore();
    expect(captured).toMatch(/snipdock v\d/);
  });
});
