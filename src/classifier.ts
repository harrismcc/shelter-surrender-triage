import * as Sentry from "@sentry/cloudflare";
import { choice, noul, TypeSafeClient } from "@typesafe-ai/sdk";

import {
  categoriesAtThreshold,
  type Classification,
  type IssueCategory,
  type Priority,
  SUBSTANTIVE_ISSUE_CATEGORIES,
} from "./domain";

const priorityQuestion = choice(
  "Select the highest applicable staff-review priority for this animal surrender or assistance request. Judge only the supplied message subject and body. Do not infer or assign staff response times.",
  {
    "P1 — Immediate":
      "The request reports a recent human bite or physical injury caused by the animal; serious injury or death to another animal; acute animal suffering; an immediate credible threat to a person or animal; inability to safely contain or separate the animal; or an animal currently without safe placement, a capable caregiver, or basic care.",
    "P2 — Urgent":
      "The request reports domestic violence or another household safety crisis, caregiver hospitalization or unavailability, aggression or a safety concern involving a child or vulnerable person, or a humane euthanasia or end-of-life request, without meeting P1.",
    "P3 — Standard":
      "The request concerns moving or housing, pregnancy or a new baby, financial hardship, behavior, energy, lack of time, too many animals, a non-acute animal medical issue, or another routine life change, without meeting P1 or P2.",
  },
);

type SubstantiveIssueCategory = (typeof SUBSTANTIVE_ISSUE_CATEGORIES)[number];

const categoryCriteria: Record<SubstantiveIssueCategory, string> = {
  "Housing / moving":
    "Does the request say housing, a landlord, eviction, homelessness, relocation, or moving contributes to needing surrender or assistance?",
  "Behavior / energy / lack of time":
    "Does the request say animal behavior, the animal's energy level, or insufficient caregiver time contributes to needing surrender or assistance?",
  "Financial hardship":
    "Does the request say financial hardship or inability to afford costs contributes to needing surrender or assistance?",
  "Caregiver health / unavailable":
    "Does a caregiver's hospitalization, physical or mental health, treatment, disability, incarceration, death, or other unavailability contribute to needing surrender or assistance?",
  "Pregnancy / new baby / family change":
    "Does pregnancy, a new baby, divorce, deployment, or another family change contribute to needing surrender or assistance?",
  "Too many animals":
    "Does the request say the number of animals, uncontrolled breeding, or accumulation of animals contributes to needing surrender or assistance?",
  "Animal medical":
    "Does the request describe an injury, illness, disability, pain, or other medical issue affecting the animal?",
  "Recent human bite / injury":
    "Does the request report that the animal being surrendered recently bit or physically injured a person?",
  "Serious animal injury / death":
    "Does the request report that the animal being surrendered seriously injured or killed another animal?",
  "Child or vulnerable-person safety":
    "Does the request describe aggression, threatening behavior, or another safety concern involving a child or vulnerable person?",
  "Cannot safely contain or separate":
    "Does the request say the animal cannot currently be safely contained, controlled, or separated from people or other animals?",
  "Acute animal suffering":
    "Does the request describe the animal as currently experiencing severe pain, distress, a serious untreated injury, or an apparent medical emergency?",
  "No safe caregiver or placement":
    "Does the request say the animal currently has no safe place to stay or no capable person who can provide necessary care?",
  "Household safety / domestic violence":
    "Does the request disclose domestic violence, abuse, threats, or another household safety crisis contributing to needing surrender or assistance?",
  "Abandonment / basic-care risk":
    "Does the request say the animal is abandoned, is at risk of abandonment, or currently lacks food, water, shelter, or other basic care?",
  "Humane euthanasia / end-of-life request":
    "Does the requester explicitly ask about humane euthanasia or end-of-life services for the animal?",
};

const categoryQuestions = Object.fromEntries(
  SUBSTANTIVE_ISSUE_CATEGORIES.map((category, index) => [
    `category_${index}`,
    noul(categoryCriteria[category], {
      true: `The message itself provides evidence for ${category}.`,
      false: `The message does not provide evidence for ${category}.`,
    }),
  ]),
);

export const TRIAGE_QUESTIONS = {
  priority: priorityQuestion,
  ...categoryQuestions,
};

export interface Classifier {
  classify(subject: string, body: string): Promise<Classification>;
}

export function classificationFromAnswers(
  priority: string,
  scores: Readonly<Record<IssueCategory, number>>,
): Classification {
  if (![
    "P1 — Immediate",
    "P2 — Urgent",
    "P3 — Standard",
  ].includes(priority)) {
    throw new Error("TypeSafe returned an invalid priority");
  }
  return {
    priority: priority as Priority,
    categories: categoriesAtThreshold(scores),
  };
}

export class JevClassifier implements Classifier {
  private readonly client: TypeSafeClient;

  constructor(apiKey: string, private readonly model = "jev-1.13.0") {
    this.client = new TypeSafeClient({
      apiKey,
      defaultModel: model,
      logLevel: "off",
      retry: { maxRetries: 2 },
      timeout: 15_000,
    });
  }

  async classify(subject: string, body: string): Promise<Classification> {
    return Sentry.startSpan(
      {
        name: "TypeSafe classify surrender request",
        op: "gen_ai.request",
        attributes: {
          "gen_ai.operation.name": "classify",
          "gen_ai.provider.name": "typesafe",
          "gen_ai.request.model": this.model,
        },
      },
      async (span) => {
        const result = await this.client.systemOne({
          model: this.model,
          state: { subject, body },
          questions: TRIAGE_QUESTIONS,
        });

        const answers = result.answers as unknown as Record<
          string,
          { readonly type: string; readonly noul?: number }
        >;
        const scores = Object.fromEntries([
          ...SUBSTANTIVE_ISSUE_CATEGORIES.map((category, index) => {
            const answer = answers[`category_${index}`];
            if (!answer || answer.type !== "noul" || typeof answer.noul !== "number") {
              throw new Error(`TypeSafe returned an invalid answer for category_${index}`);
            }
            return [category, answer.noul];
          }),
          ["Other / unclear", 0],
        ]) as Record<IssueCategory, number>;

        const classification = classificationFromAnswers(result.answers.priority.choice, scores);
        span.setAttribute("triage.category.count", classification.categories.length);
        return classification;
      },
    );
  }
}
