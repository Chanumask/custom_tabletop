import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Player, ProfileImage } from '@custom-tabletop/shared';
import {
  checkProfileFile,
  profileImageUrl,
  fetchProfileImage,
  releaseProfileImages,
  rememberProfileImageUrl,
  removeProfileImage,
  uploadProfileImage,
  type PlayerCredentials,
} from './profileImages.js';
import {
  forgetDeviceCopy,
  loadDeviceCopy,
  loadKeepCopy,
  markShared,
  saveDeviceCopy,
  saveKeepCopy,
  wantsShared,
} from './profileMemory.js';
import type { ToastKind } from './useToasts.js';

/** What the session menu needs to show and change the player's profile
 * image, and for the host to view everyone's (docs/decisions.md, "Player
 * profiles"). */
export interface ProfileSharing {
  /** Your own, as the table has it. */
  own: ProfileImage | null;
  /** An upload in progress (0–1), or null. */
  progress: number | null;
  /** Why the last share or withdrawal didn't work. */
  error: string | null;
  share: (file: Blob) => void;
  cancel: () => void;
  remove: () => void;
  /** Whether this device keeps a copy to offer at the next table. */
  keepCopy: boolean;
  setKeepCopy: (keep: boolean) => void;
  /** The copy this device keeps (undefined while it's being looked up). */
  deviceCopy: Blob | null | undefined;
  /** An object URL for a player's image: your own, or anyone's as host. */
  imageUrl: (player: Player) => Promise<string>;
}

interface Options {
  sessionId: string | null;
  playerId: string;
  playerToken: string;
  players: Player[];
  hostId: string | null;
  /** Counts successful joins: each one may need the image shared again. */
  joinEpoch: number;
  toast: (text: string, kind?: ToastKind) => void;
}

/**
 * Shares, replaces and withdraws the player's profile image, and keeps it
 * shared: a table that lost it (the player dropped for too long and came
 * back, a server that lost the file) gets it again by itself — unless the
 * player withdrew it. Also keeps the device copy offered on the join
 * screen, and tells the host when someone shares one.
 */
export function useProfileSharing({
  sessionId,
  playerId,
  playerToken,
  players,
  hostId,
  joinEpoch,
  toast,
}: Options) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keepCopy, setKeepCopyState] = useState(() => loadKeepCopy(window.localStorage));
  const [deviceCopy, setDeviceCopy] = useState<Blob | null | undefined>(undefined);
  const upload = useRef<AbortController | null>(null);
  /** What the join screen chose to share, for the table being joined. */
  const pending = useRef<{ sessionId: string; file: Blob | null } | null>(null);
  /** The join the table was last checked for a missing image after. */
  const checkedEpoch = useRef(-1);
  /** The file behind the image this tab shared last (to share it again). */
  const lastShared = useRef<Blob | null>(null);
  const keepCopyRef = useRef(keepCopy);
  keepCopyRef.current = keepCopy;

  const self = players.find((player) => player.id === playerId);
  const own = self?.profileImage ?? null;
  const isHost = hostId === playerId;

  const credentials = useMemo<PlayerCredentials | null>(
    () => (sessionId ? { sessionId, playerId, playerToken } : null),
    [sessionId, playerId, playerToken],
  );
  const credentialsRef = useRef(credentials);
  credentialsRef.current = credentials;

  useEffect(() => {
    let cancelled = false;
    void loadDeviceCopy().then((copy) => !cancelled && setDeviceCopy(copy));
    return () => {
      cancelled = true;
    };
  }, []);

  const keepOnDevice = useCallback(async (file: Blob) => {
    if (!keepCopyRef.current) return;
    if (await saveDeviceCopy(file)) setDeviceCopy(file);
  }, []);

  /** `how`: picked in the menu (a failure shows there), chosen on the join
   * screen, or shared again after the table lost it — both of those happen
   * in the background, so a failure is also said out loud. */
  const share = useCallback(
    async (file: Blob, how: 'picked' | 'joined' | 'again') => {
      const target = credentialsRef.current;
      if (!target) return;
      upload.current?.abort();
      const controller = new AbortController();
      upload.current = controller;
      setError(null);
      setProgress(0);
      try {
        const check = await checkProfileFile(file);
        if (!check.ok) throw new Error(check.error);
        if (controller.signal.aborted) return;
        const image = await uploadProfileImage(target, file, setProgress, controller.signal);
        lastShared.current = file;
        rememberProfileImageUrl(image, file);
        markShared(window.sessionStorage, target.sessionId);
        void keepOnDevice(file);
        toast(
          how === 'again'
            ? 'Your profile is shared with the host again.'
            : 'Profile shared — only you and the host can see it.',
        );
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        const message = reason instanceof Error ? reason.message : 'Sharing didn’t work.';
        setError(message);
        if (how !== 'picked') toast(`Your profile wasn’t shared: ${message}`, 'error');
      } finally {
        if (upload.current === controller) {
          upload.current = null;
          setProgress(null);
        }
      }
    },
    [keepOnDevice, toast],
  );

  const cancel = useCallback(() => {
    upload.current?.abort();
    upload.current = null;
    setProgress(null);
  }, []);

  const remove = useCallback(async () => {
    const target = credentialsRef.current;
    if (!target) return;
    cancel();
    setError(null);
    markShared(window.sessionStorage, null);
    try {
      await removeProfileImage(target);
      toast('Profile removed — the host no longer sees it.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Removing it didn’t work.');
    }
  }, [cancel, toast]);

  const setKeepCopy = useCallback(
    (keep: boolean) => {
      setKeepCopyState(keep);
      keepCopyRef.current = keep;
      saveKeepCopy(window.localStorage, keep);
      if (!keep) {
        setDeviceCopy(null);
        void forgetDeviceCopy();
        return;
      }
      // Keep the image shared right now, fetched back if this tab doesn't
      // have its file (shared before a reload).
      const target = credentialsRef.current;
      if (lastShared.current) void keepOnDevice(lastShared.current);
      else if (target && own) {
        void fetchProfileImage(target, playerId).then(keepOnDevice, () => {});
      }
    },
    [keepOnDevice, own, playerId],
  );

  /** The join screen's choice, shared once the join has gone through. */
  const afterJoin = useCallback((joined: string, file: Blob | null) => {
    pending.current = { sessionId: joined, file };
  }, []);

  // After each join: share what the join screen chose, or — rejoining —
  // what the table lost.
  useEffect(() => {
    if (!sessionId || !self || checkedEpoch.current === joinEpoch) return;
    checkedEpoch.current = joinEpoch;
    const chosen = pending.current?.sessionId === sessionId ? pending.current : null;
    pending.current = null;
    if (chosen) {
      if (chosen.file) void share(chosen.file, 'joined');
      else if (own) void remove();
      else markShared(window.sessionStorage, null);
      return;
    }
    if (own || !wantsShared(window.sessionStorage, sessionId)) return;
    const file = lastShared.current;
    if (file) {
      void share(file, 'again');
      return;
    }
    void loadDeviceCopy().then((copy) => {
      if (copy) void share(copy, 'again');
      else markShared(window.sessionStorage, null);
    });
  }, [sessionId, self, own, joinEpoch, share, remove]);

  // The host hears when someone shares or changes theirs (not about the
  // ones already there when they joined or took over).
  const seen = useRef<{ sessionId: string; images: Map<string, string> } | null>(null);
  useEffect(() => {
    if (!isHost || !sessionId) {
      seen.current = null;
      return;
    }
    const current = new Map<string, string>();
    for (const player of players) {
      if (player.profileImage && player.id !== playerId) {
        current.set(player.id, player.profileImage.id);
      }
    }
    const before = seen.current?.sessionId === sessionId ? seen.current.images : null;
    seen.current = { sessionId, images: current };
    if (!before) return;
    for (const player of players) {
      const now = current.get(player.id);
      if (!now || before.get(player.id) === now) continue;
      toast(
        before.has(player.id)
          ? `${player.name} updated their profile.`
          : `${player.name} shared a profile — see it in the Players tab.`,
      );
    }
  }, [isHost, sessionId, players, playerId, toast]);

  // Images this player can no longer see (replaced, withdrawn, no longer
  // host) are let go.
  useEffect(() => {
    const visible = new Set<string>();
    for (const player of players) {
      if (player.profileImage) visible.add(player.profileImage.id);
    }
    releaseProfileImages(visible);
  }, [players]);

  // Leaving the table: nothing of it stays in memory.
  useEffect(() => {
    if (sessionId) return;
    cancel();
    lastShared.current = null;
    releaseProfileImages(new Set());
  }, [sessionId, cancel]);

  const imageUrl = useCallback((player: Player) => {
    const target = credentialsRef.current;
    if (!target || !player.profileImage) {
      return Promise.reject(new Error('There’s no profile shared.'));
    }
    return profileImageUrl(target, player.id, player.profileImage);
  }, []);

  const sharing: ProfileSharing = {
    own,
    progress,
    error,
    share: (file) => void share(file, 'picked'),
    cancel,
    remove: () => void remove(),
    keepCopy,
    setKeepCopy,
    deviceCopy,
    imageUrl,
  };
  return { sharing, afterJoin };
}
