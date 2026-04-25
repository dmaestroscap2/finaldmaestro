import type session from "express-session";

export async function persistAuthenticatedSession(
  userSession: session.Session & Partial<session.SessionData>,
  userId: number
): Promise<void> {
  userSession.userId = userId;

  await new Promise<void>((resolve, reject) => {
    userSession.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
