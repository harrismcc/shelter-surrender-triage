import { authorizeMicrosoftDevice } from "./microsoft-device-auth";

interface WranglerConfig {
  vars?: Record<string, unknown>;
}

function required(name: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Missing ${name}`);
  return value.trim();
}

const wrangler = Bun.JSONC.parse(
  await Bun.file(`${import.meta.dir}/../wrangler.jsonc`).text(),
) as WranglerConfig;
const vars = wrangler.vars ?? {};
if (vars.MICROSOFT_AUTH_MODE !== "delegated") {
  throw new Error("Microsoft device authorization requires MICROSOFT_AUTH_MODE=delegated");
}

const refreshToken = await authorizeMicrosoftDevice({
  tenantId: required("MICROSOFT_TENANT_ID", vars.MICROSOFT_TENANT_ID),
  clientId: required("MICROSOFT_CLIENT_ID", vars.MICROSOFT_CLIENT_ID),
  onPrompt: ({ verificationUri, userCode }) => {
    console.log(`Open ${verificationUri} and enter code ${userCode}`);
    console.log("Waiting for Microsoft authorization...");
  },
});

const repository = Bun.spawnSync(["git", "remote", "get-url", "origin"], {
  cwd: `${import.meta.dir}/..`,
});
if (repository.exitCode !== 0) throw new Error("Could not determine the Amp project repository");
const project = repository.stdout.toString().trim();

const store = Bun.spawn(
  [
    "amp",
    "secrets",
    "set",
    "MICROSOFT_REFRESH_TOKEN",
    "--project",
    project,
    "--secret",
    "--data-file",
    "-",
  ],
  {
    stdin: new Blob([refreshToken]),
    stdout: "inherit",
    stderr: "inherit",
  },
);
if (await store.exited !== 0) throw new Error("Failed to store the Amp project secret");

console.log("Microsoft authorization is stored as an Amp project secret.");
console.log("Restart the orb processes before sending a test email in this orb.");
