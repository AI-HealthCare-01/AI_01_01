# Build Checklist

Before merging:
- DB migrations run cleanly
- one active record per user per local date enforced
- same-day edit history preserved
- no outing field anywhere
- no CBT or journaling fields anywhere
- time picker uses local time
- validation errors are user-readable
- analytics events fire as expected
- derived feature generation works on a 7-day window
- tests pass
