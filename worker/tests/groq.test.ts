import { describe, it, expect, vi, afterEach } from "vitest";
import { validateGroqPayload, callGroqWithRetry } from "../src/groq";
import { GROQ_SYSTEM_PROMPT } from "../src/prompt";

describe("worker/groq", () => {
  it("GROQ_SYSTEM_PROMPT contains exact instructions", () => {
    expect(GROQ_SYSTEM_PROMPT).toContain("You convert a user's statement into a four-way decision.");
    expect(GROQ_SYSTEM_PROMPT).toContain("Exactly four, IN THE ORDER ABOVE");
  });

  it("validateGroqPayload accepts well-formed 4-option payload", () => {
    const payload = {
      state: "The user wonders if they can fly.",
      refusal: false,
      options: [
        { label: "Gravity wins", description: "You cannot defy basic physics without equipment." },
        { label: "Leap forward", description: "Belief alone will carry you through the clouds." },
        { label: "Flap your arms", description: "Perhaps rapid arm waving will generate lift." },
        { label: "Fall forever", description: "Descending is just flying with inevitable consequences." },
      ],
    };

    const res = validateGroqPayload(payload);
    expect(res.valid).toBe(true);
    expect(res.state).toBe("The user wonders if they can fly.");
    expect(res.options).toHaveLength(4);
    expect(res.options![0].label).toBe("Gravity wins");
  });

  it("validateGroqPayload rejects payload with missing or empty options", () => {
    expect(validateGroqPayload(null).valid).toBe(false);
    expect(validateGroqPayload({ state: "hi", options: [1, 2, 3] }).valid).toBe(false);
    expect(
      validateGroqPayload({
        state: "hi",
        options: [
          { label: "", description: "desc" },
          { label: "b", description: "desc" },
          { label: "c", description: "desc" },
          { label: "d", description: "desc" },
        ],
      }).valid
    ).toBe(false);
  });
});

describe("worker/groq retry logic", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("retries once when first attempt fails and succeeds on second attempt", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(new Response(JSON.stringify({ choices: [] }), { status: 200 }));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    state: "Retried and succeeded",
                    refusal: false,
                    options: [
                      { label: "No", description: "Refuse" },
                      { label: "Yes", description: "Endorse" },
                      { label: "Jester", description: "Absurd" },
                      { label: "Prophet", description: "Ominous" },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200 }
        )
      );
    });

    const result = await callGroqWithRetry("mock-key", "Test question");
    expect(callCount).toBe(2);
    expect(result).not.toBeNull();
    expect(result?.state).toBe("Retried and succeeded");
  });

  it("returns null if both attempts fail", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("Internal error", { status: 500 }));

    const result = await callGroqWithRetry("mock-key", "Test question");
    expect(result).toBeNull();
  });
});
