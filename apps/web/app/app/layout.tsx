import { AppNav } from "@/components/app-nav";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppNav />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
