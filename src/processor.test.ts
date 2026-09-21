import { describe, expect, it } from "bun:test";

import type { Classifier } from "./classifier";
import type { GraphMessage, GraphOperations } from "./graph";
import { processMessage } from "./processor";

const config = {
  exactSender: "forms@example.org",
  exactSubject: "Surrender form",
  destinationFolderName: "Surrender Requests",
};

function dependencies(options: {
  message?: GraphMessage | null;
  categoryFailure?: Error;
} = {}): {
  graph: GraphOperations;
  classifier: Classifier;
  operations: string[];
  updated: string[][];
} {
  const operations: string[] = [];
  const updated: string[][] = [];
  const message = options.message === undefined
    ? {
        id: "immutable-message-id",
        parentFolderId: "inbox-id",
        subject: "Surrender form",
        from: { emailAddress: { address: "forms@example.org" } },
        body: { content: "I am being evicted tomorrow and need temporary foster care." },
        categories: ["Owned by intake"],
      }
    : options.message;
  const graph: GraphOperations = {
    async getInboxId() {
      operations.push("inbox");
      return "inbox-id";
    },
    async findMailFolderId() {
      operations.push("folder");
      return "destination-id";
    },
    async getMessage() {
      operations.push("message");
      return message;
    },
    async updateMessageCategories(_id, categories) {
      operations.push("categories");
      updated.push(categories);
      if (options.categoryFailure) throw options.categoryFailure;
    },
    async moveMessage() {
      operations.push("move");
    },
  };
  const classifier: Classifier = {
    async classify() {
      operations.push("classify");
      return {
        priority: "P2 — Urgent",
        categories: ["Housing / moving", "Household safety / domestic violence"],
      };
    },
  };
  return { graph, classifier, operations, updated };
}

describe("message processing", () => {
  it("classifies, applies categories, and then moves in order", async () => {
    const { graph, classifier, operations, updated } = dependencies();

    expect(await processMessage("immutable-message-id", config, graph, classifier)).toBe("processed");
    expect(operations.slice(3)).toEqual(["classify", "message", "categories", "move"]);
    expect(updated).toEqual([[
      "Owned by intake",
      "P2 — Urgent",
      "Housing / moving",
      "Household safety / domestic violence",
    ]]);
  });

  it("acknowledges a missing or already-moved message without classification", async () => {
    for (const message of [
      null,
      {
        id: "immutable-message-id",
        parentFolderId: "some-other-folder",
        subject: "Surrender form",
        from: { emailAddress: { address: "forms@example.org" } },
      },
    ]) {
      const { graph, classifier, operations } = dependencies({ message });
      expect(await processMessage("immutable-message-id", config, graph, classifier)).toBe(
        "already-moved-or-missing",
      );
      expect(operations).not.toContain("classify");
      expect(operations).not.toContain("move");
    }
  });

  it("leaves a message unmoved when a transient category update fails", async () => {
    const { graph, classifier, operations } = dependencies({
      categoryFailure: new Error("transient"),
    });

    await expect(processMessage("immutable-message-id", config, graph, classifier)).rejects.toThrow(
      "transient",
    );
    expect(operations).toContain("categories");
    expect(operations).not.toContain("move");
  });
});
