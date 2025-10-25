This project is a **major architectural refactor** of your React Native mobile app to solve its slow load times.

You are moving from a "remote-first" model (where the UI waits for network calls to Supabase) to an **"offline-first"** model (where the UI loads instantly from a local database).

Here is the high-level summary:

1.  **Problem:** Your app feels slow because it must fetch calendar events from your Supabase backend every time it loads, creating a "lengthy loading segment."
2.  **Goal:** Make the app feel instant, just like Google Calendar, by ensuring the UI *always* reads data from the device itself.
3.  **Core Change:** You will add **WatermelonDB** (a reactive, encrypted database) to your React Native app. This local database will become the **"single source of truth"** for your UI. Your React components will only read data from WatermelonDB, eliminating all network-related loading spinners.
4.  **Optimistic Updates:** When a user creates, edits, or deletes an event, the change will be written *immediately* to the local WatermelonDB (and marked as `status: 'pending'`). The UI will update instantly, making the app feel responsive even if the user is offline.
5.  **Efficient Syncing:** Instead of a simple "poll," you will implement a sophisticated, real-time sync strategy:
    * **Delta Sync:** Your app will only sync data that has changed since the last successful sync, using timestamps. This keeps your backend (Railway) and database (Supabase) costs low.
    * **Push-Based Triggers:** You will use **Supabase Realtime** and **Firebase silent push notifications** to *trigger* a sync. This means the app syncs only when new data is available, rather than wasting resources by checking every 15 minutes.
6.  **Conflict Resolution:** You will implement a "last write wins" strategy on your backend to prevent data corruption if the same event is edited on both your web app and mobile app before a sync can occur.

Here is the updated implementation plan, built around your two caveats: **Delta Syncing** and **Push-Based Triggers**.

This approach is more complex than polling, but it's significantly more efficient, provides a true real-time experience, and will keep your infrastructure costs low.

---

### Milestone 1: Set Up Local Database & Schema
**Status: ✅ Complete**

This milestone is the same as before, but the schema design is now **mission-critical** for delta syncing.

- [x] **1. Install Dependencies:**
    - `WatermelonDB` (for the database).
    - `react-native-sqlite-storage` (the storage engine).
    - `react-native-encrypted-storage` (to store the database encryption key).
- [x] **2. Define Your Schema (`src/db/schema.ts`):**
    - Define your tables (e.g., `tasks`, `goals`, `calendar_events`).
    - **Crucial Additions:** Every table that you sync *must* include these two columns:
        - `status`: An enum or string (e.g., `'synced'`, `'pending_create'`, `'pending_update'`, `'pending_delete'`).
        - `updated_at`: A timestamp that you *only* set when the record is modified.
- [x] **3. Implement Encryption (SQLCipher):**
    - Follow the WatermelonDB documentation to set up the SQLCipher adapter.
    - On first launch, generate a secure passphrase, use it to open the DB, and save the passphrase to `react-native-encrypted-storage`.
    - On all future launches, read the passphrase from `react-native-encrypted-storage` to unlock the database.
- [x] **4. Test:** Your app should launch with an empty, encrypted local database.

---

### Milestone 2: Refactor UI to Read from Local DB
**Status: ✅ Complete**

This step is identical to the original plan and is key to achieving the "instant" feel.

- [x] **1. Identify a Core Screen:** Start with your main `CalendarView`.
- [x] **2. Query the Database:**
    - Unplug your UI from your API.
    - Use WatermelonDB's reactive query API (e.g., `database.get('calendar_events').query(...)`) to feed data to your components.
- [x] **3. Wire up UI:**
    - Use WatermelonDB's observation methods (e.g., `myQuery.observe()`) to make your React components automatically re-render when local data changes.
- [x] **4. Test:**
    - Your app should load instantly and show an empty calendar (no loading spinners!).
    - Add a "Debug" button to manually insert a fake event. The UI should update instantly.

---

### Milestone 3: Implement Optimistic Writes (UI → Local)
**Status: ✅ Complete**

This step (formerly Milestone 4) is crucial. It makes your app feel fast and functional even when offline.

- [x] **1. Refactor "Create" Logic:**
    - When a user saves a "New Event":
        - **Remove** the `fetch` (POST) call to your API.
        - **Replace** it with a `database.write(...)` that creates a new event *locally*.
        - Set its `status` to `'pending_create'`.
- [x] **2. Refactor "Update" Logic:**
    - When a user edits an event, *only* update the local WatermelonDB record and set its `status` to `'pending_update'`.
- [x] **3. Refactor "Delete" Logic:**
    - When a user deletes an event, **do not** destroy it.
    - Update the local record and set its `status` to `'pending_delete'`. (The UI query in Milestone 2 should now be updated to filter out "pending_delete" records).
- [x] **4. Test:** Turn on **Airplane Mode**. Create, edit, and delete events. The UI should react instantly. Close and re-open the app; all your changes should persist locally.

---

### Milestone 4: Implement Delta Sync Logic (Push & Pull)
**Status: ⚠️ Partially Complete**

This is the new core of your sync engine. You'll build the functions but won't automate them yet.

- [x] **1. Create `SyncService.ts`:** This module will hold all your sync functions.
- [x] **2. Build `async function pushData()`:**
    - Query WatermelonDB for all records where `status` is *not* `'synced'`.
    - Loop through these "dirty" records.
    - Use a `switch` on the `status`:
        - `'pending_create'`: `POST` to your Node.js backend.
        - `'pending_update'`: `PUT` to your backend.
        - `'pending_delete'`: `DELETE` on your backend.
    - **Backend Response:** Your backend *must* return the successfully saved/updated record (with its new `updated_at` timestamp from Supabase).
    - **Local Update:** In a new `database.write()`, update the local record:
        - If `DELETE`, `destroyPermanently()` the local record.
        - If `CREATE`/`UPDATE`, set the `status` to `'synced'` and update its `updated_at` to match the server's response.
- [~] **3. Build `async function pullData()`:**
    - [x] Get the `lastSyncedAt` timestamp from `AsyncStorage`.
    - [x] Call your backend API: `GET /api/events?since=${lastSyncedAt}`. (You must update your Node.js API to handle this `since` parameter, querying Supabase `WHERE updated_at > $1`).
    - [ ] **(Incomplete)** Your API should also return a list of IDs for deleted records.
    - [~] **Local Update:** In a `database.batch()` transaction:
        - [x] "Upsert" all changed/new records.
        - [ ] **(Incomplete)** Permanently destroy all records from the deleted IDs list.
    - [x] After a successful pull, save the *server's* current timestamp as the new `lastSyncedAt` in `AsyncStorage`.
- [x] **4. Test:** Add a manual "Sync" button that calls `await pushData()` then `await pullData()`. Test every offline scenario (create, update, delete) and verify the sync works.

---

### Milestone 5: Implement Real-Time Sync Triggers (Push, Not Poll)
**Status: ⚠️ Partially Complete**

This milestone *replaces* the `react-native-background-fetch` plan. It's the "Google Calendar" magic.

- [x] **1. Trigger on App Open:**
    - In your app's root component, use the `AppState` listener from `react-native`.
    - When the app state changes from `"background"` to `"active"`, call your `fullSync()` function (`pushData` then `pullData`). This is a vital fallback to catch any missed updates.
- [x] **2. Trigger from Supabase Realtime (App Foreground):**
    - Use the Supabase client to subscribe to a channel for that user (e.g., `user-123-changes`).
    - Your Node.js backend (or a Postgres trigger) must broadcast a simple "update" message to this channel whenever that user's data is changed (e.g., by the web app).
    - When your React Native app receives this message, it should **not** just fetch the one item. It should use this as a trigger to call `fullSync()`. This is more robust and handles all edge cases.
- [~] **3. Trigger from Silent Push (App Background):**
    - This is for when your app is closed or backgrounded.
    - [ ] **(Incomplete)** Your Node.js backend (using the **Firebase Admin SDK**) must send a *silent, data-only* push notification to the user's device when a change occurs.
    - [x] Configure `react-native-firebase` to handle this background message (`firebase.messaging().onBackgroundMessage(...)`).
    - [x] This background handler's *only* job is to wake the app and call `fullSync()`.

---

### Milestone 6: Handle Conflicts & Final Testing
**Status: ❌ Incomplete**

This is the final, most complex step for ensuring data integrity.

- [ ] **1. Implement "Last Write Wins":** This is the simplest conflict strategy.
    - [ ] **Backend:** Your `PUT /api/events/:id` endpoint *must* be updated.
        - The request from the mobile app will include its local `updated_at` timestamp.
        - The server must compare this to the `updated_at` timestamp in the database.
        - If the app's timestamp is *older* than the database's, **reject the write** and return a `409 Conflict` error with the *current* server data.
    - [ ] **Frontend:** Your `pushData()` function must handle this `409` error.
        - When it gets a 409, it should *not* retry.
        - It should take the *server data* from the response and use it to overwrite the local record, setting its status back to `'synced'`.
- [ ] **2. Test Rigorously:**
    - **The Classic Conflict:**
        1.  Open the app and go offline.
        2.  Edit "Event A" on mobile.
        3.  Go to your *web* app and edit "Event A".
        4.  Go back online in the mobile app and sync.
        - **Result:** The mobile app should get a 409, and its local "Event A" should be overwritten by the change from the web app (last write wins).
    - Test all other offline/online/multi-client combinations you can think of.