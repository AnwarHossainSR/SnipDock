import { describe, expect, test } from "bun:test";
import {
  detectFormat,
  formatEnv,
  formatEnvLine,
  isPortableKey,
  keyProblem,
  looksSecret,
  parseEnvText,
  valueKind,
} from "./envFormat";

const pairs = (text: string) =>
  parseEnvText(text).entries.map(({ key, value }) => [key, value]);

describe(".env parsing", () => {
  test("reads KEY=value lines and skips comments and blanks", () => {
    const text = [
      "# database",
      "DATABASE_URL=postgres://localhost/app",
      "",
      "PORT=8080   # inline comment",
      "HASH=abc#def",
      "EMPTY=",
    ].join("\n");
    expect(pairs(text)).toEqual([
      ["DATABASE_URL", "postgres://localhost/app"],
      ["PORT", "8080"],
      ["HASH", "abc#def"],
      ["EMPTY", ""],
    ]);
    expect(parseEnvText(text).errors).toEqual([]);
  });

  test("honours single, double and multi-line quotes", () => {
    const text = [
      "SINGLE='keep $HOME \\n literal'",
      'DOUBLE="tab\\there \\"quoted\\""',
      'PEM="-----BEGIN KEY-----',
      "abc",
      '-----END KEY-----"',
      "SPACED='  padded  '",
      "AFTER=1",
    ].join("\n");
    expect(pairs(text)).toEqual([
      ["SINGLE", "keep $HOME \\n literal"],
      ["DOUBLE", 'tab\there "quoted"'],
      ["PEM", "-----BEGIN KEY-----\nabc\n-----END KEY-----"],
      ["SPACED", "  padded  "],
      ["AFTER", "1"],
    ]);
  });

  test("KEY: value keeps an = that belongs to the value", () => {
    expect(pairs("DATABASE_URL: postgres://db/app?sslmode=require")).toEqual([
      ["DATABASE_URL", "postgres://db/app?sslmode=require"],
    ]);
    // An = before any colon is still the separator.
    expect(pairs("TIME=12: 30")).toEqual([["TIME", "12: 30"]]);
  });

  test("accepts export, set, $env: and KEY: value forms", () => {
    expect(pairs("export A=1\nset B=2\n$env:C = 'three'\nD: four")).toEqual([
      ["A", "1"],
      ["B", "2"],
      ["C", "three"],
      ["D", "four"],
    ]);
  });

  test("reports bad lines by number and keeps the good ones", () => {
    const result = parseEnvText("GOOD=1\nnot a pair\nBAD KEY=2\nOPEN=\"never closed\nLATER=3");
    expect(result.entries.map((entry) => entry.key)).toEqual(["GOOD"]);
    expect(result.errors.map((error) => error.line)).toEqual([2, 3, 4]);
  });

  test("a repeated key keeps its last value", () => {
    expect(pairs("A=1\nB=2\nA=3")).toEqual([
      ["A", "3"],
      ["B", "2"],
    ]);
  });

  test("handles Windows line endings", () => {
    expect(pairs("A=1\r\nB=2\r\n")).toEqual([
      ["A", "1"],
      ["B", "2"],
    ]);
  });
});

describe("JSON parsing", () => {
  test("reads an object, keeping nested values as JSON text", () => {
    const result = parseEnvText('{"PORT": 8080, "DEBUG": false, "NAME": "api", "NULL": null, "FLAGS": {"beta": true}, "HOSTS": ["a", "b"]}');
    expect(result.format).toBe("json");
    expect(result.entries.map(({ key, value }) => [key, value])).toEqual([
      ["PORT", "8080"],
      ["DEBUG", "false"],
      ["NAME", "api"],
      ["NULL", ""],
      ["FLAGS", '{"beta":true}'],
      ["HOSTS", '["a","b"]'],
    ]);
  });

  test("reads the name/value array hosting dashboards export", () => {
    expect(pairs('[{"name": "A", "value": "1"}, {"key": "B", "value": 2}]')).toEqual([
      ["A", "1"],
      ["B", "2"],
    ]);
  });

  test("explains what it could not read", () => {
    expect(parseEnvText("[1, 2]", "json").errors[0].message).toContain("name");
    expect(parseEnvText('"just a string"', "json").errors[0].message).toContain("object");
    expect(parseEnvText("{oops", "json").errors[0].message).toContain("Not valid JSON");
    expect(parseEnvText('{"BAD KEY": 1, "OK": 2}').errors).toHaveLength(1);
  });

  test("auto-detects JSON only when the text is a JSON document", () => {
    expect(detectFormat('  {"A": 1}  ')).toBe("json");
    expect(detectFormat("{A=1")).toBe("dotenv");
    expect(detectFormat("A=1")).toBe("dotenv");
  });
});

describe("exporting", () => {
  const vars = [
    { key: "PORT", value: "8080" },
    { key: "GREETING", value: "hello world" },
    { key: "QUOTE", value: "it's" },
    { key: "PEM", value: "line one\nline two" },
    { key: "EMPTY", value: "" },
  ];

  test(".env quotes only what needs it, and reads back unchanged", () => {
    const text = formatEnv(vars, "dotenv");
    expect(text).toBe(
      [
        "PORT=8080",
        "GREETING='hello world'",
        'QUOTE="it\'s"',
        'PEM="line one\\nline two"',
        "EMPTY=''",
      ].join("\n"),
    );
    expect(parseEnvText(text).entries.map(({ key, value }) => ({ key, value }))).toEqual(vars);
  });

  test("JSON, shell, PowerShell and YAML", () => {
    expect(JSON.parse(formatEnv(vars, "json"))).toEqual(Object.fromEntries(vars.map((v) => [v.key, v.value])));
    expect(formatEnv([vars[2]], "shell")).toBe("export QUOTE='it'\\''s'");
    expect(formatEnv([vars[0], vars[1]], "shell")).toBe("export PORT=8080\nexport GREETING='hello world'");
    expect(formatEnv([vars[2]], "powershell")).toBe("$env:QUOTE = 'it''s'");
    expect(formatEnv([{ key: "my-key", value: "v" }], "powershell")).toBe("${env:my-key} = 'v'");
    expect(formatEnv([vars[3], { key: "has space", value: "x" }], "yaml")).toBe(
      'PEM: "line one\\nline two"\n"has space": "x"',
    );
  });

  test("every format but JSON reads back in with its values intact", () => {
    const tricky = [
      ...vars,
      { key: "QUERY", value: "postgres://db/app?sslmode=require&a=b" },
      { key: "WIN_PATH", value: "C:\\tools\\bin" },
      { key: "LITERAL", value: "$HOME and ${PATH}" },
      { key: "APOSTROPHES", value: "'quoted' and it's" },
    ];
    for (const format of ["dotenv", "shell", "powershell", "yaml"] as const) {
      const result = parseEnvText(formatEnv(tricky, format));
      expect({ format, errors: result.errors }).toEqual({ format, errors: [] });
      expect(result.entries.map(({ key, value }) => ({ key, value }))).toEqual(tricky);
    }
  });

  test("PowerShell's braced form for a non-portable key reads back as that key", () => {
    const text = formatEnv([{ key: "my-key", value: "it's" }], "powershell");
    expect(pairs(text)).toEqual([["my-key", "it's"]]);
  });

  test("one variable as a KEY=value line", () => {
    expect(formatEnvLine({ key: "A", value: "b c" })).toBe("A='b c'");
  });
});

describe("helpers", () => {
  test("keyProblem mirrors the backend's rule", () => {
    expect(keyProblem("DATABASE_URL")).toBeNull();
    expect(keyProblem("server.port")).toBeNull();
    expect(keyProblem("")).not.toBeNull();
    expect(keyProblem("A B")).not.toBeNull();
    expect(keyProblem("A=B")).not.toBeNull();
    expect(keyProblem("K".repeat(257))).not.toBeNull();
  });

  test("portable keys are shell identifiers", () => {
    expect(isPortableKey("API_KEY_2")).toBe(true);
    expect(isPortableKey("2FA")).toBe(false);
    expect(isPortableKey("server.port")).toBe(false);
  });

  test("looksSecret catches names, credentialed URLs and PEM blocks", () => {
    for (const key of ["API_KEY", "GITHUB_TOKEN", "DB_PASSWORD", "STRIPE_SECRET", "JWT_SIGNING_KEY", "SENTRY_DSN"]) {
      expect(looksSecret(key)).toBe(true);
    }
    expect(looksSecret("PORT", "8080")).toBe(false);
    expect(looksSecret("NODE_ENV", "production")).toBe(false);
    expect(looksSecret("DATABASE_URL", "postgres://app:hunter2@db/app")).toBe(true);
    expect(looksSecret("REDIS_URL", "redis://:hunter2@cache:6379")).toBe(true);
    expect(looksSecret("DATABASE_URL", "postgres://db/app")).toBe(false);
    expect(looksSecret("DATABASE_URL", "postgres://db:5432/app")).toBe(false);
    expect(looksSecret("CERT", "-----BEGIN CERTIFICATE-----\n...")).toBe(true);
    expect(parseEnvText("API_TOKEN=x\nPORT=1").entries.map((entry) => entry.secret)).toEqual([true, false]);
  });

  test("valueKind names JSON documents, multi-line text and empties", () => {
    expect(valueKind('{"a": 1}')).toBe("json");
    expect(valueKind("[1, 2]")).toBe("json");
    expect(valueKind("42")).toBe("text");
    expect(valueKind("{not json")).toBe("text");
    expect(valueKind("a\nb")).toBe("multiline");
    expect(valueKind("")).toBe("empty");
  });
});
