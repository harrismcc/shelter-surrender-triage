const dataset = Bun.file(`${import.meta.dir}/synthetic-email-bodies.jsonl`);
const records = (await dataset.text())
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line) as { body: string });

const record = records[Math.floor(Math.random() * records.length)];
if (!record) throw new Error("The synthetic email dataset is empty");

process.stdout.write(`${record.body}\n`);
