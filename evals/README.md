# Synthetic email bodies

`synthetic-email-bodies.jsonl` contains synthetic, unlabeled form-submission email bodies for classifier testing and evaluation. Each line is an independent JSON object with exactly one `body` string.

All people, addresses, contact details, pets, microchip numbers, and circumstances are fictional. Email addresses use the reserved `.invalid` domain, and phone numbers use the fictional `202-555-01xx` range.

The examples intentionally vary urgency, species, selected form responses, free-text detail, missing answers, corrections, negation, and cases involving more than one issue. They should not be treated as shelter policy or as authoritative labels.

Print a random email body as raw text:

```bash
bun run sample-email
```
