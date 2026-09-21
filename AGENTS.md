# Agent guidance

## Send a test triage email

Use the repository's delegated-only test command to exercise the deployed mailbox flow. It sends from the signed-in development mailbox back to `TRIAGE_EXACT_SENDER` with the configured exact subject.

```bash
bun run send-test-email --body 'Plain-text test body'
bun run send-test-email --body-file ./path/to/body.txt
bun run sample-email | bun run send-test-email
```

Use only synthetic data; `evals/synthetic-email-bodies.jsonl` is safe test input. The command reads non-secret settings from `wrangler.jsonc` and `MICROSOFT_REFRESH_TOKEN` from the environment or ignored `.dev.vars`. It intentionally refuses application auth. Sending creates an external email and may trigger the deployed triage workflow, so only run it when the user asks to send or test an email.

If `MICROSOFT_REFRESH_TOKEN` is unavailable or invalid, ask the user to complete `bun run authorize-microsoft`. It uses Microsoft's device flow and stores the token directly as an Amp project secret without printing it. The user must approve the browser prompt; do not attempt to bypass that consent step.
