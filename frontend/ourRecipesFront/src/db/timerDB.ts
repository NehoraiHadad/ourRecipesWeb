import type { Timer } from '@/context/TimerContext';

const DB_NAME = 'TimersDB';
const DB_VERSION = 1;
const TIMERS_STORE = 'timers';
const SETTINGS_STORE = 'settings';

interface TimerSettings {
  isSoundMuted: boolean;
  notificationsEnabled: boolean;
}

export class TimerDB {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create timers store
        if (!db.objectStoreNames.contains(TIMERS_STORE)) {
          const timerStore = db.createObjectStore(TIMERS_STORE, { keyPath: 'id' });
          timerStore.createIndex('timeLeft', 'timeLeft');
        }

        // Create settings store
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE);
        }
      };
    });
  }

  async saveTimer(timer: Timer): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(TIMERS_STORE, 'readwrite');
      const store = transaction.objectStore(TIMERS_STORE);
      
      const request = store.put(timer);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getAllTimers(): Promise<Timer[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(TIMERS_STORE, 'readonly');
      const store = transaction.objectStore(TIMERS_STORE);
      
      const request = store.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async removeTimer(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(TIMERS_STORE, 'readwrite');
      const store = transaction.objectStore(TIMERS_STORE);
      
      const request = store.delete(id);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async updateTimer(id: string, updates: Partial<Timer>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(TIMERS_STORE, 'readwrite');
      const store = transaction.objectStore(TIMERS_STORE);
      
      const request = store.get(id);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const timer = request.result;
        if (!timer) {
          reject(new Error('Timer not found'));
          return;
        }

        const updatedTimer = { ...timer, ...updates };
        const putRequest = store.put(updatedTimer);
        
        putRequest.onerror = () => reject(putRequest.error);
        putRequest.onsuccess = () => resolve();
      };
    });
  }

  async getSettings(): Promise<TimerSettings> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(SETTINGS_STORE, 'readonly');
      const store = transaction.objectStore(SETTINGS_STORE);
      
      const request = store.get('settings');
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve(request.result || {
          isSoundMuted: false,
          notificationsEnabled: false
        });
      };
    });
  }

  async saveSettings(settings: TimerSettings): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(SETTINGS_STORE, 'readwrite');
      const store = transaction.objectStore(SETTINGS_STORE);
      
      const request = store.put(settings, 'settings');
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

// Create a singleton instance
export const timerDB = new TimerDB(); 