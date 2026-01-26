import React from 'react';
import { LeaderboardEntry } from '../services/leaderboardService';

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  scoreLabel?: string;
  showRankChange?: boolean;
  onEntryClick?: (entry: LeaderboardEntry) => void;
  currentUserId?: string;
}

export const LeaderboardTable: React.FC<LeaderboardTableProps> = ({
  entries,
  scoreLabel = 'Score',
  showRankChange = true,
  onEntryClick,
  currentUserId,
}) => {
  const formatScore = (score: number): string => {
    if (score >= 1000000) {
      return `${(score / 1000000).toFixed(2)}M`;
    }
    if (score >= 1000) {
      return `${(score / 1000).toFixed(2)}K`;
    }
    return score.toFixed(2);
  };

  const getRankChangeIcon = (change?: number) => {
    if (!change) return null;
    if (change > 0) {
      return (
        <span className="text-green-500 flex items-center">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
          {change}
        </span>
      );
    }
    if (change < 0) {
      return (
        <span className="text-red-500 flex items-center">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          {Math.abs(change)}
        </span>
      );
    }
    return (
      <span className="text-gray-400 flex items-center">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
        </svg>
        —
      </span>
    );
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-yellow-400 text-yellow-900 font-bold">
          🥇
        </div>
      );
    }
    if (rank === 2) {
      return (
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-300 text-gray-700 font-bold">
          🥈
        </div>
      );
    }
    if (rank === 3) {
      return (
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-orange-300 text-orange-800 font-bold">
          🥉
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 text-gray-700 font-semibold">
        {rank}
      </div>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Rank
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              {scoreLabel}
            </th>
            {showRankChange && (
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Change
              </th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {entries.map((entry) => {
            const isCurrentUser = currentUserId && entry.id === currentUserId;
            return (
              <tr
                key={entry.id}
                className={`hover:bg-gray-50 transition-colors ${
                  isCurrentUser ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                } ${onEntryClick ? 'cursor-pointer' : ''}`}
                onClick={() => onEntryClick?.(entry)}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  {getRankBadge(entry.rank)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    {entry.avatarUrl ? (
                      <img
                        className="h-10 w-10 rounded-full mr-3"
                        src={entry.avatarUrl}
                        alt={entry.name}
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gray-300 mr-3 flex items-center justify-center">
                        <span className="text-gray-600 text-sm font-medium">
                          {entry.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {entry.name}
                        {isCurrentUser && (
                          <span className="ml-2 text-xs bg-blue-500 text-white px-2 py-1 rounded">
                            You
                          </span>
                        )}
                      </div>
                      {entry.additionalData?.artistName && (
                        <div className="text-sm text-gray-500">
                          {entry.additionalData.artistName}
                        </div>
                      )}
                      {entry.additionalData?.genre && (
                        <div className="text-xs text-gray-400">
                          {entry.additionalData.genre}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <div className="text-sm font-semibold text-gray-900">
                    {formatScore(entry.score)}
                  </div>
                  {entry.additionalData?.tipCount && (
                    <div className="text-xs text-gray-500">
                      {entry.additionalData.tipCount} tips
                    </div>
                  )}
                  {entry.additionalData?.trackCount && (
                    <div className="text-xs text-gray-500">
                      {entry.additionalData.trackCount} tracks
                    </div>
                  )}
                </td>
                {showRankChange && (
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {getRankChangeIcon(entry.change)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
