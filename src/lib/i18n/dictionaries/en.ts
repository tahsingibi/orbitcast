import type { Dictionary } from "../index";

/** English dictionary. Shape is enforced by `Dictionary`, derived from `tr`. */
export const en: Dictionary = {
  player: {
    listenersHint: "People listening right now (updates every few minutes)",
    nowPlaying: "NOW PLAYING",
    upNext: "UP NEXT",
    openQueue: "Queue ›",
    play: "Start listening",
    pause: "Pause",
    mute: "Mute",
    unmute: "Unmute",
    volume: "Volume",
    adBreak: "Ad — you will be pulled back to the live position",
    buffering: "Connecting…",
    share: "Share: {track}",
    shareOnXLabel: "Share on X",
    shareOnInstagram: "Instagram story",
    sharePreparing: "Preparing…",
    shareText: 'Listening to "{title}" by {artist} on {station}',
    errorSuffix: "The broadcast will continue with the next track.",
    builtBy: "Built by {author}",
    queueLink: "Queue",
    infoLink: "About",
    repoLink: "GitHub",
    poweredBy: "OrbitCast",
    poweredByTitle: "Powered by OrbitCast — source on GitHub",
  },

  source: {
    liveLabel: "LIVE",
    backupLabel: "BACKUP",
    liveTitle: "Live broadcast",
    liveBody:
      "The playlist is managed live; when new tracks are added the broadcast updates immediately.",
    pinnedTitle: "Backup playlist",
    pinnedBody:
      "The broadcast is running from the backup playlist. Music keeps playing without interruption, but the list is not being updated right now.",
    fallbackTitle: "Backup playlist",
    fallbackBody:
      "The live playlist is currently unreachable, so the broadcast continues uninterrupted from the backup. The list is temporarily frozen.",
  },

  queue: {
    title: "QUEUE",
    played: "PLAYED",
    nowPlaying: "NOW PLAYING",
    upNext: "UP NEXT",
    close: "Close",
    justPlayed: "just now",
    minutesAgo: "{minutes} min ago",
    startingSoon: "up next",
    minutesLater: "in {minutes} min",
  },

  info: {
    title: "ABOUT",
    close: "Close",
    howHeading: "HOW THIS BROADCAST WORKS",
    howBody: "{station} plays selected YouTube videos through the",
    howApi: "YouTube IFrame Player API",
    howBodyRest:
      ". Every listener lands on the same second of the same track through a shared time calculation.",
    copyrightHeading: "COPYRIGHT",
    copyrightLead: "No audio or video file on this site is",
    copyrightEmphasis: "hosted, downloaded, copied or re-broadcast",
    copyrightRest:
      ". Content plays directly through YouTube's own player and infrastructure, exactly as the rights holders published it on YouTube. YouTube's Terms of Service apply during playback.",
    howBodySelfHosted:
      "{station} is a web player broadcasting from the station's own audio " +
      "library. Every listener lands on the same second of the same track " +
      "through a shared time calculation.",
    copyrightSelfHosted:
      "The audio in this broadcast is hosted on the station's own " +
      "infrastructure. It is offered for listening only; no download links are " +
      "provided and no revenue is earned from the broadcast.",
    copyrightOwners:
      "All works belong to their respective artists, producers and rights holders. This site claims no ownership over the content and earns no revenue from the broadcast.",
    takedownHeading: "TAKEDOWN REQUESTS",
    takedownBody:
      "If you are the rights holder of a work and want it removed from the playlist, send an email with the track name and its link. Once verified, the track is removed",
    takedownEmphasis: "without delay",
    takedownRest: ".",
    takedownContactLead: "Write to:",
    takedownSubject: "{station} — Takedown request",
    creditsHeading: "CREDITS",
    creditsBody: "Built by {author}.",
    creditsRepo: "Source code on GitHub",
    supportHeading: "SUPPORT",
    supportBody:
      "OrbitCast is open source: the whole codebase is public, so anyone can run their own radio. Donations go to developing the project, not to this broadcast — listening is always free.",
    supportCta: "Buy me a coffee",
  },

  empty: {
    body: "The playlist is empty. The broadcast starts on its own once a track is added.",
    adminLink: "Manage broadcast",
    setupHint: "First time here? Run:",
  },

  language: {
    label: "Language",
    switchTo: "Switch language: {name}",
  },

  admin: {
    title: "BROADCAST ADMIN",
    loginHint: "Enter the password to continue.",
    password: "Password",
    signIn: "Sign in",
    signingIn: "Checking…",
    loginFailed: "Sign-in failed.",
    disabledTitle: "BROADCAST ADMIN",
    disabledBody: "The panel is disabled. To enable it, set the",
    disabledBodyRest: "environment variable and restart the app.",

    summary: "{count} tracks · {total} total",
    sourceRedis: "live · Upstash Redis",
    sourceFile: "live · local file",
    sourceYouTube: "live · YouTube playlist",
    sourcePinned: "backup playlist (manually selected)",
    sourceFallback: "backup playlist (Redis unreachable)",

    backToRadio: "Back",
    signOut: "Sign out",

    sourcePanelTitle: "Source",
    sourcePanelHint: "Choose which playlist goes on air",
    sourceOptionRedis: "Stored playlist",
    sourceOptionRedisHint: "The list you edit below is on air",
    sourceOptionYouTube: "YouTube playlist",
    sourceOptionYouTubeHint: "Managed on YouTube; the panel is read-only",
    sourceOptionFile: "Backup playlist",
    sourceOptionFileHint: "The repo's data/playlist.json is on air",
    playlistUrlLabel: "PLAYLIST URL",
    playlistUrlPlaceholder: "https://www.youtube.com/playlist?list=…",
    copyToBackup: "Copy to backup",
    copyToBackupHint:
      "Writes the live playlist to the repo's backup file, which takes over when the source is unreachable",
    copyToBackupDone: "Copied {count} tracks to the backup",
    switchToBackup: "Use backup",
    switchToBackupHint:
      "Stop reading Redis and switch to the repo's backup playlist",
    switchToLive: "Back to live",

    fileStoreWarning: "The playlist currently lives in",
    fileStoreWarningRest: ". To edit it in production without redeploying, set",
    fileStoreWarningEnd: ".",

    fallbackBannerTitle: "Redis is unreachable.",
    fallbackBannerBody:
      "The broadcast continues uninterrupted from the repo's backup playlist; editing is disabled.",
    pinnedBannerTitle: "Backup playlist is on air.",
    youtubeBannerTitle: "A YouTube playlist is on air.",
    youtubeBannerBody: "Add and remove tracks in the playlist on YouTube; the broadcast follows within a few minutes. The list below is read-only.",
    pinnedBannerBody:
      "Redis is not being read — no quota is spent. The broadcast comes from",
    pinnedBannerRest: "and editing is disabled.",

    liveNowPlaying: "Now playing ·",
    skipNext: "Skip to next",

    stationName: "STATION NAME",
    tagline: "TAGLINE",
    shareTagline: "SHARE LINE",
    shareTaglineHint:
      "The bottom line of the card shown in X shares. Keep it under ~45 " +
      "characters so it stays on one line, and leave off the full stop.",

    urlPlaceholder: "Paste a YouTube link",
    urlPlaceholderYouTube: "Managed on YouTube — add tracks in the playlist there",
    urlPlaceholderReadOnly: "Backup playlist is on air — editing disabled",
    add: "Add",
    adding: "Resolving…",
    duplicate: "This track is already in the playlist.",

    linkHeading: "Add by YouTube link",
    linkHint:
      "This track's audio comes from YouTube: when its turn comes the embedded " +
      "player opens and background playback stops working. If you broadcast " +
      "your own files, use the upload above.",
    uploadHeading: "Add from file",
    uploadHint:
      "Pick an MP3: duration, tags and embedded artwork are read from the file. " +
      "Select a single file to override them below.",
    uploadChoose: "Choose audio file",
    uploadCover: "Cover",
    uploadCoverUrl: "Cover URL",
    uploadCoverUrlPlaceholder: "YouTube link or image URL",
    uploadCoverUrlHint:
      "Used when the file has no embedded artwork. Give a YouTube link and the " +
      "video's thumbnail is downloaded into your own store — no external link.",
    uploadTitleField: "Title",
    uploadArtistField: "Artist",
    uploadOptional: "optional",
    uploading: "Uploading {done}/{total}…",
    uploadDone: "Added {count} track(s) · {where}",
    unknownArtist: "Unknown artist",
    notEmbeddable: "Embedding is disabled — it will play silently.",

    emptyList: "The playlist is empty. Add a YouTube link above.",
    dragHint: "Drag to reorder",
    shuffle: "Shuffle",
    shuffleHint:
      "Shuffles the playlist and keeps the same artist from playing back to " +
      "back. Nothing goes on air until you save.",
    shuffleDone: "Shuffled {count} tracks · same artist adjacent: {runs}",
    playFromHere: "Start the broadcast here",
    moveUp: "Move up",
    moveDown: "Move down",
    remove: "Remove from playlist",

    unsaved: "You have unsaved changes.",
    lastSaved: "Last saved: {when}",
    save: "Save",
    saving: "Saving…",

    footnote:
      "moves the broadcast to the start of that track; “Skip to next” jumps to the following one. Both also save any pending edits. New visitors see the change immediately; open tabs catch up within 60 seconds. Adding, removing or reordering tracks also shifts the current position — synchronisation is not affected.",
  },

  errors: {
    unauthorized: "Unauthorized.",
    invalidBody: "Invalid request body.",
    invalidSource: "Invalid source.",
    playlistUrlMissing: "Enter a YouTube playlist URL first.",
    playlistUnreadable: "That playlist could not be read; make sure it is public.",
    livePlaylistEmpty: "The live playlist is empty; there is nothing to copy.",
    invalidStartIndex: "Invalid start index.",
    emptyLink: "The link is empty.",
    wrongPassword: "Wrong password.",
    adminDisabled: "Admin panel is disabled: ADMIN_PASSWORD is not set.",
    readOnlyWhileBackup:
      "Editing is disabled while the backup playlist is on air. Switch back to live first.",
    trackFieldMissing: "#{index}: videoId or duration is missing.",
    uploadNoFile: "No file selected.",
    uploadBadType: "Unsupported file type.",
    uploadTooLarge: "File is too large (50 MB max).",
    uploadNoDuration:
      "Could not read the track duration. Try an MP3 — other formats rely on the browser for duration.",
    uploadFailed: "Upload to storage failed.",

    INVALID_URL: "Not a valid YouTube link or video id.",
    VIDEO_NOT_FOUND: "Video not found (it may be deleted or private).",
    NO_DURATION: "Could not determine the track duration.",
    IS_LIVE: "Live streams cannot be added — they have no fixed duration.",
    DURATION_UNREADABLE:
      "Could not read the duration. YouTube access from this server may be restricted — try setting YOUTUBE_API_KEY.",
    UPSTREAM_ERROR: "Could not reach YouTube.",
    INVALID_PLAYLIST_URL: "Not a valid YouTube playlist URL.",
    PLAYLIST_NOT_FOUND: "Playlist not found (it may be private or deleted).",
    PLAYLIST_EMPTY: "The playlist appears to be empty.",

    playerInvalidId: "Invalid video id.",
    playerUnsupported: "This video is not supported in the player.",
    playerRemoved: "The video has been removed or made private.",
    playerNotEmbeddable:
      "The rights holder does not allow this video to play on other sites.",
    playerGeneric: "This track could not be played.",
    playerApiFailed: "The YouTube player failed to load.",

    storeReadOnly:
      "Could not save the playlist: the file system is read-only. To make changes in production, set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
    backupPlaylistEmpty: "The backup playlist is empty — switching would take the station off air. Fill it first with `RADIO_SOURCE=file npm run radio:add`.",
    sourceSwitchUnavailable:
      "Cannot switch source: Upstash Redis is not configured, the local file is already in use.",
  },

  meta: {
    description: "{station}: {shareTagline}.",
    trackDescription: "Playing on {station}. {shareTagline}.",
    adminTitle: "Broadcast Admin",
  },
};
