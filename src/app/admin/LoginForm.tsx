"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useT } from "@/lib/i18n/context";

export default function LoginForm() {
  const t = useT();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.refresh();
    } else {
      const { error: message } = await res
        .json()
        .catch(() => ({ error: t.admin.loginFailed }));
      setError(message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-xs">
      <h1 className="text-sm font-semibold tracking-[0.2em] text-neutral-200">{t.admin.title}</h1>
      <p className="mt-1 text-xs text-neutral-500">{t.admin.loginHint}</p>

      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoFocus
        autoComplete="current-password"
        placeholder={t.admin.password}
        className="mt-5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none placeholder:text-neutral-600 focus:border-white/25"
      />

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={busy || !password}
        className="mt-4 w-full rounded-lg bg-neutral-100 px-3 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-white disabled:opacity-40"
      >
        {busy ? t.admin.signingIn : t.admin.signIn}
      </button>
    </form>
  );
}
