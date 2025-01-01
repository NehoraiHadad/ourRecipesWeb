import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Typography } from '@/components/ui/Typography';

interface SyncStatusData {
  recipes: {
    total: number;
    synced: number;
    unsynced: number;
  };
  places: {
    total: number;
    synced: number;
    unsynced: number;
  };
}

interface SyncStatusProps {
  compact?: boolean;
}

export function SyncStatus({ compact = false }: SyncStatusProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatusData | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const fetchSyncStatus = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sync/status`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch sync status');
      const data = await response.json();
      setSyncStatus(data);
    } catch (error) {
      console.error('Failed to fetch sync status:', error);
      setError('Failed to fetch sync status');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSyncStatus();
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    setError(null);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sync`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Sync failed');
      await fetchSyncStatus();
    } catch (error) {
      console.error('Sync failed:', error);
      setError('Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  if (!syncStatus) return null;

  const totalUnsynced = syncStatus.recipes.unsynced + syncStatus.places.unsynced;

  if (compact) {
    return (
      <div className="relative flex justify-end">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-2 text-sm hover:bg-gray-50 rounded px-2 py-1 transition-colors"
          >
            <svg
              className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {totalUnsynced > 0 ? (
              <span className="text-amber-600">
                {totalUnsynced} לא מסונכרנים
              </span>
            ) : (
              <span className="text-green-600">הכל מסונכרן</span>
            )}
          </button>
          {totalUnsynced > 0 && (
            <Button
              onClick={handleSync}
              disabled={isSyncing}
              size="sm"
              className="bg-amber-600 hover:bg-amber-700"
            >
              {isSyncing ? 'מסנכרן...' : 'סנכרן'}
            </Button>
          )}
        </div>

        {/* Popup with details */}
        {showDetails && (
          <div className="absolute left-0 md:left-auto top-full mt-2 bg-white rounded-lg shadow-lg p-4 z-50 w-[300px] border">
            <div className="flex justify-between items-start mb-4">
              <Typography variant="h3" className="text-lg">פרטי סנכרון</Typography>
              <button
                onClick={fetchSyncStatus}
                disabled={isRefreshing}
                className="p-1.5 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50"
                title="רענן נתונים"
              >
                <svg
                  className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>
            <div className="space-y-2">
              <div>
                <Typography variant="body" className="text-secondary-600">
                  מתכונים: {syncStatus.recipes.synced} מסונכרנים מתוך {syncStatus.recipes.total}
                  {syncStatus.recipes.unsynced > 0 && (
                    <span className="text-amber-600"> ({syncStatus.recipes.unsynced} לא מסונכרנים)</span>
                  )}
                </Typography>
              </div>
              <div>
                <Typography variant="body" className="text-secondary-600">
                  המלצות: {syncStatus.places.synced} מסונכרנים מתוך {syncStatus.places.total}
                  {syncStatus.places.unsynced > 0 && (
                    <span className="text-amber-600"> ({syncStatus.places.unsynced} לא מסונכרנים)</span>
                  )}
                </Typography>
              </div>
            </div>
            {error && (
              <Typography variant="body" className="text-red-600 mt-2">
                {error}
              </Typography>
            )}
          </div>
        )}
      </div>
    );
  }

  // Original full view
  return (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Typography variant="h3" className="text-xl">סטטוס סנכרון</Typography>
              <button
                onClick={fetchSyncStatus}
                disabled={isRefreshing}
                className="p-1.5 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50"
                title="רענן נתונים"
              >
                <svg
                  className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
              {totalUnsynced > 0 && (
                <span className="text-amber-600 text-sm">
                  ({totalUnsynced} פריטים לא מסונכרנים)
                </span>
              )}
            </div>
            <div className="space-y-2">
              <div>
                <Typography variant="body" className="text-secondary-600">
                  מתכונים: {syncStatus.recipes.synced} מסונכרנים מתוך {syncStatus.recipes.total}
                  {syncStatus.recipes.unsynced > 0 && (
                    <span className="text-amber-600"> ({syncStatus.recipes.unsynced} לא מסונכרנים)</span>
                  )}
                </Typography>
              </div>
              <div>
                <Typography variant="body" className="text-secondary-600">
                  המלצות: {syncStatus.places.synced} מסונכרנים מתוך {syncStatus.places.total}
                  {syncStatus.places.unsynced > 0 && (
                    <span className="text-amber-600"> ({syncStatus.places.unsynced} לא מסונכרנים)</span>
                  )}
                </Typography>
              </div>
            </div>
            {error && (
              <Typography variant="body" className="text-red-600 mt-2">
                {error}
              </Typography>
            )}
          </div>
          <Button
            onClick={handleSync}
            disabled={isSyncing || totalUnsynced === 0}
            className={totalUnsynced > 0 ? 'bg-amber-600 hover:bg-amber-700' : ''}
          >
            {isSyncing ? (
              <>
                <span className="ml-2">⏳</span>
                מסנכרן...
              </>
            ) : totalUnsynced > 0 ? (
              <>
                <span className="ml-2">🔄</span>
                סנכרן ({totalUnsynced})
              </>
            ) : (
              <>
                <span className="ml-2">✓</span>
                הכל מסונכרן
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
} 