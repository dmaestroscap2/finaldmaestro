import { describe, expect, it, vi } from "vitest";
import { persistAuthenticatedSession } from "./authSession";

describe("persistAuthenticatedSession", () => {
  it("writes the user id and waits for session.save to finish", async () => {
    const save = vi.fn<(cb: (err?: unknown) => void) => void>((cb) => cb());
    const session = { userId: undefined as number | undefined, save };

    await persistAuthenticatedSession(session as any, 42);

    expect(session.userId).toBe(42);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("rejects when session.save fails", async () => {
    const session = {
      userId: undefined as number | undefined,
      save: (cb: (err?: unknown) => void) => cb(new Error("save failed")),
    };

    await expect(persistAuthenticatedSession(session as any, 7)).rejects.toThrow("save failed");
  });
});
