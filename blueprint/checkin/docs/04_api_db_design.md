# API and DB Design Notes

## Core domain object
One primary record per user per local date:
- daily_checkin_day

## Important implementation behaviors
- save draft is optional but useful
- completed check-in should be immutable in history
- latest version is active for modeling
- versioning should preserve auditability

## API expectations
- fetch today's check-in status
- create or update today's record
- fetch history for dashboard use
- fetch UI config if needed

## Analytics
Track:
- prompt shown
- started
- question answered
- submitted
- skipped
- edited
- reminder opened
