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

interface SessionStatusFile {
  status: 'ok' | 'missing' | 'possibly_corrupt';
  exists: boolean;
  size: number;
  last_modified: string | null;
  description: string;
}

interface SessionStatusResponse {
  status: 'healthy' | 'error';
  files: Record<string, 'ok' | 'missing' | 'possibly_corrupt'>;
  details: Record<string, SessionStatusFile>;
  last_check: string;
}

interface SessionRefreshResponse {
  status: 'ok' | 'error';
  message: string;
  details?: SessionStatusResponse;
}

// Helper function to safely access nested properties with proper type inference
const safeGet = <T, K extends keyof T>(obj: T | null | undefined, key: K): NonNullable<T>[K] | undefined => {
  return obj ? obj[key] : undefined;
};

// Helper function to safely access sync status data
const getSyncData = (status: SyncStatusData | null, type: 'recipes' | 'places') => {
  const data = safeGet(status, type);
  return {
    total: data?.total ?? 0,
    synced: data?.synced ?? 0,
    unsynced: data?.unsynced ?? 0
  };
};

export function SyncStatus({ compact = false }: SyncStatusProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatusData | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatusResponse | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshingSession, setIsRefreshingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

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

  const fetchSessionStatus = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sync/session/status`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch session status');
      const data = await response.json();
      setSessionStatus(data);
    } catch (error) {
      console.error('Failed to fetch session status:', error);
      setError('Failed to fetch session status');
    }
  };

  const refreshSession = async () => {
    setIsRefreshingSession(true);
    setError(null);
    setRefreshMessage(null);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sync/session/refresh`, {
        method: 'POST',
        credentials: 'include'
      });
      const data: SessionRefreshResponse = await response.json();
      
      if (!response.ok) throw new Error(data.message || 'Session refresh failed');
      
      if (data.status === 'ok') {
        if (data.message.includes('no refresh needed')) {
          setRefreshMessage({ type: 'info', text: 'הקבצים תקינים, לא נדרש רענון' });
        } else {
          setRefreshMessage({ type: 'success', text: 'הקבצים רועננו בהצלחה' });
        }
        if (data.details) {
          setSessionStatus(data.details);
        } else {
          await fetchSessionStatus();
        }
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      console.error('Session refresh failed:', error);
      setError('Session refresh failed');
      setRefreshMessage({ type: 'error', text: `שגיאה ברענון הקבצים: ${error instanceof Error ? error.message : 'שגיאה לא ידועה'}` });
    } finally {
      setIsRefreshingSession(false);
    }
  };

  useEffect(() => {
    fetchSyncStatus();
    fetchSessionStatus();
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

  const renderStatusIcon = (status: 'ok' | 'missing' | 'possibly_corrupt') => {
    const baseClasses = "flex items-center justify-center w-6 h-6 rounded-full text-lg font-bold";
    switch (status) {
      case 'ok':
        return <span className={`${baseClasses} bg-green-100 text-green-600`}>✓</span>;
      case 'missing':
        return <span className={`${baseClasses} bg-red-100 text-red-600`}>✗</span>;
      default:
        return <span className={`${baseClasses} bg-amber-100 text-amber-600`}>⚠</span>;
    }
  };

  const renderRefreshMessage = () => {
    if (!refreshMessage) return null;

    const styles = {
      success: {
        bg: 'bg-green-50',
        border: 'border-green-200',
        text: 'text-green-700',
        icon: '✓'
      },
      error: {
        bg: 'bg-red-50',
        border: 'border-red-200',
        text: 'text-red-700',
        icon: '✗'
      },
      info: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-700',
        icon: 'ℹ'
      }
    }[refreshMessage.type];

    return (
      <div className={`flex items-center gap-3 rounded-md ${styles.bg} ${styles.text} px-4 py-3 text-sm border ${styles.border} my-4`}>
        <span className={`flex items-center justify-center w-6 h-6 rounded-full bg-white/80 backdrop-blur-sm shadow-sm ${styles.text} text-base font-bold shrink-0`}>
          {styles.icon}
        </span>
        <span className="leading-5">
          {refreshMessage.text}
        </span>
      </div>
    );
  };

  if (!syncStatus && !sessionStatus) return null;

  const recipesData = getSyncData(syncStatus, 'recipes');
  const placesData = getSyncData(syncStatus, 'places');
  const totalUnsynced = recipesData.unsynced + placesData.unsynced;

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
                  מתכונים: {recipesData.synced} מסונכרנים מתוך {recipesData.total}
                  {recipesData.unsynced > 0 && (
                    <span className="text-amber-600"> ({recipesData.unsynced} לא מסונכרנים)</span>
                  )}
                </Typography>
              </div>
              <div>
                <Typography variant="body" className="text-secondary-600">
                  המלצות: {placesData.synced} מסונכרנים מתוך {placesData.total}
                  {placesData.unsynced > 0 && (
                    <span className="text-amber-600"> ({placesData.unsynced} לא מסונכרנים)</span>
                  )}
                </Typography>
              </div>
              {sessionStatus && (
                <div className="mt-4">
                  <Typography variant="h4" className="text-sm font-semibold mb-2">סטטוס Session</Typography>
                  <div className="space-y-1">
                    {Object.entries(sessionStatus.files).map(([filename, status]) => (
                      <div key={filename} className="flex items-center justify-between text-sm">
                        <span className="text-secondary-600">{filename.replace('.session', '')}</span>
                        <span className={`${
                          status === 'ok' ? 'text-green-600' :
                          status === 'missing' ? 'text-red-600' :
                          'text-amber-600'
                        }`}>
                          {status === 'ok' ? '✓' :
                           status === 'missing' ? '✗' :
                           '⚠'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Button
                    onClick={refreshSession}
                    disabled={isRefreshingSession}
                    size="sm"
                    className="mt-2 w-full"
                    variant={sessionStatus.status === 'healthy' ? 'secondary' : 'primary'}
                  >
                    {isRefreshingSession ? 'מרענן...' : 'רענן Session'}
                  </Button>
                </div>
              )}
            </div>
            {renderRefreshMessage()}
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

  // Full view
  return (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Typography variant="h3" className="text-xl">פרטי סנכרון</Typography>
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
                  מתכונים: {recipesData.synced} מסונכרנים מתוך {recipesData.total}
                  {recipesData.unsynced > 0 && (
                    <span className="text-amber-600"> ({recipesData.unsynced} לא מסונכרנים)</span>
                  )}
                </Typography>
              </div>
              <div>
                <Typography variant="body" className="text-secondary-600">
                  המלצות: {placesData.synced} מסונכרנים מתוך {placesData.total}
                  {placesData.unsynced > 0 && (
                    <span className="text-amber-600"> ({placesData.unsynced} לא מסונכרנים)</span>
                  )}
                </Typography>
              </div>
              {error && (
                <Typography variant="body" className="text-red-600 mt-2">
                  {error}
                </Typography>
              )}
            </div>
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

        {sessionStatus && (
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <Typography variant="h4" className="text-lg font-medium">סטטוס Session</Typography>
              <Button
                onClick={refreshSession}
                disabled={isRefreshingSession}
                size="sm"
                variant={sessionStatus.status === 'healthy' ? 'secondary' : 'primary'}
              >
                {isRefreshingSession ? 'מרענן...' : 'רענן Session'}
              </Button>
            </div>
            {renderRefreshMessage()}
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(sessionStatus.files).map(([filename, status]) => (
                <div key={filename} className="bg-gray-50 rounded-lg p-3 flex items-start gap-3">
                  {renderStatusIcon(status)}
                  <div className="flex-1 min-w-0">
                    <Typography variant="body" className="font-medium truncate">
                      {filename.replace('.session', '')}
                    </Typography>
                    <Typography variant="body" className="text-secondary-600 text-sm">
                      {sessionStatus.details[filename].description}
                    </Typography>
                    {sessionStatus.details[filename].last_modified && (
                      <Typography variant="body" className="text-secondary-500 text-sm mt-1">
                        עודכן: {new Date(sessionStatus.details[filename].last_modified!).toLocaleString('he-IL')}
                      </Typography>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 