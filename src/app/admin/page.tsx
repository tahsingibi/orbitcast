import type { Metadata } from "next";

import { adminEnabled, isAuthenticated } from "@/lib/admin-auth";
import { getI18n } from "@/lib/i18n/server";
import { readPlaylist, storeKind } from "@/lib/playlist-store";

import AdminPanel from "./AdminPanel";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.adminTitle, robots: { index: false, follow: false } };
}

export default async function AdminPage() {
  const { t } = await getI18n();

  if (!adminEnabled) {
    return (
      <Shell>
        <div className="max-w-sm text-sm leading-relaxed text-neutral-400">
          <h1 className="text-sm font-semibold tracking-[0.2em] text-neutral-200">
            {t.admin.disabledTitle}
          </h1>
          <p className="mt-3">
            {t.admin.disabledBody}{" "}
            <code className="text-neutral-200">ADMIN_PASSWORD</code>{" "}
            {t.admin.disabledBodyRest}
          </p>
        </div>
      </Shell>
    );
  }

  if (!(await isAuthenticated())) {
    return (
      <Shell>
        <LoginForm />
      </Shell>
    );
  }

  const { doc, source, error } = await readPlaylist();

  return (
    <AdminPanel
      initialPlaylist={doc}
      initialSource={source}
      initialSourceError={error ?? null}
      storeKind={storeKind}
    />
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex h-full items-center justify-center overflow-hidden px-5 py-10">{children}</main>
  );
}
