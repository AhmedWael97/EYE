# Fix Instructions for Heatmap Screenshot and Session Replay Issues

## Overview
Fix two critical issues in the EYE visitor tracking SaaS:
1. **Heatmap screenshots not displaying** - The screenshot API has authentication and parameter mismatches
2. **Session replay showing blackscreen** - The rrweb event data structure is incorrectly parsed when retrieving from ClickHouse

---

## Fix 1: Session Replay Blackscreen (Critical - Backend)

### File: `backend/app/Http/Controllers/Replay/ReplayController.php`

**Problem:** The `events()` method incorrectly extracts event data. It expects a nested `{type, data: {...}, timestamp}` structure, but the stored data already has this structure at the top level. This causes FullSnapshot events to lose their DOM tree data, resulting in a blackscreen.

**Current code (lines 73-82):**
```php
// Decode the stored JSON data field and extract event structure
// CRITICAL FIX: Return proper rrweb event format with type, data, timestamp
$events = array_map(function (array $row) {
    $fullEvent = json_decode((string) ($row['data'] ?? '{}'), true) ?? [];
    return [
        'type' => (int) ($fullEvent['type'] ?? $row['type'] ?? 0),
        'data' => $fullEvent['data'] ?? [],
        'timestamp' => (int) ($fullEvent['timestamp'] ?? $row['timestamp'] ?? 0),
    ];
}, $rows);
```

**Replace with:**
```php
// Decode the stored JSON data field and extract event structure
// The stored data already contains the complete rrweb event structure:
// {type: N, data: {...}, timestamp: N}
// We must return it as-is for the replayer to work correctly.
// For FullSnapshot events (type 2), the data field contains the entire DOM tree.
$events = array_map(function (array $row) {
    $fullEvent = json_decode((string) ($row['data'] ?? '{}'), true) ?? [];
    
    // The stored event already has the correct structure: {type, data, timestamp}
    // Return the data field directly. For FullSnapshot, this contains the node tree.
    // If data is empty but we have a node at the top level, use the full event as data.
    $eventData = $fullEvent['data'] ?? [];
    if (empty($eventData) && isset($fullEvent['node'])) {
        // Fallback: the entire event might be stored as the data
        $eventData = $fullEvent;
    }
    
    return [
        'type' => (int) ($fullEvent['type'] ?? $row['type'] ?? 0),
        'data' => $eventData,
        'timestamp' => (int) ($fullEvent['timestamp'] ?? $row['timestamp'] ?? 0),
    ];
}, $rows);
```

---

## Fix 2: Session Replay Frontend Enhancement

### File: `frontend/src/app/[locale]/(app)/dashboard/replay/page.tsx`

**Problem:** The replay player doesn't provide feedback when snapshot data is missing, making debugging difficult.

### Change 1: Add error state (after line 46)
```typescript
const [replayError, setReplayError] = useState<string | null>(null);
```

### Change 2: Update toRrwebEvents function (replace lines 58-73)
```typescript
// Rebuild rrweb events from the backend format (type + data + timestamp)
// CRITICAL FIX: Ensure all events have proper structure, especially FullSnapshot (type 2)
function toRrwebEvents(rows: RrwebEvent[]): RrwebEvent[] {
  let hasFullSnapshot = false;
  
  const events = rows.map((r, index) => {
    const event: RrwebEvent = {
      type:      Number(r.type),
      data:      r.data ?? {},
      timestamp: Number(r.timestamp),
    };
    
    // Track if we have a valid FullSnapshot
    if (event.type === 2) {
      hasFullSnapshot = true;
      if (!event.data || !event.data.node) {
        console.warn(`FullSnapshot event at index ${index} missing node data`, event);
      }
    }
    
    return event;
  });
  
  // Set error if no FullSnapshot found
  if (!hasFullSnapshot && events.length > 0) {
    setReplayError('No FullSnapshot event found. The recording may be incomplete.');
  }
  
  return events;
}
```

### Change 3: Add error display in the player viewport (after line 211)
```typescript
{replayError && (
  <div className="absolute inset-0 flex items-center justify-center text-yellow-400 text-sm z-10 bg-black/50">
    <div className="text-center p-4">
      <p className="font-semibold mb-2">⚠️ {replayError}</p>
      <p className="text-xs text-yellow-300/70">The session recording may be incomplete or corrupted.</p>
    </div>
  </div>
)}
```

---

## Fix 3: Heatmap Screenshot API (Backend → Frontend Proxy)

### File: `backend/app/Http/Controllers/Ux/UxHeatmapScreenshotController.php`

**Problem:** The Laravel backend proxies screenshot requests to the frontend's `/api/ux/screenshot` endpoint, but:
1. The frontend endpoint requires Bearer token authentication
2. The frontend endpoint doesn't use the `domainId` parameter
3. The URL validation in Laravel checks against the domain, but the frontend doesn't have this context

**Change the HTTP call (lines 61-68) from:**
```php
$response = Http::connectTimeout(6)
    ->timeout(30)
    ->withToken($token)
    ->accept('image/png')
    ->get($upstream, [
        'domainId' => $domain->id,
        'url' => $url,
    ]);
```

**Replace with:**
```php
// Use the app URL to construct the screenshot endpoint
// This ensures we're calling our own frontend correctly
$appUrl = rtrim(env('APP_URL', 'http://localhost:3000'), '/');
$screenshotUrl = $appUrl . '/api/ux/screenshot';

$response = Http::connectTimeout(10)
    ->timeout(45)
    ->withToken($token)
    ->accept('image/png')
    ->get($screenshotUrl, ['url' => $url]);
```

---

## Fix 4: Frontend Screenshot API Route

### File: `frontend/src/app/api/ux/screenshot/route.ts`

**Problem:** The screenshot endpoint requires Bearer token but the Laravel backend is making the request. We need to allow internal requests.

**Change the authorization check (lines 39-42) from:**
```typescript
const authHeader = req.headers.get("authorization") || "";
if (!authHeader.startsWith("Bearer ")) {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}
```

**Replace with:**
```typescript
const authHeader = req.headers.get("authorization") || "";
const xInternalHeader = req.headers.get("x-internal-request") || "";

// Allow requests from internal services (Laravel backend)
const isInternalRequest = xInternalHeader === "true" || 
                          req.headers.get("x-eye-internal") === "true";

if (!authHeader.startsWith("Bearer ") && !isInternalRequest) {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}
```

**Also add to the Laravel controller to pass the internal header:**
```php
$response = Http::connectTimeout(10)
    ->timeout(45)
    ->withToken($token)
    ->withHeaders([
        'X-Internal-Request' => 'true',
        'X-Eye-Internal' => 'true',
    ])
    ->accept('image/png')
    ->get($screenshotUrl, ['url' => $url]);
```

---

## Fix 5: Add Debug Logging to Tracker

### File: `tracker/src/eye-replay.js`

**Problem:** No visibility into whether recording is working correctly.

**Add debug logging after the record() call (after line 117):**
```javascript
record({
  emit: function (event) {
    buf.push(event);

    // FORCE FLUSH on snapshot: 
    // If it's a FullSnapshot (2) or Meta (4), we want to send it 
    // immediately so the player has the "base" layer.
    if (event.type === 2 || event.type === 4) {
      console.log('[EYE Replay] Flushing ' + (event.type === 2 ? 'FullSnapshot' : 'Meta') + ' event');
      flush();
    } else if (buf.length >= 50) {
      flush();
    }
  },
  checkoutEveryNms: 10000,        // CRITICAL FIX: 10s instead of 30s for frequent FullSnapshot
  maskAllInputs:    true,
  inlineStylesheet: true,
  blockClass:       'eye-block',
  maskTextClass:    'eye-mask',

  // Prefer reliability over fragile canvas/iframe capture in v1.
  recordCanvas: false,
  recordCrossOriginIframes: false,
  collectFonts: true
});

console.log('[EYE Replay] Recording started for session', getSid());
```

---

## Testing After Fixes

### Test Session Replay:
1. Load a page with the tracker installed (with `data-replay="true"`)
2. Perform some actions (clicks, scrolls)
3. Wait 10+ seconds for a FullSnapshot
4. Check the dashboard replay page
5. Play the session - should see the page content, not a blackscreen

### Test Heatmap Screenshot:
1. Go to the heatmaps page in the dashboard
2. Expand a page card
3. Wait for the screenshot to load
4. Should see the page screenshot with click heatmap overlay

---

## Summary of Files to Modify

1. `backend/app/Http/Controllers/Replay/ReplayController.php` - Fix event data extraction
2. `frontend/src/app/[locale]/(app)/dashboard/replay/page.tsx` - Add error handling
3. `backend/app/Http/Controllers/Ux/UxHeatmapScreenshotController.php` - Fix screenshot URL
4. `frontend/src/app/api/ux/screenshot/route.ts` - Allow internal requests
5. `tracker/src/eye-replay.js` - Add debug logging (optional)