type SessionLike = {
  userId?: number;
  save?: (cb: (error?: any) => void) => void;
};

export async function persistAuthenticatedSession(userSession: SessionLike, userId: number): Promise<void> {
  userSession.userId = userId;

  if (typeof userSession.save !== "function") return;

  await new Promise<void>((resolve, reject) => {
    userSession.save!((error?: any) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
