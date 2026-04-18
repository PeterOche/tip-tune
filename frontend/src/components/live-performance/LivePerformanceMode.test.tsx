import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import io from 'socket.io-client';
import LivePerformanceMode, { TIP_BATCH_WINDOW_MS } from './LivePerformanceMode';

const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connected: true,
};

vi.mock('socket.io-client', () => ({
  default: vi.fn(() => mockSocket),
}));

const getTipHandler = () => {
  const tipHandlerCall = mockSocket.on.mock.calls.find((call) => call[0] === 'tip_notification');
  expect(tipHandlerCall).toBeDefined();
  return tipHandlerCall![1] as (payload: unknown) => void;
};

const emitTip = (
  callback: (payload: unknown) => void,
  {
    tipId,
    amount,
    senderAddress,
    createdAt,
    asset = 'XLM',
  }: {
    tipId: string;
    amount: number;
    senderAddress: string;
    createdAt: string;
    asset?: string;
  },
) => {
  callback({
    type: 'tip_received',
    data: {
      tipId,
      amount,
      asset,
      senderAddress,
      isAnonymous: false,
      createdAt,
    },
  });
};

describe('LivePerformanceMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ingests websocket tip notifications and updates session stats', async () => {
    vi.useFakeTimers();
    render(<LivePerformanceMode />);

    fireEvent.click(screen.getByRole('button', { name: /start session/i }));
    const callback = getTipHandler();

    act(() => {
      emitTip(callback, {
        tipId: 'tip-100',
        amount: 30,
        senderAddress: 'GABCD1234EFGH5678IJKL9012MNOP3456QRST7890',
        createdAt: '2026-02-23T20:00:00.000Z',
      });
    });

    expect(screen.getByText('0.00 XLM')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(TIP_BATCH_WINDOW_MS + 1);
    });

    expect(await screen.findByText('1 tips this session')).toBeInTheDocument();
    expect(screen.getAllByText('30.00 XLM').length).toBeGreaterThan(0);
    expect(screen.getByText(/Big tip/i)).toBeInTheDocument();
    expect(screen.getByText(/Incoming tip/i)).toBeInTheDocument();

    const persisted = JSON.parse(localStorage.getItem('tiptune.livePerformance.session.v1') || '{}');
    expect(persisted.sessionTotalXlm).toBe(30);
    expect(persisted.tipCount).toBe(1);
  });

  it('masks sensitive details in privacy mode and reset clears session stats', async () => {
    vi.useFakeTimers();
    render(<LivePerformanceMode />);

    fireEvent.click(screen.getByRole('button', { name: /start session/i }));
    const callback = getTipHandler();

    act(() => {
      emitTip(callback, {
        tipId: 'tip-101',
        amount: 9,
        senderAddress: 'GTESTING1234567890ABCDEF1234567890ABCDEF12',
        createdAt: '2026-02-23T20:02:00.000Z',
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(TIP_BATCH_WINDOW_MS + 1);
    });

    fireEvent.click(screen.getByRole('button', { name: /enable privacy/i }));
    expect(screen.getByText('Hidden supporter')).toBeInTheDocument();
    expect(screen.getByText('Hidden amount')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reset stats/i }));

    await waitFor(() => {
      const persisted = JSON.parse(localStorage.getItem('tiptune.livePerformance.session.v1') || '{}');
      expect(persisted.sessionTotalXlm).toBe(0);
      expect(persisted.tipCount).toBe(0);
    });
  });

  it('connects socket to tips namespace', () => {
    render(<LivePerformanceMode />);
    expect(io).toHaveBeenCalledWith(
      expect.stringContaining('/tips'),
      expect.objectContaining({ transports: ['websocket'] }),
    );
  });

  it('batches rapid websocket bursts and keeps feed plus leaderboard ordering stable', async () => {
    vi.useFakeTimers();
    render(<LivePerformanceMode />);

    fireEvent.click(screen.getByRole('button', { name: /start session/i }));
    const callback = getTipHandler();

    act(() => {
      emitTip(callback, {
        tipId: 'tip-201',
        amount: 12,
        senderAddress: 'BRAVO0000BBBB',
        createdAt: '2026-02-23T20:10:01.000Z',
      });
      emitTip(callback, {
        tipId: 'tip-202',
        amount: 12,
        senderAddress: 'ALPHA0000AAAA',
        createdAt: '2026-02-23T20:10:02.000Z',
      });
      emitTip(callback, {
        tipId: 'tip-203',
        amount: 15,
        senderAddress: 'CHRLIE000CCCC',
        createdAt: '2026-02-23T20:10:03.000Z',
      });
      emitTip(callback, {
        tipId: 'tip-204',
        amount: 3,
        senderAddress: 'ALPHA0000AAAA',
        createdAt: '2026-02-23T20:10:04.000Z',
      });
      emitTip(callback, {
        tipId: 'tip-205',
        amount: 3,
        senderAddress: 'BRAVO0000BBBB',
        createdAt: '2026-02-23T20:10:05.000Z',
      });
    });

    expect(screen.queryByText('45.00 XLM')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);

    await act(async () => {
      vi.advanceTimersByTime(TIP_BATCH_WINDOW_MS + 1);
    });

    expect(await screen.findByText('45.00 XLM')).toBeInTheDocument();
    expect(screen.getByText('5 tips this session')).toBeInTheDocument();

    const leaderboardItems = within(screen.getByRole('list', { name: /session leaderboard/i })).getAllByRole(
      'listitem',
    );
    expect(leaderboardItems[0]).toHaveTextContent('#1 BRAVO...BBBB');
    expect(leaderboardItems[1]).toHaveTextContent('#2 ALPHA...AAAA');
    expect(leaderboardItems[2]).toHaveTextContent('#3 CHRLI...CCCC');

    const feedItems = within(screen.getByRole('list', { name: /live tip feed/i })).getAllByRole('listitem');
    expect(feedItems).toHaveLength(5);
    expect(feedItems[0]).toHaveTextContent('BRAVO...BBBB');
    expect(feedItems[0]).toHaveTextContent('3.00 XLM');
    expect(feedItems[1]).toHaveTextContent('ALPHA...AAAA');
    expect(feedItems[1]).toHaveTextContent('3.00 XLM');
    expect(feedItems[2]).toHaveTextContent('CHRLI...CCCC');
    expect(feedItems[2]).toHaveTextContent('15.00 XLM');
  });
});
