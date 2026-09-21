import { choice, noul, TypeSafeClient } from "@typesafe-ai/sdk";

import {
  categoriesAtThreshold,
  type Classification,
  ISSUE_CATEGORIES,
  type IssueCategory,
  type Priority,
} from "./domain";

const priorityQuestion = choice(
  "Select exactly one staff-review priority for this animal surrender or assistance request. Judge only the supplied message subject and body.",
  {
    "P1 — Immediate":
      "Potential emergency or serious safety or welfare concern requiring rapid review: acute medical suffering, a serious recent bite or immediate human-safety issue, or an animal currently in a dangerous situation.",
    "P2 — Urgent":
      "Significant time-sensitive situation requiring prompt attention: housing loss tomorrow, no safe placement after a near-term deadline, or a rapidly escalating care or behavioral issue, without meeting P1.",
    "P3 — Standard":
      "A legitimate surrender or assistance request without an identified immediate deadline or emergency.",
    "P4 — Lower urgency":
      "The request can reasonably remain in the normal queue because it contains no evidence of immediate risk, meaningful time pressure, or a near-term deadline.",
  },
);

const categoryCriteria: Record<IssueCategory, string> = {
  "Housing / landlord / moving":
    "Does the request say housing, a landlord, eviction, homelessness, relocation, or moving contributes to needing surrender or assistance?",
  "Financial hardship":
    "Does the request say financial hardship or inability to afford costs contributes to needing surrender or assistance?",
  "Animal medical issue":
    "Does the request describe an injury, illness, disability, suffering, or other medical issue affecting the animal?",
  "Owner medical issue":
    "Does the request say the owner's physical health, mental health, hospitalization, treatment, disability, or death contributes to needing surrender or assistance?",
  Behavior:
    "Does the request describe problematic animal behavior, excluding facts stated only as animal-to-animal conflict or a bite, aggression, or immediate safety issue?",
  "Bite / aggression / safety":
    "Does the request describe a bite, aggression, threat, containment failure, or safety risk involving this animal?",
  "Animal-to-animal conflict":
    "Does the request describe conflict, fighting, incompatibility, or safety problems between this animal and another animal?",
  "Unable to care for animal":
    "Does the request state that the owner or current caretaker cannot provide necessary ongoing care for the animal?",
  "Too many animals / possible hoarding":
    "Does the request describe an excessive number of animals, uncontrolled accumulation or breeding, or circumstances suggesting possible hoarding?",
  "Lack of time":
    "Does the request say insufficient time for the animal or its care contributes to needing surrender or assistance?",
  "Family or life change":
    "Does the request say a family or life change such as divorce, pregnancy, a new child, deployment, incarceration, or a death contributes to needing surrender or assistance?",
  "Rehoming assistance":
    "Is the requester specifically seeking help to find the animal a new home outside a direct shelter surrender?",
  "Temporary foster / boarding need":
    "Does the requester need temporary foster care or boarding, or indicate temporary placement could let them keep the animal?",
  "Veterinary assistance":
    "Is the requester seeking veterinary services or financial help for veterinary care as an alternative to surrender?",
  "Food / supply assistance":
    "Is the requester seeking food, litter, equipment, or other pet supplies as help that could prevent surrender?",
  "Behavior assistance":
    "Is the requester seeking training, behavior consultation, or other behavior support as help that could prevent surrender?",
  "Humane euthanasia request":
    "Does the requester explicitly ask about humane euthanasia or end-of-life services for the animal?",
  "Other / unclear":
    "Does the request fail to clearly match any of the other listed surrender or assistance issue categories?",
};

const categoryQuestions = Object.fromEntries(
  ISSUE_CATEGORIES.map((category, index) => [
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
    "P4 — Lower urgency",
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
    const result = await this.client.systemOne({
      model: this.model,
      state: { subject, body },
      questions: TRIAGE_QUESTIONS,
    });

    const answers = result.answers as unknown as Record<
      string,
      { readonly type: string; readonly noul?: number }
    >;
    const scores = Object.fromEntries(
      ISSUE_CATEGORIES.map((category, index) => {
        const answer = answers[`category_${index}`];
        if (!answer || answer.type !== "noul" || typeof answer.noul !== "number") {
          throw new Error(`TypeSafe returned an invalid answer for category_${index}`);
        }
        return [category, answer.noul];
      }),
    ) as Record<IssueCategory, number>;

    return classificationFromAnswers(result.answers.priority.choice, scores);
  }
}
