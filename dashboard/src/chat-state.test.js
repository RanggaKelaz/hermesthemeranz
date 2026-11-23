import assert from "node:assert/strict";
import test from "node:test";
import { explicitProgress, orderSessionMessages, reconcilePendingMessages } from "./chat-state.js";

test("preserves repeated identical prompts while normalizing latest-first history", () => {
  const latestFirst = {
    pagination: { order: "latest" },
    messages: [
      { role: "assistant", content: "Same prompt answer" },
      { role: "user", content: "Same prompt" },
      { role: "assistant", content: "First answer" },
      { role: "user", content: "Same prompt" }
    ]
  };

  assert.deepEqual(orderSessionMessages(latestFirst), [
    { role: "user", content: "Same prompt" },
    { role: "assistant", content: "First answer" },
    { role: "user", content: "Same prompt" },
    { role: "assistant", content: "Same prompt answer" }
  ]);
  assert.deepEqual(latestFirst.messages[0], { role: "assistant", content: "Same prompt answer" });
});

test("reconciles accepted prompts only when a new stable user-message identity appears", () => {
  const pending = [
    { id: "pending-1", content: "Repeat this", seenIds: ["uid:old"] },
    { id: "pending-2", content: "Repeat this", seenIds: ["uid:old"] },
    { id: "pending-3", content: "Not stored yet", seenIds: ["uid:old"] },
  ];
  const history = [
    { role: "user", content: "Repeat this", message_uid: "uid:new-1" },
    { role: "user", content: "Repeat this", message_uid: "uid:new-2" },
    { role: "user", content: "Repeat this", message_uid: "uid:old" },
  ];

  assert.deepEqual(reconcilePendingMessages(pending, history), [pending[2]]);
});

test("uses only valid explicit percentages and stays indeterminate without one", () => {
  assert.equal(explicitProgress({ percent: 0 }), 0);
  assert.equal(explicitProgress({ percent: 100 }), 100);
  assert.equal(explicitProgress({ percent: 42.5 }), 42.5);
  assert.equal(explicitProgress({ percent: -1 }), null);
  assert.equal(explicitProgress({ percent: 101 }), null);
  assert.equal(explicitProgress({ percent: "50" }), null);
  assert.equal(explicitProgress({ percent: Number.NaN }), null);
  assert.equal(explicitProgress({ percent: Number.POSITIVE_INFINITY }), null);
  assert.equal(explicitProgress({ progress: 4, total: 8 }), null);
  assert.equal(explicitProgress(null), null);
});
