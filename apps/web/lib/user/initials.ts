import type { User } from "@clerk/nextjs/server";

/**
 * Pick 1-2 character initials from a Clerk user. Falls back to the
 * first character of the primary email when no name is set, and to
 * `U` (for "User") when even the email is missing.
 */
export function getInitials(user: User | null | undefined): string {
  if (!user) return "U";

  const first = (user.firstName ?? "").trim();
  const last = (user.lastName ?? "").trim();
  if (first && last) return (first[0]! + last[0]!).toUpperCase();
  if (first) return first.slice(0, 2).toUpperCase();
  if (last) return last.slice(0, 2).toUpperCase();

  const username = (user.username ?? "").trim();
  if (username) return username.slice(0, 2).toUpperCase();

  const email =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses?.[0]?.emailAddress ??
    "";
  if (email) return email[0]!.toUpperCase();

  return "U";
}

export function getDisplayName(user: User | null | undefined): string {
  if (!user) return "User";
  const first = (user.firstName ?? "").trim();
  const last = (user.lastName ?? "").trim();
  const full = [first, last].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (user.username) return user.username;
  return (
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses?.[0]?.emailAddress ??
    "User"
  );
}
