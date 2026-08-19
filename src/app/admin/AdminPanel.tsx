"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import CoverArt from "@/components/CoverArt";
import LanguageSwitch from "@/components/LanguageSwitch";
import { useScrollFade } from "@/hooks/useScrollFade";
import { useI18n } from "@/lib/i18n/context";
import { format } from "@/lib/i18n/format";
import { adjacentArtistRuns, shuffleTracks } from "@/lib/shuffle";
import type {
  BroadcastSource,
  PlaylistDoc,
  StoreKind,
} from "@/lib/playlist-store";
import type { StorageKind } from "@/lib/storage";
import {
  formatClock,
  isEditableSource,
  resolveRadioState,
  type PlaylistSource,
  type RadioState,
  type Station,
  type Track,
} from "@/lib/radio";

type Props = {
  initialPlaylist: PlaylistDoc;
  initialSource: PlaylistSource;
  initialSourceError: string | null;
  storeKind: StoreKind;
  /** Kendi ses dosyalarının nerede saklandığı; panelin hangi ekleme yolunu öne
   *  çıkaracağını belirler. */
  storageKind: StorageKind;
};

const SOURCE_CLASS: Record<PlaylistSource, string> = {
  redis: "text-emerald-400",
  file: "text-emerald-400",
  youtube: "text-emerald-400",
  pinned: "text-amber-400",
  fallback: "text-red-400",
};

/** Kaydedilmemiş bir parça; gömülemeyen videoları uyarabilmek için ek alan taşır. */
type Draft = Track & { warning?: string };

export default function AdminPanel({
  initialPlaylist,
  initialSource,
  initialSourceError,
  storeKind,
  storageKind,
}: Props) {
  const { locale, t } = useI18n();
  const router = useRouter();

  const [name, setName] = useState(initialPlaylist.name);
  const [tagline, setTagline] = useState(initialPlaylist.tagline);
  const [shareTagline, setShareTagline] = useState(
    initialPlaylist.shareTagline,
  );
  const [tracks, setTracks] = useState<Draft[]>(initialPlaylist.tracks);
  const [savedAt, setSavedAt] = useState(initialPlaylist.updatedAt);

  // Yayının hangi kaynaktan çıktığı. "redis" dışındaki hâllerde liste yedekten
  // servis edilir ve düzenleme kapanır.
  const [source, setSource] = useState<PlaylistSource>(initialSource);
  const [sourceError, setSourceError] = useState<string | null>(
    initialSourceError,
  );
  const [switching, setSwitching] = useState(false);
  // Kaynak seçimi başlığı şişirmesin diye katlanır bir bölümde duruyor.
  const [sourceOpen, setSourceOpen] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState(
    initialPlaylist.youtubePlaylistUrl ?? "",
  );
  const [copying, setCopying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pinned, setPinned] = useState<BroadcastSource | undefined>(
    initialPlaylist.pinnedSource,
  );
  /**
   * YouTube seçeneğine niyet edildi ama henüz adres yok.
   *
   * Adres alanını yalnızca kaynak *seçiliyken* göstermek kilitleniyordu:
   * adres olmadan seçim yapılamıyor, seçim olmadan adres alanı açılmıyordu.
   */
  const [wantsYouTube, setWantsYouTube] = useState(false);
  const readOnly = !isEditableSource(source);

  /**
   * Seçicide işaretli duracak kaynak.
   *
   * `source` yayının *o anki* hâli; yedeğe düşülmüşse seçimle aynı olmayabilir.
   * Seçici kullanıcının niyetini göstermeli, kazayı değil.
   */
  const selectedSource: BroadcastSource =
    pinned ??
    (source === "pinned" ? "file" : source === "fallback" ? storeKind : source);

  // --- Canlı yayın konumu ----------------------------------------------------
  // Yayında gerçekten ne çaldığını taslak listeden değil, sunucudan okuyoruz;
  // kaydedilmemiş düzenlemeler varken taslak yanıltıcı olurdu.
  const [live, setLive] = useState<{
    station: Station;
    clockOffsetMs: number;
  } | null>(null);
  const [liveState, setLiveState] = useState<RadioState | null>(null);

  // Sürükle-bırak sıralama. Dokunmatik cihazlarda native DnD çalışmadığı için
  // ok tuşları erişilebilir alternatif olarak korunuyor.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadArtist, setUploadArtist] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverUrl, setCoverUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalSec = tracks.reduce((sum, t) => sum + t.durationSec, 0);

  // Kaydırma çubuğu gizli olduğu için kaydırılabilirlik, listenin
  // kenarlarındaki arka planla aynı renkte solma efektiyle bildirilir.
  const { viewportRef, topRef, bottomRef, fade } = useScrollFade();

  /** Sunucudan gelen yayın anlık görüntüsünü uygular. */
  const applyStation = useCallback((station: Station, serverNowMs: number) => {
    const clockOffsetMs = serverNowMs - Date.now();
    setLive({ station, clockOffsetMs });
    setLiveState(resolveRadioState(station, Date.now() + clockOffsetMs));
  }, []);

  const pullStation = useCallback(async () => {
    try {
      const res = await fetch("/api/station", { cache: "no-store" });
      if (!res.ok) return;
      const { now, station } = (await res.json()) as {
        now: number;
        station: Station;
      };
      if (station?.tracks?.length) applyStation(station, now);
    } catch {
      // Ağ hatasında eldeki bilgiyle devam et.
    }
  }, [applyStation]);

  useEffect(() => {
    // İlk çekim de zamanlayıcıya bırakılıyor: render sırasında state güncelleyip
    // zincirleme render tetiklemiyoruz.
    const first = window.setTimeout(() => void pullStation(), 0);
    const interval = window.setInterval(() => void pullStation(), 15_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [pullStation]);

  // Saniye sayacı: yayın konumunu sunucuya tekrar sormadan ilerletir.
  useEffect(() => {
    if (!live) return;
    const interval = window.setInterval(
      () =>
        setLiveState(
          resolveRadioState(live.station, Date.now() + live.clockOffsetMs),
        ),
      1000,
    );
    return () => window.clearInterval(interval);
  }, [live]);

  function mutate(next: Draft[]) {
    setTracks(next);
    setDirty(true);
    setError(null);
  }

  /**
   * Dosyanın süresini tarayıcıda ölçer.
   *
   * Sunucu MP3'ü kendi çözümleyicisiyle okuyabiliyor ama diğer biçimler için
   * ffprobe gerekiyor ve üretimde (Vercel) öyle bir ikili yok. Tarayıcı zaten
   * dosyayı çözebildiği için süreyi ondan alıyoruz; MP3'te sunucunun okuduğu
   * değer yine öncelikli kalır.
   */
  function measureDuration(file: File): Promise<number> {
    return new Promise((resolve) => {
      const audio = document.createElement("audio");
      const url = URL.createObjectURL(file);

      const done = (value: number) => {
        URL.revokeObjectURL(url);
        resolve(value);
      };

      audio.preload = "metadata";
      audio.onloadedmetadata = () =>
        done(Number.isFinite(audio.duration) ? audio.duration : 0);
      audio.onerror = () => done(0);
      audio.src = url;
    });
  }

  /**
   * Seçilen ses dosyalarını depoya yükler ve taslak listeye ekler.
   *
   * Sırayla gidiyor: paralel yükleme R2'ye aynı anda onlarca istek atar ve
   * ilerlemeyi anlamlı göstermek imkânsızlaşır. Bir dosya patlarsa kalanlar
   * denenmeye devam eder, hatalar sonda toplu bildirilir.
   */
  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;

    setUploading({ done: 0, total: files.length });
    setError(null);
    setNotice(null);

    const added: Draft[] = [];
    const failed: string[] = [];
    let where = "";
    // Tek dosyada aşağıdaki alanlar geçerli; çoklu seçimde her parçanın kendi
    // etiketleri kullanılır, yoksa hepsi aynı adı alırdı.
    const single = files.length === 1;

    for (const [index, file] of files.entries()) {
      setUploading({ done: index + 1, total: files.length });

      try {
        const body = new FormData();
        body.append("file", file);

        const durationSec = await measureDuration(file);
        if (durationSec > 0) body.append("durationSec", String(durationSec));

        if (single) {
          if (uploadTitle.trim()) body.append("title", uploadTitle.trim());
          if (uploadArtist.trim()) body.append("artist", uploadArtist.trim());
          if (coverFile) body.append("cover", coverFile);
          if (coverUrl.trim()) body.append("coverUrl", coverUrl.trim());
        }

        const res = await fetch("/api/admin/upload", { method: "POST", body });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const track = data.track as Draft;
        where = data.storage === "r2" ? "Cloudflare R2" : "public/audio";

        if ([...tracks, ...added].some((t) => t.videoId === track.videoId)) {
          throw new Error(t.admin.duplicate);
        }
        added.push(track);
      } catch (err) {
        failed.push(`${file.name}: ${(err as Error).message}`);
      }
    }

    if (added.length > 0) {
      mutate([...tracks, ...added]);
      setNotice(format(t.admin.uploadDone, { count: added.length, where }));
      setUploadTitle("");
      setUploadArtist("");
      setCoverFile(null);
      setCoverUrl("");
    }
    if (failed.length > 0) setError(failed.join(" · "));

    setUploading(null);
  }

  async function addTrack(event: React.FormEvent) {
    event.preventDefault();
    setAdding(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const { playableInEmbed, isLive, ...track } = data.track;
      void isLive;

      if (tracks.some((t) => t.videoId === track.videoId)) {
        throw new Error(t.admin.duplicate);
      }

      mutate([
        ...tracks,
        {
          ...track,
          warning: playableInEmbed ? undefined : t.admin.notEmbeddable,
        },
      ]);
      setUrl("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAdding(false);
    }
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= tracks.length) return;
    const next = [...tracks];
    [next[index], next[target]] = [next[target], next[index]];
    mutate(next);
  }

  /** Parçayı `from` sırasından çıkarıp `to` sırasına yerleştirir. */
  function reorder(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    const next = [...tracks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    mutate(next);
  }

  /**
   * Listeyi karıştırır; kaydetme mevcut akıştan geçer.
   *
   * Yayın konumu burada *bilerek* korunmuyor. Karıştırmanın amacı sırayı
   * değiştirmek; "yayın kesintisiz devam etsin" demek çalan parçayı yerinde
   * tutup etrafını değiştirmek olurdu ki bu da kullanıcının istediği şey
   * değil. Kaydedince sunucu epoch'u olduğu gibi bırakır, yayın yeni sıraya
   * göre akar.
   */
  function shuffle() {
    if (tracks.length < 2) return;
    const next = shuffleTracks(tracks);
    mutate(next);
    setNotice(
      format(t.admin.shuffleDone, {
        count: next.length,
        runs: adjacentArtistRuns(next),
      }),
    );
  }

  function endDrag() {
    setDragIndex(null);
    setDropIndex(null);
  }

  /**
   * Listeyi kaydeder. `startAtIndex` verilirse yayın o parçanın başına çekilir
   * — sunucu epoch'u yeniden hesaplar.
   */
  async function save(startAtIndex?: number) {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/playlist", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          tagline,
          shareTagline,
          tracks,
          startAtIndex,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSavedAt(data.playlist.updatedAt);
      setDirty(false);
      // Konum değiştiyse paneldeki "şimdi çalıyor" bilgisi hemen tazelensin.
      await pullStation();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  /** Yayında çalan parçanın taslak listedeki sırası (eşleşmezse -1). */
  const liveIndex = liveState
    ? tracks.findIndex((t) => t.videoId === liveState.track.videoId)
    : -1;

  function skipToNext() {
    if (tracks.length === 0) return;
    void save(liveIndex >= 0 ? (liveIndex + 1) % tracks.length : 0);
  }

  /** Canlı Redis listesi ile repo'daki yedek liste arasında geçiş yapar. */
  async function switchSource(next: BroadcastSource) {
    setSwitching(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/admin/playlist", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: next,
          youtubePlaylistUrl: playlistUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSource(data.source);
      setSourceError(data.sourceError);
      setPinned(data.playlist.pinnedSource);
      setPlaylistUrl(data.playlist.youtubePlaylistUrl ?? "");
      setTracks(data.playlist.tracks);
      setName(data.playlist.name);
      setTagline(data.playlist.tagline);
      setShareTagline(data.playlist.shareTagline);
      setSavedAt(data.playlist.updatedAt);
      setDirty(false);
      await pullStation();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSwitching(false);
    }
  }

  /** Yayındaki listeyi repodaki yedek dosyaya yazar. */
  async function copyToBackup() {
    setCopying(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/admin/playlist", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "copyToBackup" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setNotice(format(t.admin.copyToBackupDone, { count: data.count }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCopying(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/session", { method: "DELETE" });
    router.refresh();
  }

  /**
   * Kendi dosyalarından yayın yapıyorsan asıl ekleme yolu yükleme.
   *
   * Depo R2 iken yükleme önce ve açık geliyor, YouTube linki katlanıyor.
   * Karışık liste hâlâ mümkün — parçanın türü istasyonun değil kendisinin
   * özelliği — ama panel, yanlışlıkla iframe'e düşürecek olanı öne çıkarmıyor.
   */
  const audioFirst = storageKind === "r2";

  const linkForm = (
    <form onSubmit={addTrack} className="mt-3 flex shrink-0 gap-2">
      <input
        value={url}
        disabled={readOnly}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={
          readOnly
            ? source === "youtube"
              ? t.admin.urlPlaceholderYouTube
              : t.admin.urlPlaceholderReadOnly
            : t.admin.urlPlaceholder
        }
        className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none placeholder:text-neutral-600 focus:border-white/25"
      />
      <button
        type="submit"
        disabled={readOnly || adding || !url.trim()}
        className="shrink-0 rounded-lg bg-neutral-100 px-4 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-white disabled:opacity-40"
      >
        {adding ? t.admin.adding : t.admin.add}
      </button>
    </form>
  );

  const uploadSection = (
    // Depo R2 iken bu asıl yol; katlanmış durması gereksiz bir tık olurdu.
    <details className="mt-6 shrink-0 rounded-lg border border-white/10 bg-white/[0.03] sm:mt-8">
      <summary className="cursor-pointer list-none px-3 py-2 text-sm text-neutral-300 marker:hidden">
        {t.admin.uploadHeading}
      </summary>

      <div className="space-y-3 border-t border-white/5 px-3 py-3">
        <p className="text-xs leading-relaxed text-neutral-500">
          {t.admin.uploadHint}
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wide text-neutral-500">
              {t.admin.uploadTitleField} ({t.admin.uploadOptional})
            </span>
            <input
              value={uploadTitle}
              disabled={readOnly || uploading !== null}
              onChange={(e) => setUploadTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25 disabled:opacity-40"
            />
          </label>

          <label className="block">
            <span className="text-[11px] uppercase tracking-wide text-neutral-500">
              {t.admin.uploadArtistField} ({t.admin.uploadOptional})
            </span>
            <input
              value={uploadArtist}
              disabled={readOnly || uploading !== null}
              onChange={(e) => setUploadArtist(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25 disabled:opacity-40"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-neutral-500">
            {t.admin.uploadCover} ({t.admin.uploadOptional})
          </span>
          <input
            type="file"
            accept="image/*"
            disabled={readOnly || uploading !== null}
            onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
            className="mt-1 w-full text-xs text-neutral-400 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:text-neutral-200"
          />
        </label>

        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-neutral-500">
            {t.admin.uploadCoverUrl} ({t.admin.uploadOptional})
          </span>
          <input
            value={coverUrl}
            disabled={readOnly || uploading !== null}
            onChange={(e) => setCoverUrl(e.target.value)}
            placeholder={t.admin.uploadCoverUrlPlaceholder}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-neutral-600 focus:border-white/25 disabled:opacity-40"
          />
          <span className="mt-1 block text-[11px] leading-relaxed text-neutral-600">
            {t.admin.uploadCoverUrlHint}
          </span>
        </label>

        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-neutral-500">
            {t.admin.uploadChoose}
          </span>
          <input
            type="file"
            accept=".mp3,.m4a,.aac,.ogg,.opus,.wav,.flac,audio/*"
            multiple
            disabled={readOnly || uploading !== null}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              // Aynı dosyanın ikinci kez seçilebilmesi için girdiyi boşalt.
              e.target.value = "";
              void uploadFiles(files);
            }}
            className="mt-1 w-full text-xs text-neutral-400 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-neutral-950"
          />
        </label>

        {uploading && (
          <p className="text-xs text-neutral-400">
            {format(t.admin.uploading, {
              done: uploading.done,
              total: uploading.total,
            })}
          </p>
        )}
      </div>
    </details>
  );

  return (
    // Sayfa viewport'a sabitlenir; tek kaydırılabilir alan parça listesidir.
    // İki katman: dıştaki kaydırılmıyor ve solma efektlerini taşıyor, içteki
    // kaydırılıyor. Efektler kaydırılan kabın içinde olsaydı içerikle birlikte
    // hareket ederdi.
    //
    // Oynatıcı viewport'a kilitli (body overflow-hidden) ama panel öyle
    // olmamalı: liste uzadıkça ayrı bir kutuda sıkışmak yerine sayfa boyunca
    // akıyor. Kaydırma çubuğu gizli; hangi yöne gidilebileceğini kenarlardaki
    // solma bildiriyor.
    <div className="relative h-full w-full">
      <div
        ref={viewportRef}
        className="scrollbar-hidden h-full w-full overflow-y-auto overscroll-contain"
      >
        <div ref={topRef} aria-hidden className="h-px" />
        <div className="mx-auto flex w-full max-w-2xl flex-col px-5 py-6 sm:py-10">
          <header className="flex shrink-0 items-start justify-between gap-4">
            <div>
              <h1 className="text-sm font-semibold tracking-[0.2em] text-neutral-200">
                {t.admin.title}
              </h1>
              <p className="mt-1 text-xs text-neutral-500">
                {format(t.admin.summary, {
                  count: tracks.length,
                  total: formatClock(totalSec),
                })}{" "}
                ·{" "}
                <span className={SOURCE_CLASS[source]}>
                  {
                    {
                      redis: t.admin.sourceRedis,
                      file: t.admin.sourceFile,
                      youtube: t.admin.sourceYouTube,
                      pinned: t.admin.sourcePinned,
                      fallback: t.admin.sourceFallback,
                    }[source]
                  }
                </span>
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link
                href="/"
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300 transition hover:border-white/25"
              >
                {t.admin.backToRadio}
              </Link>
              <button
                type="button"
                onClick={() => setSourceOpen((open) => !open)}
                aria-expanded={sourceOpen}
                title={t.admin.sourcePanelHint}
                className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                  sourceOpen
                    ? "border-white/25 text-neutral-100"
                    : "border-white/10 text-neutral-400 hover:border-white/25"
                }`}
              >
                {t.admin.sourcePanelTitle}
              </button>

              <button
                type="button"
                onClick={logout}
                className="rounded-lg border border-red-800 px-3 py-1.5 text-xs  transition hover:border-red-800 text-red-600"
              >
                {t.admin.signOut}
              </button>
            </div>
          </header>

          {sourceOpen && (
            <section className="mt-5 shrink-0 rounded-lg border border-white/10 bg-white/3 p-3">
              <p className="text-[11px] tracking-[0.15em] text-neutral-500">
                {t.admin.sourcePanelHint}
              </p>

              <div className="mt-3 flex flex-col gap-2">
                {/*
              İlk seçeneğin değeri deponun kendisi: Redis kurulumunda "depodaki
              liste" Redis'tir, dosya kurulumunda data/playlist.json. Dosya
              kurulumunda yedek liste zaten aynı dosya olduğu için üçüncü
              seçenek hiç gösterilmiyor.
            */}
                {(
                  [
                    [
                      storeKind,
                      t.admin.sourceOptionRedis,
                      t.admin.sourceOptionRedisHint,
                    ],
                    [
                      "youtube",
                      t.admin.sourceOptionYouTube,
                      t.admin.sourceOptionYouTubeHint,
                    ],
                    ...(storeKind === "redis"
                      ? [
                          [
                            "file",
                            t.admin.sourceOptionFile,
                            t.admin.sourceOptionFileHint,
                          ] as const,
                        ]
                      : []),
                  ] as ReadonlyArray<readonly [BroadcastSource, string, string]>
                ).map(([value, label, hint]) => {
                  const active = selectedSource === value;

                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        // Adres yoksa istek atmadan önce alanı aç.
                        if (value === "youtube" && !playlistUrl.trim()) {
                          setWantsYouTube(true);
                          return;
                        }
                        setWantsYouTube(false);
                        switchSource(value);
                      }}
                      disabled={switching || active}
                      className={`flex items-start gap-3 rounded-md border px-3 py-2 text-left transition disabled:cursor-default ${
                        active
                          ? "border-emerald-500/40 bg-emerald-500/5"
                          : "border-white/10 hover:border-white/25 disabled:opacity-40"
                      }`}
                    >
                      <span
                        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                          active ? "bg-emerald-400" : "bg-neutral-700"
                        }`}
                      />
                      <span className="min-w-0">
                        <span className="block text-xs text-neutral-200">
                          {label}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-neutral-500">
                          {hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {(selectedSource === "youtube" || wantsYouTube) && (
                <label className="mt-3 block">
                  <span className="text-[11px] tracking-[0.15em] text-neutral-500">
                    {t.admin.playlistUrlLabel}
                  </span>
                  <input
                    value={playlistUrl}
                    onChange={(e) => setPlaylistUrl(e.target.value)}
                    autoFocus={wantsYouTube}
                    onBlur={() => {
                      if (playlistUrl.trim() && selectedSource !== "youtube")
                        switchSource("youtube");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && playlistUrl.trim())
                        switchSource("youtube");
                    }}
                    placeholder={t.admin.playlistUrlPlaceholder}
                    className="mt-1 w-full rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 outline-none transition focus:border-white/30"
                  />
                </label>
              )}

              <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3">
                <button
                  type="button"
                  onClick={copyToBackup}
                  disabled={copying || tracks.length === 0}
                  title={t.admin.copyToBackupHint}
                  className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 transition hover:border-white/25 disabled:opacity-40"
                >
                  {copying ? "…" : t.admin.copyToBackup}
                </button>
                {notice && (
                  <span className="text-[11px] text-emerald-400">{notice}</span>
                )}
              </div>
            </section>
          )}

          {storeKind === "file" && (
            <p className="mt-5 shrink-0 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              {t.admin.fileStoreWarning} <code>data/playlist.json</code>
              {t.admin.fileStoreWarningRest} <code>UPSTASH_REDIS_REST_URL</code>{" "}
              + <code>UPSTASH_REDIS_REST_TOKEN</code>
              {t.admin.fileStoreWarningEnd}
            </p>
          )}

          {storeKind === "redis" && readOnly && (
            <div
              className={`mt-5 flex shrink-0 items-start gap-3 rounded-lg border px-3 py-2 text-xs ${
                source === "fallback"
                  ? "border-red-500/20 bg-red-500/10 text-red-300"
                  : source === "youtube"
                    ? "border-white/10 bg-white/[0.03] text-neutral-400"
                    : "border-amber-500/20 bg-amber-500/10 text-amber-300"
              }`}
            >
              <p className="min-w-0 flex-1">
                {source === "youtube" ? (
                  // Salt okunur ama arıza değil: liste YouTube'da yönetiliyor.
                  <>
                    <strong className="font-medium text-neutral-300">
                      {t.admin.youtubeBannerTitle}
                    </strong>{" "}
                    {t.admin.youtubeBannerBody}
                  </>
                ) : source === "fallback" ? (
                  <>
                    <strong className="font-medium">
                      {t.admin.fallbackBannerTitle}
                    </strong>{" "}
                    {t.admin.fallbackBannerBody}
                    {sourceError && (
                      <span className="mt-1 block break-words opacity-70">
                        {sourceError}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <strong className="font-medium">
                      {t.admin.pinnedBannerTitle}
                    </strong>{" "}
                    {t.admin.pinnedBannerBody} <code>data/playlist.json</code>{" "}
                    {t.admin.pinnedBannerRest}
                  </>
                )}
              </p>
              <button
                type="button"
                onClick={() => switchSource(storeKind)}
                disabled={switching}
                className="shrink-0 rounded-md border border-current/30 px-2 py-1 font-medium transition hover:bg-white/5 disabled:opacity-40"
              >
                {switching ? "…" : t.admin.switchToLive}
              </button>
            </div>
          )}

          {/* --- Canlı yayın konumu --- */}
          {liveState && (
            <div className="mt-5 flex shrink-0 items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500" />
              <p className="min-w-0 flex-1 truncate text-xs text-neutral-300">
                <span className="text-neutral-500">
                  {t.admin.liveNowPlaying}{" "}
                </span>
                {liveState.track.title}
                <span className="text-neutral-500">
                  {" "}
                  — {liveState.track.artist}
                </span>
              </p>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-neutral-500">
                {formatClock(liveState.offsetSec)} /{" "}
                {formatClock(liveState.track.durationSec)}
              </span>
              <button
                type="button"
                onClick={skipToNext}
                disabled={readOnly || saving || tracks.length === 0}
                className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-[11px] text-neutral-300 transition hover:border-white/25 disabled:opacity-40"
              >
                {t.admin.skipNext}
              </button>
            </div>
          )}

          {/* --- İstasyon bilgileri --- */}
          <section className="mt-6 grid shrink-0 gap-3 sm:mt-8 sm:grid-cols-3">
            <label className="block">
              <span className="text-[10px] font-medium tracking-[0.18em] text-neutral-600">
                {t.admin.stationName}
              </span>
              <input
                value={name}
                disabled={readOnly}
                onChange={(e) => {
                  setName(e.target.value);
                  setDirty(true);
                }}
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-medium tracking-[0.18em] text-neutral-600">
                {t.admin.tagline}
              </span>
              <input
                value={tagline}
                disabled={readOnly}
                onChange={(e) => {
                  setTagline(e.target.value);
                  setDirty(true);
                }}
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </label>

            <label className="block">
              <span
                className="text-[10px] font-medium tracking-[0.18em] text-neutral-600"
                title={t.admin.shareTaglineHint}
              >
                {t.admin.shareTagline}
              </span>
              <input
                value={shareTagline}
                disabled={readOnly}
                onChange={(e) => {
                  setShareTagline(e.target.value);
                  setDirty(true);
                }}
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </label>
          </section>

          {/* --- Parça ekleme: sıralama depoya göre --- */}
          {audioFirst ? (
            <>
              {uploadSection}
              <details className="mt-2 shrink-0 rounded-lg border border-white/10 bg-white/[0.03]">
                <summary className="cursor-pointer list-none px-3 py-2 text-sm text-neutral-300 marker:hidden">
                  {t.admin.linkHeading}
                </summary>
                <div className="border-t border-white/5 px-3 pb-3">
                  <p className="pt-3 text-xs leading-relaxed text-neutral-500">
                    {t.admin.linkHint}
                  </p>
                  {linkForm}
                </div>
              </details>
            </>
          ) : (
            <>
              {linkForm}
              {uploadSection}
            </>
          )}
          {error && (
            <p className="mt-3 shrink-0 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}

          {/* --- Liste araçları --- */}
          <div className="mt-4 flex shrink-0 items-center justify-between gap-3 sm:mt-6">
            <span className="text-[11px] text-neutral-600">
              {t.admin.dragHint}
            </span>
            <button
              type="button"
              onClick={shuffle}
              disabled={readOnly || saving || tracks.length < 2}
              title={t.admin.shuffleHint}
              className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-neutral-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-neutral-100 disabled:opacity-40"
            >
              {t.admin.shuffle}
            </button>
          </div>

          {/* --- Parça listesi: kendi kaydırma kutusu yok, sayfayla birlikte uzar --- */}
          <div className="mt-2 border-y border-white/5">
            <ul className="divide-y divide-white/5">
              {tracks.map((track, i) => (
                <li
                  key={track.videoId}
                  draggable={!readOnly}
                  onDragStart={(e) => {
                    setDragIndex(i);
                    e.dataTransfer.effectAllowed = "move";
                    // Firefox sürüklemeyi ancak veri taşındığında başlatır.
                    e.dataTransfer.setData("text/plain", String(i));
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dropIndex !== i) setDropIndex(i);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null) reorder(dragIndex, i);
                    endDrag();
                  }}
                  onDragEnd={endDrag}
                  className={`group flex items-center gap-3 py-3 transition-colors ${
                    readOnly ? "" : "cursor-grab active:cursor-grabbing"
                  } ${
                    dragIndex === i ? "opacity-30" : ""
                  } ${dropIndex === i && dragIndex !== i ? "bg-white/5" : ""} ${
                    liveIndex === i ? "bg-emerald-500/[0.06]" : ""
                  }`}
                >
                  <span
                    aria-hidden
                    className="shrink-0 select-none text-neutral-700 transition-colors group-hover:text-neutral-500"
                    title={t.admin.dragHint}
                  >
                    ⠿
                  </span>
                  <span
                    className={`w-5 shrink-0 text-right font-mono text-[11px] tabular-nums ${
                      liveIndex === i ? "text-emerald-400" : "text-neutral-600"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <CoverArt
                    track={track}
                    width={48}
                    height={48}
                    className="h-12 w-12 shrink-0 rounded-md object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-neutral-200">
                      {track.title}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {track.artist} · {formatClock(track.durationSec)}
                    </p>
                    {track.warning && (
                      <p className="mt-0.5 text-[11px] text-amber-400">
                        {track.warning}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton
                      label={t.admin.playFromHere}
                      onClick={() => void save(i)}
                      disabled={readOnly || saving || liveIndex === i}
                    >
                      ▶
                    </IconButton>
                    <IconButton
                      label={t.admin.moveUp}
                      onClick={() => move(i, -1)}
                      disabled={readOnly || i === 0}
                    >
                      ↑
                    </IconButton>
                    <IconButton
                      label={t.admin.moveDown}
                      onClick={() => move(i, 1)}
                      disabled={readOnly || i === tracks.length - 1}
                    >
                      ↓
                    </IconButton>
                    <IconButton
                      label={t.admin.remove}
                      onClick={() => mutate(tracks.filter((_, j) => j !== i))}
                      disabled={readOnly}
                      danger
                    >
                      ×
                    </IconButton>
                  </div>
                </li>
              ))}
              {tracks.length === 0 && (
                <li className="py-8 text-center text-sm text-neutral-600">
                  {t.admin.emptyList}
                </li>
              )}
            </ul>
          </div>

          {/* --- Kaydet --- */}
          <div className="mt-6 flex shrink-0 items-center justify-between gap-4">
            <p className="text-xs text-neutral-600">
              {dirty ? (
                <span className="text-amber-400">{t.admin.unsaved}</span>
              ) : (
                <>
                  {format(t.admin.lastSaved, {
                    when: new Date(savedAt).toLocaleString(locale),
                  })}
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => void save()}
              disabled={readOnly || !dirty || saving}
              className="rounded-lg bg-neutral-100 px-5 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-white disabled:opacity-40"
            >
              {saving ? t.admin.saving : t.admin.save}
            </button>
          </div>

          {/*
        Dipnot kısa ekranlarda listeye yer açmak için gizlenir; dil değiştirici
        her boyutta kalır — yanlış dilde açılan bir panelde en çok ona ihtiyaç
        duyuluyor. İkisi aynı satırı paylaşınca ek bir yükseklik doğmuyor.
      */}
          <div className="mt-5 flex shrink-0 items-start gap-4 border-t border-white/5 pt-4 text-xs text-neutral-600">
            <p className="hidden min-w-0 flex-1 leading-relaxed [@media(min-height:820px)]:block">
              <strong className="font-medium text-neutral-500">▶</strong>{" "}
              {t.admin.footnote}
            </p>
            <span className="ml-auto shrink-0">
              <LanguageSwitch />
            </span>
          </div>
        </div>
        <div ref={bottomRef} aria-hidden className="h-px" />
      </div>

      {/* Kaydırılabilir yönü bildiren, arka planla aynı renkte solma efekti */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 top-0 z-20 h-10 bg-gradient-to-b from-neutral-950 to-transparent transition-opacity duration-200 ${
          fade.top ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 h-10 bg-gradient-to-t from-neutral-950 to-transparent transition-opacity duration-200 ${
          fade.bottom ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-sm transition disabled:opacity-25 ${
        danger
          ? "text-neutral-500 hover:border-red-500/40 hover:text-red-400"
          : "text-neutral-400 hover:border-white/25 hover:text-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}
