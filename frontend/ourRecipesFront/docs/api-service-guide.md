# הנחיות לשימוש ב-API Service

## מבנה כללי

### 1. הגדרת Types
```typescript
// types/api.ts
export interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}

// Custom error types
export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NetworkError extends ApiError {}
export class TimeoutError extends ApiError {}
export class ValidationError extends ApiError {}
export class AuthenticationError extends ApiError {}

interface RequestOptions extends RequestInit {
  timeout?: number;
  cache?: RequestCache;
  priority?: 'high' | 'low' | 'auto';
  retryConfig?: {
    maxRetries?: number;
    retryDelay?: number;
    shouldRetry?: (error: any) => boolean;
  };
  queueKey?: string;
  signal?: AbortSignal;
  cancelToken?: CancelToken;
}
```

## תכונות מרכזיות

### 1. ניהול Cache מתקדם
```typescript
// שימוש בשני רבדי Cache
// 1. Memory Cache - מהיר אך זמני
const data = await apiService.get('/endpoint', { 
  cache: 'memory-first' 
});

// 2. IndexedDB Cache - איטי יותר אך נשמר
const data = await apiService.get('/endpoint', { 
  cache: 'persistent' 
});

// אסטרטגיות Cache
const data = await apiService.get('/endpoint', {
  cache: 'network-first' // נסה קודם מהרשת, אם נכשל - השתמש ב-cache
});

const data = await apiService.get('/endpoint', {
  cache: 'cache-first' // נסה קודם מה-cache, אם לא נמצא - פנה לרשת
});

// ניקוי Cache
apiService.clearCache(); // ניקוי גלובלי
apiService.clearCacheEntry('/endpoint'); // ניקוי ספציפי
```

### 2. תמיכה במצב Offline
```typescript
// בדיקת מצב חיבור
const isOnline = apiService.isDeviceOnline();

// קבלת בקשות בהמתנה
const pendingRequests = apiService.getOfflineRequests();

// ניקוי תור הבקשות
await apiService.clearOfflineQueue();

// הבקשות נשמרות אוטומטית במצב offline
try {
  const data = await apiService.post('/endpoint', payload);
} catch (error) {
  if (error instanceof NetworkError) {
    // הבקשה נשמרה לביצוע כשיהיה חיבור
  }
}
```

### 3. ניהול בקשות מתקדם

#### א. Request Batching
```typescript
// בקשות GET דומות מתקבצות אוטומטית
const [data1, data2] = await Promise.all([
  apiService.get('/items/1'),
  apiService.get('/items/2')
]);

// הגדרות Batching
const MAX_BATCH_SIZE = 10; // מקסימום בקשות בקבוצה
const BATCH_DELAY = 50; // המתנה במילישניות לפני שליחה
```

#### ב. Request Debouncing
```typescript
// חיפוש עם Debouncing אוטומטי
const results = await apiService.get('/search', { 
  params: { query: 'search term' }
});

// הגדרות Debouncing
const DEBOUNCE_DELAY = 300; // המתנה במילישניות
const SEARCH_ENDPOINTS = ['/search', '/suggestions'];
```

#### ג. Request Prioritization
```typescript
// בקשה בעדיפות גבוהה
const critical = await apiService.get('/important', { 
  priority: 'high' 
});

// בקשה בעדיפות נמוכה
const background = await apiService.get('/background', { 
  priority: 'low' 
});
```

### 4. אבטחה מתקדמת

#### א. CSRF Protection
```typescript
// הגנת CSRF אוטומטית
await apiService.refreshCsrfToken();

// עדכון כותרות אבטחה
apiService.updateSecurityHeaders({
  'Content-Security-Policy': 'default-src self'
});
```

#### ב. Request Cancellation
```typescript
// ביטול בקשה
const cancelToken = apiService.createCancelToken();

try {
  const data = await apiService.get('/endpoint', { 
    cancelToken 
  });
} catch (error) {
  if (error instanceof ApiError && error.status === 499) {
    // הבקשה בוטלה
  }
}

// ביטול הבקשה
cancelToken.cancel('ביטול ידני');
```

### 5. ניטור ביצועים
```typescript
// קבלת מדדי ביצועים
const metrics = apiService.getRequestMetrics();

// זמן תגובה ממוצע
const avgTime = apiService.getAverageResponseTime('/endpoint');

// אחוז הצלחה
const successRate = apiService.getSuccessRate('/endpoint');
```

### 6. טיפול בשגיאות
```typescript
try {
  const response = await apiService.get('/endpoint');
} catch (error) {
  if (error instanceof NetworkError) {
    // שגיאת רשת
  } else if (error instanceof TimeoutError) {
    // שגיאת timeout
  } else if (error instanceof ValidationError) {
    // שגיאת ולידציה
  } else if (error instanceof AuthenticationError) {
    // שגיאת אימות
  }
}
```

### 7. Retry Logic
```typescript
// הגדרת מדיניות Retry
const response = await apiService.get('/endpoint', {
  retryConfig: {
    maxRetries: 3,
    retryDelay: 1000,
    shouldRetry: (error) => error.status === 429
  }
});
```

## שימוש מומלץ

### 1. בקשות רגילות
```typescript
// GET request
const data = await apiService.get('/endpoint');

// POST request
const newItem = await apiService.post('/items', {
  name: 'חדש',
  description: 'תיאור'
});

// PUT request
const updated = await apiService.put('/items/1', {
  name: 'מעודכן'
});

// DELETE request
await apiService.delete('/items/1');
```

### 2. בקשות מורכבות
```typescript
// בקשה עם מספר אפשרויות
const response = await apiService.get('/endpoint', {
  timeout: 5000,
  cache: 'network-first',
  priority: 'high',
  retryConfig: {
    maxRetries: 3
  },
  headers: {
    'Custom-Header': 'value'
  }
});
```

### 3. ניהול מצבי רשת
```typescript
// טיפול במצב offline
try {
  const data = await apiService.get('/endpoint');
} catch (error) {
  if (error instanceof NetworkError) {
    // שמירת הבקשה לביצוע מאוחר יותר
    console.log('הבקשה תתבצע כשיהיה חיבור');
  }
}
```

## Best Practices

### 1. שימוש ב-Cache
- השתמש ב-`memory-first` עבור מידע שמשתנה לעיתים קרובות
- השתמש ב-`persistent` עבור מידע סטטי
- השתמש ב-`network-first` עבור מידע קריטי
- הגדר מדיניות Cache מתאימה לכל endpoint

### 2. ניהול בקשות
- השתמש ב-batching עבור בקשות GET דומות
- השתמש ב-debouncing עבור חיפושים והשלמה אוטומטית
- הגדר עדיפויות נכונות לבקשות
- השתמש ב-timeout מתאים לכל בקשה

### 3. אבטחה
- וודא שכל הבקשות הרגישות מוגנות ב-CSRF
- השתמש בכותרות אבטחה מתאימות
- הצפן מידע רגיש
- רענן tokens באופן סדיר

### 4. ביצועים
- נטר את זמני התגובה
- בדוק את אחוזי ההצלחה
- השתמש ב-cache באופן יעיל
- הגדר מדיניות retry מתאימה

### 5. טיפול בשגיאות
- טפל בכל סוגי השגיאות
- הגדר מדיניות retry מתאימה
- שמור בקשות במצב offline
- תעד שגיאות חריגות 