export function resolveStudentPracticeInstrument(
  queryInstrument: string | null | undefined,
  userInstrument: string | null | undefined
): string {
  const userValue = String(userInstrument ?? "").trim().toLowerCase();
  if (userValue) return userValue;

  const queryValue = String(queryInstrument ?? "").trim().toLowerCase();
  if (queryValue) return queryValue;

  return "piano";
}
