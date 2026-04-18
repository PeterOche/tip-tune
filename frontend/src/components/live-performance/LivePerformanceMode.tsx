import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import io, { Socket } from 'socket.io-client';
import { Eye, EyeOff, Maximize, Minimize, Play, RotateCcw, Square } from 'lucide-react';
import LiveTipAlert from './LiveTipAlert';
import SessionTicker from './SessionTicker';
import HypeMeter from './HypeMeter';
import LiveLeaderboard from './LiveLeaderboard';
import type { LeaderboardEntry, LiveSessionState, LiveTipEvent } from './types';
import { truncateAddress } from '../../utils/stellar';

const SESSION_STORAGE_KEY = 'tiptune.livePerformance.session.v1';
const LARGE_TIP_THRESHOLD_XLM = 25;
const MAX_ALERTS = 6;
const MAX_PARTICLES = 24;
export const TIP_BATCH_WINDOW_MS = 120;
const HYPE_DECAY_INTERVAL_MS = 1000;
const HYPE_DECAY_STEP = 3;
const PARTICLE_CLEAR_MS = 1500;

interface TipNotificationPayload {
  type?: string;
  data?: {
    tipId?: string;
    amount?: number;
    asset?: string;
    senderAddress?: string;
    isAnonymous?: boolean;
    createdAt?: string | Date;
  };
}

interface BurstParticle {
  id: string;
  x: number;
  y: number;
  duration: number;
  size: number;
}

interface QueuedTip {
  alert: LiveTipEvent;
  supporterId: string;
  hypeBoost: number;
  xlmAmount: number;
}

const createDefaultSessionState = (): LiveSessionState => ({
  artistId: '',
  isSessionActive: false,
  privacyMode: false,
  sessionStartedAt: null,
  sessionTotalXlm: 0,
  tipCount: 0,
  hypeScore: 0,
  alerts: [],
  leaderboard: [],
});

const sanitizeLeaderboard = (entries: unknown[]): LeaderboardEntry[] =>
  entries.map((entry, index) => {
    const candidate = entry as Partial<LeaderboardEntry>;
    const tipperName =
      typeof candidate.tipperName === 'string' && candidate.tipperName.trim()
        ? candidate.tipperName
        : `Supporter ${index + 1}`;

    return {
      supporterId:
        typeof candidate.supporterId === 'string' && candidate.supporterId.trim()
          ? candidate.supporterId
          : tipperName,
      tipperName,
      total: typeof candidate.total === 'number' ? candidate.total : Number(candidate.total) || 0,
      tipCount: typeof candidate.tipCount === 'number' ? candidate.tipCount : Number(candidate.tipCount) || 0,
      sortOrder:
        typeof candidate.sortOrder === 'number' && Number.isFinite(candidate.sortOrder)
          ? candidate.sortOrder
          : index,
    };
  });

const compareLeaderboardEntries = (left: LeaderboardEntry, right: LeaderboardEntry): number =>
  right.total - left.total ||
  right.tipCount - left.tipCount ||
  left.sortOrder - right.sortOrder ||
  left.tipperName.localeCompare(right.tipperName);

const getNextLeaderboardSortOrder = (entries: LeaderboardEntry[]): number =>
  entries.reduce((max, entry) => Math.max(max, entry.sortOrder), -1) + 1;

const defaultSessionState = createDefaultSessionState();

const loadSessionState = (): LiveSessionState => {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return createDefaultSessionState();
    const parsed = JSON.parse(raw) as LiveSessionState;
    return {
      ...defaultSessionState,
      ...parsed,
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
      leaderboard: Array.isArray(parsed.leaderboard) ? sanitizeLeaderboard(parsed.leaderboard) : [],
    };
  } catch {
    return createDefaultSessionState();
  }
};

const getSocketBaseUrl = (): string => {
  const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
  return apiUrl.replace('/api', '');
};

const normalizeIncomingTip = (payload: TipNotificationPayload, fallbackId: number): QueuedTip | null => {
  const tip = payload.data;
  if (!tip || typeof tip.amount !== 'number') return null;

  const amount = tip.amount;
  const asset = tip.asset || 'XLM';
  const isXlmTip = asset.toUpperCase() === 'XLM';
  const tipperName = tip.isAnonymous ? 'Anonymous fan' : truncateAddress(tip.senderAddress || 'Guest fan', 5, 4);
  const supporterId = tip.isAnonymous ? 'anonymous' : tip.senderAddress?.trim() || tipperName;
  const createdAt = typeof tip.createdAt === 'string' ? tip.createdAt : new Date().toISOString();
  const isLargeTip = isXlmTip && amount >= LARGE_TIP_THRESHOLD_XLM;

  return {
    supporterId,
    hypeBoost: Math.max(8, amount * 1.2),
    xlmAmount: isXlmTip ? amount : 0,
    alert: {
      id: tip.tipId || `tip-${fallbackId}`,
      tipperName,
      amount,
      asset,
      createdAt,
      isLargeTip,
    },
  };
};

const applyTipBatch = (
  previousSession: LiveSessionState,
  queuedTips: QueuedTip[],
  nextSortOrderRef: React.MutableRefObject<number>,
): LiveSessionState => {
  const leaderboardBySupporter = new Map(
    previousSession.leaderboard.map((entry) => [entry.supporterId, entry] as const),
  );

  let tipCount = previousSession.tipCount;
  let sessionTotalXlm = previousSession.sessionTotalXlm;
  let hypeScore = previousSession.hypeScore;

  queuedTips.forEach((queuedTip) => {
    tipCount += 1;
    sessionTotalXlm += queuedTip.xlmAmount;
    hypeScore = Math.min(100, hypeScore + queuedTip.hypeBoost);

    const existing = leaderboardBySupporter.get(queuedTip.supporterId);
    if (existing) {
      leaderboardBySupporter.set(queuedTip.supporterId, {
        ...existing,
        tipperName: queuedTip.alert.tipperName,
        total: existing.total + queuedTip.xlmAmount,
        tipCount: existing.tipCount + 1,
      });
      return;
    }

    leaderboardBySupporter.set(queuedTip.supporterId, {
      supporterId: queuedTip.supporterId,
      tipperName: queuedTip.alert.tipperName,
      total: queuedTip.xlmAmount,
      tipCount: 1,
      sortOrder: nextSortOrderRef.current++,
    });
  });

  return {
    ...previousSession,
    tipCount,
    sessionTotalXlm,
    hypeScore,
    alerts: [...queuedTips.map((queuedTip) => queuedTip.alert).reverse(), ...previousSession.alerts].slice(
      0,
      MAX_ALERTS,
    ),
    leaderboard: Array.from(leaderboardBySupporter.values()).sort(compareLeaderboardEntries),
  };
};

const LivePerformanceMode: React.FC = () => {
  const initialSession = useMemo(() => loadSessionState(), []);
  const [session, setSession] = useState<LiveSessionState>(initialSession);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(Boolean(document.fullscreenElement));
  const [isConnected, setIsConnected] = useState(false);
  const [lastTipAt, setLastTipAt] = useState<string | null>(initialSession.alerts[0]?.createdAt ?? null);
  const [burstParticles, setBurstParticles] = useState<BurstParticle[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const flushTimeoutRef = useRef<number | null>(null);
  const burstTimeoutRef = useRef<number | null>(null);
  const queuedTipsRef = useRef<QueuedTip[]>([]);
  const previousArtistIdRef = useRef<string>('');
  const sessionActiveRef = useRef(initialSession.isSessionActive);
  const artistIdRef = useRef(initialSession.artistId);
  const nextTipIdRef = useRef(0);
  const nextLeaderboardSortOrderRef = useRef(getNextLeaderboardSortOrder(initialSession.leaderboard));

  useEffect(() => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }, [session]);

  useEffect(() => {
    sessionActiveRef.current = session.isSessionActive;
    artistIdRef.current = session.artistId;
  }, [session.artistId, session.isSessionActive]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSession((prev) => {
        if (prev.hypeScore <= 0) return prev;
        return {
          ...prev,
          hypeScore: Math.max(0, prev.hypeScore - HYPE_DECAY_STEP),
        };
      });
    }, HYPE_DECAY_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, []);

  const addParticleBurst = useCallback(() => {
    if (burstTimeoutRef.current !== null) {
      window.clearTimeout(burstTimeoutRef.current);
    }

    const now = Date.now();
    const particles: BurstParticle[] = Array.from({ length: MAX_PARTICLES }).map((_, index) => ({
      id: `${now}-${index}`,
      x: Math.random() * 100,
      y: Math.random() * 100,
      duration: 900 + Math.random() * 1000,
      size: 5 + Math.random() * 8,
    }));
    setBurstParticles(particles);
    burstTimeoutRef.current = window.setTimeout(() => {
      setBurstParticles([]);
      burstTimeoutRef.current = null;
    }, PARTICLE_CLEAR_MS);
  }, []);

  const flushQueuedTips = useCallback(() => {
    if (flushTimeoutRef.current !== null) {
      window.clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }

    const queuedTips = queuedTipsRef.current;
    if (queuedTips.length === 0) return;

    queuedTipsRef.current = [];
    const latestTipAt = queuedTips[queuedTips.length - 1]?.alert.createdAt ?? new Date().toISOString();
    const hasLargeTip = queuedTips.some((queuedTip) => queuedTip.alert.isLargeTip);

    startTransition(() => {
      setSession((prev) => applyTipBatch(prev, queuedTips, nextLeaderboardSortOrderRef));
      setLastTipAt(latestTipAt);
    });

    if (hasLargeTip) {
      addParticleBurst();
    }
  }, [addParticleBurst]);

  const scheduleTipFlush = useCallback(() => {
    if (flushTimeoutRef.current !== null) return;

    flushTimeoutRef.current = window.setTimeout(() => {
      flushQueuedTips();
    }, TIP_BATCH_WINDOW_MS);
  }, [flushQueuedTips]);

  const handleIncomingTip = useCallback(
    (payload: TipNotificationPayload) => {
      if (!sessionActiveRef.current) return;

      const nextTipId = nextTipIdRef.current;
      const queuedTip = normalizeIncomingTip(payload, nextTipId);
      if (!queuedTip) return;

      nextTipIdRef.current = nextTipId + 1;
      queuedTipsRef.current.push(queuedTip);
      scheduleTipFlush();
    },
    [scheduleTipFlush],
  );

  useEffect(() => {
    const socket = io(`${getSocketBaseUrl()}/tips`, {
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      const artistId = artistIdRef.current.trim();
      if (artistId) {
        socket.emit('join_artist_room', { artistId });
        previousArtistIdRef.current = artistId;
      }
    });

    socket.on('disconnect', () => setIsConnected(false));
    socket.on('tip_notification', handleIncomingTip);

    return () => {
      if (flushTimeoutRef.current !== null) {
        window.clearTimeout(flushTimeoutRef.current);
      }
      if (burstTimeoutRef.current !== null) {
        window.clearTimeout(burstTimeoutRef.current);
      }
      socket.off('tip_notification', handleIncomingTip);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [handleIncomingTip]);

  useEffect(() => {
    const socket = socketRef.current;
    const nextArtistId = session.artistId.trim();
    const previousArtistId = previousArtistIdRef.current;

    if (!socket || !socket.connected) {
      if (!nextArtistId) {
        previousArtistIdRef.current = '';
      }
      return;
    }

    if (previousArtistId && previousArtistId !== nextArtistId) {
      socket.emit('leave_artist_room', { artistId: previousArtistId });
    }
    if (nextArtistId && nextArtistId !== previousArtistId) {
      socket.emit('join_artist_room', { artistId: nextArtistId });
      previousArtistIdRef.current = nextArtistId;
      return;
    }

    if (!nextArtistId) {
      previousArtistIdRef.current = '';
    }
  }, [session.artistId]);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      return;
    }
    await document.exitFullscreen();
  }, []);

  const setArtistId = useCallback((artistId: string) => {
    artistIdRef.current = artistId;
    setSession((prev) => {
      if (prev.artistId === artistId) return prev;
      return { ...prev, artistId };
    });
  }, []);

  const startSession = useCallback(() => {
    sessionActiveRef.current = true;
    setSession((prev) => {
      if (prev.isSessionActive && prev.sessionStartedAt) return prev;
      return {
        ...prev,
        isSessionActive: true,
        sessionStartedAt: prev.sessionStartedAt || new Date().toISOString(),
      };
    });
  }, []);

  const endSession = useCallback(() => {
    sessionActiveRef.current = false;
    setSession((prev) => {
      if (!prev.isSessionActive) return prev;
      return { ...prev, isSessionActive: false };
    });
  }, []);

  const togglePrivacyMode = useCallback(() => {
    setSession((prev) => ({ ...prev, privacyMode: !prev.privacyMode }));
  }, []);

  const resetSession = useCallback(() => {
    sessionActiveRef.current = false;
    queuedTipsRef.current = [];
    nextLeaderboardSortOrderRef.current = 0;
    nextTipIdRef.current = 0;

    if (flushTimeoutRef.current !== null) {
      window.clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }
    if (burstTimeoutRef.current !== null) {
      window.clearTimeout(burstTimeoutRef.current);
      burstTimeoutRef.current = null;
    }

    setBurstParticles([]);
    setSession((prev) => ({
      ...prev,
      sessionStartedAt: null,
      sessionTotalXlm: 0,
      tipCount: 0,
      hypeScore: 0,
      alerts: [],
      leaderboard: [],
      isSessionActive: false,
    }));
    setLastTipAt(null);
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }, []);

  const sessionClockLabel = useMemo(() => {
    if (!session.sessionStartedAt) return 'Not started';
    return new Date(session.sessionStartedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [session.sessionStartedAt]);

  return (
    <section className="fixed inset-0 z-40 overflow-auto bg-gradient-to-b from-[#050b13] via-[#09192b] to-[#081220] text-white">
      <div className="relative mx-auto min-h-screen w-full max-w-[1600px] px-4 py-5 sm:px-6 md:px-8">
        {burstParticles.map((particle) => (
          <span
            key={particle.id}
            className="pointer-events-none absolute rounded-full bg-gold/70"
            style={{
              width: particle.size,
              height: particle.size,
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              animation: `coin-fly ${particle.duration}ms ease-out forwards`,
            }}
            aria-hidden="true"
          />
        ))}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-primary/40 bg-navy/70 p-3 backdrop-blur">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Live Performance Mode</h1>
            <p className="text-sm text-slate-300">
              Session started: {sessionClockLabel} | WebSocket: {isConnected ? 'Connected' : 'Disconnected'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={togglePrivacyMode}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800/60"
            >
              {session.privacyMode ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {session.privacyMode ? 'Disable privacy' : 'Enable privacy'}
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800/60"
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="rounded-2xl border border-blue-primary/40 bg-navy/80 p-4 lg:col-span-4">
            <label htmlFor="live-artist-id" className="text-xs uppercase tracking-[0.2em] text-ice-blue">
              Artist ID (room subscription)
            </label>
            <input
              id="live-artist-id"
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none focus:border-blue-primary"
              value={session.artistId}
              onChange={(event) => setArtistId(event.target.value)}
              placeholder="Enter artist UUID"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={startSession}
                className="inline-flex items-center gap-2 rounded-lg bg-mint px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-mint/90"
              >
                <Play className="h-4 w-4" />
                Start session
              </button>
              <button
                type="button"
                onClick={endSession}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-300 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-200"
              >
                <Square className="h-4 w-4" />
                End session
              </button>
              <button
                type="button"
                onClick={resetSession}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-400 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-rose-300"
              >
                <RotateCcw className="h-4 w-4" />
                Reset stats
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-300">
              Stats persist locally until reset. Session can be paused/resumed.
            </p>
          </div>

          <div className="lg:col-span-4">
            <SessionTicker
              totalXlm={session.sessionTotalXlm}
              tipCount={session.tipCount}
              isSessionActive={session.isSessionActive}
              privacyMode={session.privacyMode}
            />
            <p className="mt-2 text-xs text-slate-300">
              Last tip: {lastTipAt ? new Date(lastTipAt).toLocaleTimeString() : 'No tips yet'}
            </p>
          </div>

          <div className="lg:col-span-4">
            <HypeMeter value={session.hypeScore} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="xl:col-span-8">
            <div className="rounded-2xl border border-blue-primary/40 bg-navy/60 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-ice-blue">
                Live tip alerts
              </h2>
              <div role="list" aria-label="Live tip feed" className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                {session.alerts.length === 0 ? (
                  <p className="col-span-full rounded-xl border border-slate-700 bg-slate-900/40 p-5 text-sm text-slate-300">
                    Waiting for live tips. Start session and ensure an artist room is selected.
                  </p>
                ) : (
                  session.alerts.map((tip) => (
                    <LiveTipAlert key={tip.id} tip={tip} privacyMode={session.privacyMode} />
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="xl:col-span-4">
            <LiveLeaderboard entries={session.leaderboard} privacyMode={session.privacyMode} />
          </div>
        </div>
      </div>
    </section>
  );
};

export default LivePerformanceMode;
