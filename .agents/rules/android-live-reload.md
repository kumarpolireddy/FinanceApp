# Android USB Live Debugging & Hot Reload Rule

When developing for Android mobile using Capacitor + Next.js:

1. **Live Development Setup**:
   - `capacitor.config.ts` handles dev server connection when testing live.
   - For USB live debugging, port 3000 must be forwarded using `adb reverse tcp:3000 tcp:3000`.

2. **Simple Reconnection Workflow**:
   - Reconnect phone via USB anytime and run:
     ```bash
     npm run adb:reverse
     ```
   - Or start dev server with ADB reverse port forwarding initialized automatically:
     ```bash
     npm run dev:live
     ```

3. **Standard Dev Workflow**:
   - The standard `npm run dev` script remains untouched and continues to operate normally.
