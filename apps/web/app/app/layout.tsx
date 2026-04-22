import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-background">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/app/properties" className="text-sm font-semibold tracking-tight">
            DwellVerdict
          </Link>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
