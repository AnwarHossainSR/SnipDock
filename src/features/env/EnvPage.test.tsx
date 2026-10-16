import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "bun:test";
import type { InvokeArgs } from "@tauri-apps/api/core";
import type { EnvGroup, EnvVar, EnvVarEntry, Project, SaveEnvGroupInput, SaveEnvVarInput, SaveProjectInput } from "../../api/types";
import { mockTauri } from "../../test/setup";
import EnvPage from "./EnvPage";

const STAMP = "2026-10-15T10:00:00.000Z";

/** An in-memory stand-in for the Rust repository, enough for the page to
 *  round-trip through. Every call is recorded. */
function backend(
  initial: { groups?: { id: string; name: string; project_id?: string }[]; vars?: Partial<EnvVar>[]; projects?: { id: string; name: string }[] } = {},
) {
  const groups = (initial.groups ?? []).map((group, position) => ({
    ...group,
    project_id: group.project_id ?? (null as string | null),
    description: null as string | null,
    position,
  }));
  const project = (id: string, name: string): Project => ({
    id, name, description: null, archived_at: null, created_at: STAMP, updated_at: STAMP,
  });
  const projects = (initial.projects ?? []).map(({ id, name }) => project(id, name));
  let vars: EnvVar[] = (initial.vars ?? []).map((variable, position) => ({
    id: `var-${position}`,
    group_id: "g1",
    key: "KEY",
    value: "",
    secret: false,
    note: null,
    position,
    created_at: STAMP,
    updated_at: STAMP,
    ...variable,
  }));
  let nextId = 100;
  const calls: { command: string; args?: InvokeArgs }[] = [];

  const toGroup = (group: (typeof groups)[number]): EnvGroup => ({
    ...group,
    var_count: vars.filter((variable) => variable.group_id === group.id).length,
    secret_count: vars.filter((variable) => variable.group_id === group.id && variable.secret).length,
    created_at: STAMP,
    updated_at: STAMP,
  });

  mockTauri((command, args) => {
    calls.push({ command, args });
    const input = (args as { input?: unknown } | undefined)?.input;
    switch (command) {
      case "list_env_groups":
        return groups.map(toGroup);
      case "list_projects":
        return projects;
      case "save_project": {
        const created = project(`p${nextId++}`, (input as SaveProjectInput).name);
        projects.push(created);
        return created;
      }
      case "list_env_vars":
        return vars.filter((variable) => variable.group_id === (args as { groupId: string }).groupId);
      case "save_env_group": {
        const save = input as SaveEnvGroupInput;
        const group = {
          id: `g${nextId++}`,
          project_id: save.project_id ?? null,
          name: save.name,
          description: save.description ?? null,
          position: groups.length,
        };
        groups.push(group);
        return toGroup(group);
      }
      case "delete_env_group": {
        const id = (args as { id: string }).id;
        groups.splice(groups.findIndex((group) => group.id === id), 1);
        vars = vars.filter((variable) => variable.group_id !== id);
        return null;
      }
      case "save_env_var": {
        const save = input as SaveEnvVarInput;
        const variable: EnvVar = {
          id: save.id ?? `var-${nextId++}`,
          group_id: save.group_id,
          key: save.key,
          value: save.value,
          secret: save.secret,
          note: save.note ?? null,
          position: vars.length,
          created_at: STAMP,
          updated_at: STAMP,
        };
        vars = [...vars.filter((existing) => existing.id !== variable.id), variable];
        return variable;
      }
      case "delete_env_var":
        vars = vars.filter((variable) => variable.id !== (args as { id: string }).id);
        return null;
      case "restore_env_var": {
        const restored = (args as { variable: EnvVar }).variable;
        vars = [...vars, restored].sort((a, b) => a.position - b.position);
        return restored;
      }
      case "import_env_vars": {
        const { entries, group_id } = input as { entries: EnvVarEntry[]; group_id: string };
        for (const entry of entries) {
          vars.push({ ...entry, id: `var-${nextId++}`, group_id, note: null, position: vars.length, created_at: STAMP, updated_at: STAMP });
        }
        return { added: entries.length, updated: 0, skipped: 0 };
      }
      case "copy_text":
      case "read_clipboard_text":
        return null;
      default:
        throw new Error(`Unexpected command: ${command}`);
    }
  });

  return {
    calls,
    last: (command: string) => calls.filter((call) => call.command === command).at(-1)?.args,
  };
}

const production = { groups: [{ id: "g1", name: "api · production" }] };

describe("EnvPage", () => {
  beforeEach(() => {
    window.location.hash = "#env";
  });

  it("teaches what a set is when there are none, and creates the first", async () => {
    const server = backend();
    render(<EnvPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Create your first set" }));
    const dialog = await screen.findByRole("dialog", { name: "New variable set" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), { target: { value: " web · local " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create set" }));

    expect(await screen.findByRole("heading", { name: "web · local" })).toBeDefined();
    expect(server.last("save_env_group")).toEqual({ input: { id: null, project_id: null, name: "web · local", description: null } });
    expect(await screen.findByText("This set is empty")).toBeDefined();
  });

  it("lists a set's variables and keeps a secret out of the page until it is revealed", async () => {
    backend({
      ...production,
      vars: [
        { key: "PORT", value: "8080" },
        { key: "API_TOKEN", value: "tok_live_123", secret: true },
        { key: "FLAGS", value: '{"beta": true}' },
      ],
    });
    render(<EnvPage />);

    expect(await screen.findByText("8080")).toBeDefined();
    const list = screen.getByRole("list", { name: "Variables in api · production" });
    expect(within(list).getByText("JSON")).toBeDefined();
    expect(within(list).getByText("Secret")).toBeDefined();
    expect(document.body.textContent).not.toContain("tok_live_123");

    fireEvent.click(screen.getByRole("button", { name: "Reveal API_TOKEN" }));
    expect(screen.getByText("tok_live_123")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Hide API_TOKEN" }));
    expect(document.body.textContent).not.toContain("tok_live_123");

    fireEvent.click(screen.getByRole("button", { name: "Reveal secrets" }));
    expect(screen.getByText("tok_live_123")).toBeDefined();
  });

  it("filters by key and visible value, never by a hidden one", async () => {
    backend({
      ...production,
      vars: [
        { key: "PORT", value: "8080" },
        { key: "API_TOKEN", value: "needle", secret: true },
        { key: "HOST", value: "needle.example" },
      ],
    });
    render(<EnvPage />);
    await screen.findByText("8080");

    fireEvent.change(screen.getByRole("searchbox", { name: "Filter variables" }), { target: { value: "needle" } });
    const list = screen.getByRole("list", { name: "Variables in api · production" });
    expect(within(list).getByText("HOST")).toBeDefined();
    expect(within(list).queryByText("API_TOKEN")).toBeNull();
    expect(within(list).queryByText("PORT")).toBeNull();
  });

  it("copies one value, one KEY=value line, or the whole set in a chosen format", async () => {
    const server = backend({ ...production, vars: [{ key: "PORT", value: "8080" }, { key: "GREETING", value: "hi there" }] });
    render(<EnvPage />);
    await screen.findByText("8080");

    fireEvent.click(screen.getByRole("button", { name: "Copy value of GREETING" }));
    await waitFor(() => expect(server.last("copy_text")).toEqual({ text: "hi there" }));

    fireEvent.click(screen.getByRole("button", { name: "Copy GREETING as KEY=value" }));
    await waitFor(() => expect(server.last("copy_text")).toEqual({ text: "GREETING='hi there'" }));

    const formats = screen.getByRole("group", { name: "Copy the whole set as" });
    fireEvent.click(within(formats).getByRole("button", { name: "Shell" }));
    await waitFor(() =>
      expect(server.last("copy_text")).toEqual({ text: "export PORT=8080\nexport GREETING='hi there'" }),
    );
    expect(await screen.findByText("Copied 2 variables as Shell")).toBeDefined();
  });

  it("adds a variable, guessing that a token is secret", async () => {
    const server = backend(production);
    render(<EnvPage />);

    // The header's button; the empty set offers a second one.
    fireEvent.click((await screen.findAllByRole("button", { name: "Add variable" }))[0]);
    const dialog = await screen.findByRole("dialog", { name: "Add a variable" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Key" }), { target: { value: "GITHUB_TOKEN" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Value/ }), { target: { value: "ghp_abc\n" } });
    expect(within(dialog).getByRole("switch", { name: "Secret" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add variable" }));

    await waitFor(() =>
      expect(server.last("save_env_var")).toEqual({
        input: { id: null, group_id: "g1", key: "GITHUB_TOKEN", value: "ghp_abc\n", secret: true, note: null },
      }),
    );
    expect(await screen.findByText("GITHUB_TOKEN")).toBeDefined();
  });

  it("refuses a key no platform accepts before sending it", async () => {
    const server = backend(production);
    render(<EnvPage />);

    // The header's button; the empty set offers a second one.
    fireEvent.click((await screen.findAllByRole("button", { name: "Add variable" }))[0]);
    const dialog = await screen.findByRole("dialog", { name: "Add a variable" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Key" }), { target: { value: "TWO WORDS" } });

    expect(within(dialog).getByText(/cannot contain spaces/)).toBeDefined();
    expect((within(dialog).getByRole("button", { name: "Add variable" }) as HTMLButtonElement).disabled).toBe(true);
    expect(server.calls.some((call) => call.command === "save_env_var")).toBe(false);
  });

  it("imports a pasted .env file with a preview, keeping the secret guesses", async () => {
    const server = backend(production);
    render(<EnvPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Import .env or JSON" }));
    const dialog = await screen.findByRole("dialog", { name: /Import into/ });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Variables to import" }), {
      target: { value: "# app\nPORT=3000\nSTRIPE_SECRET='sk_test'\nbroken line" },
    });

    expect(within(dialog).getByText("2 variables read as .env · 1 marked secret")).toBeDefined();
    expect(within(dialog).getByText("Line 4: Expected KEY=value.")).toBeDefined();
    fireEvent.click(within(dialog).getByRole("button", { name: "Import 2" }));

    await waitFor(() =>
      expect(server.last("import_env_vars")).toEqual({
        input: {
          group_id: "g1",
          overwrite: false,
          entries: [
            { key: "PORT", value: "3000", secret: false },
            { key: "STRIPE_SECRET", value: "sk_test", secret: true },
          ],
        },
      }),
    );
    expect(await screen.findByText("Imported: 2 added")).toBeDefined();
    expect(await screen.findByText("3000")).toBeDefined();
  });

  it("deletes a variable and puts it back in its place on Undo", async () => {
    const server = backend({
      ...production,
      vars: [{ key: "HOST", value: "db" }, { key: "PORT", value: "8080", note: "public" }, { key: "USER", value: "app" }],
    });
    render(<EnvPage />);
    await screen.findByText("8080");

    fireEvent.click(screen.getByRole("button", { name: "Delete PORT" }));
    expect(await screen.findByText("Deleted PORT")).toBeDefined();
    await waitFor(() => expect(screen.queryByText("8080")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("8080")).toBeDefined();
    // The deleted row itself goes back - same id, place and creation time.
    expect(server.last("restore_env_var")).toEqual({
      variable: expect.objectContaining({ id: "var-1", key: "PORT", position: 1, note: "public" }),
    });
    const list = screen.getByRole("list", { name: "Variables in api · production" });
    expect([...list.querySelectorAll("li")].map((row) => row.textContent?.split(/\s/)[0])).toEqual([
      expect.stringContaining("HOST"),
      expect.stringContaining("PORT"),
      expect.stringContaining("USER"),
    ]);
  });

  it("says an empty value has nothing to copy instead of reporting a failure", async () => {
    const server = backend({ ...production, vars: [{ key: "DEBUG", value: "" }] });
    render(<EnvPage />);
    await screen.findByText("Empty");

    fireEvent.click(screen.getByRole("button", { name: "Copy value of DEBUG" }));
    expect(await screen.findByText("DEBUG is empty; nothing to copy")).toBeDefined();
    expect(server.calls.some((call) => call.command === "copy_text")).toBe(false);
  });

  it("names the variables a Shell copy had to leave out", async () => {
    const server = backend({ ...production, vars: [{ key: "PORT", value: "1" }, { key: "server.port", value: "2" }] });
    render(<EnvPage />);
    await screen.findByText("server.port");

    const formats = screen.getByRole("group", { name: "Copy the whole set as" });
    fireEvent.click(within(formats).getByRole("button", { name: "Shell" }));
    expect(await screen.findByText("Copied 1 variable as Shell; 1 left out (not a shell name)")).toBeDefined();
    expect(server.last("copy_text")).toEqual({ text: "export PORT=1\n# server.port is not a valid shell name; left out" });
  });

  it("shows the set it was moved to, even when the previous set answers last", async () => {
    let releaseFirst: (vars: EnvVar[]) => void = () => {};
    mockTauri((command, args) => {
      if (command === "list_env_groups") {
        return [
          { id: "g1", project_id: null, name: "slow", description: null, position: 0, var_count: 1, secret_count: 0, created_at: STAMP, updated_at: STAMP },
          { id: "g2", project_id: null, name: "fast", description: null, position: 1, var_count: 1, secret_count: 0, created_at: STAMP, updated_at: STAMP },
        ];
      }
      if (command === "list_projects") return [];
      if (command === "list_env_vars") {
        const variable = (group_id: string, key: string): EnvVar => ({
          id: key, group_id, key, value: key.toLowerCase(), secret: false, note: null, position: 0, created_at: STAMP, updated_at: STAMP,
        });
        if ((args as { groupId: string }).groupId === "g1") {
          return new Promise<EnvVar[]>((resolve) => { releaseFirst = () => resolve([variable("g1", "SLOW_KEY")]); });
        }
        return [variable("g2", "FAST_KEY")];
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    render(<EnvPage />);

    fireEvent.click(await screen.findByRole("button", { name: /^fast/ }));
    expect(await screen.findByText("FAST_KEY")).toBeDefined();
    releaseFirst([]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText("SLOW_KEY")).toBeNull();
    expect(screen.getByText("FAST_KEY")).toBeDefined();
  });

  it("asks before deleting a whole set", async () => {
    const server = backend({ ...production, vars: [{ key: "PORT", value: "8080" }] });
    render(<EnvPage />);
    await screen.findByText("8080");

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Delete “api · production”?" });
    expect(within(confirm).getByText(/Its 1 variable goes with it/)).toBeDefined();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete set" }));

    expect(await screen.findByText("No variable sets yet")).toBeDefined();
    expect(server.last("delete_env_group")).toEqual({ id: "g1" });
  });

  it("files sets under their projects, so two projects can each have a production", async () => {
    backend({
      projects: [{ id: "p1", name: "billing" }, { id: "p2", name: "acme-api" }],
      groups: [
        { id: "g1", name: "production", project_id: "p1" },
        { id: "g2", name: "production", project_id: "p2" },
        { id: "g3", name: "scratch" },
      ],
      vars: [{ key: "PORT", value: "8080" }],
    });
    render(<EnvPage />);
    await screen.findByText("8080");

    const nav = screen.getByRole("navigation", { name: "Variable sets" });
    // Projects by name, the unfiled sets last.
    expect(within(nav).getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["acme-api", "billing", "No project"]);
    expect(within(within(nav).getByRole("region", { name: "billing" })).getByRole("button", { name: /^production/ })).toBeDefined();
    expect(screen.getByRole("list", { name: "Variables in billing · production" })).toBeDefined();

    fireEvent.click(within(within(nav).getByRole("region", { name: "acme-api" })).getByRole("button", { name: /^production/ }));
    expect(await screen.findByRole("heading", { name: "production", level: 3 })).toBeDefined();
    expect(screen.getByRole("region", { name: "production" }).textContent).toContain("acme-api");
  });

  it("starts a new set in the project on screen", async () => {
    const server = backend({
      projects: [{ id: "p1", name: "billing" }],
      groups: [{ id: "g1", name: "production", project_id: "p1" }],
    });
    render(<EnvPage />);

    fireEvent.click(await screen.findByRole("button", { name: "New set" }));
    const dialog = await screen.findByRole("dialog", { name: "New variable set" });
    expect((within(dialog).getByRole("combobox", { name: "Project" }) as HTMLSelectElement).value).toBe("p1");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), { target: { value: "staging" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create set" }));

    await waitFor(() =>
      expect(server.last("save_env_group")).toEqual({ input: { id: null, project_id: "p1", name: "staging", description: null } }),
    );
    expect(await screen.findByText("Created “billing · staging”")).toBeDefined();
  });

  it("creates a project from the set dialog and files the new set under it", async () => {
    const server = backend(production);
    render(<EnvPage />);

    fireEvent.click(await screen.findByRole("button", { name: "New set" }));
    const dialog = await screen.findByRole("dialog", { name: "New variable set" });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Project" }), { target: { value: "__new__" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), { target: { value: "local" } });
    // A new project needs its name before the set can be made.
    expect((within(dialog).getByRole("button", { name: "Create set" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByRole("textbox", { name: "New project name" }), { target: { value: " acme-web " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create set" }));

    await waitFor(() => expect(server.last("save_project")).toEqual({ input: { name: "acme-web", tag_ids: [] } }));
    await waitFor(() =>
      expect(server.last("save_env_group")).toEqual({ input: { id: null, project_id: "p100", name: "local", description: null } }),
    );
    const nav = screen.getByRole("navigation", { name: "Variable sets" });
    expect(await within(nav).findByRole("heading", { name: "acme-web" })).toBeDefined();
    expect(within(nav).getByRole("heading", { name: "No project" })).toBeDefined();
  });
});
