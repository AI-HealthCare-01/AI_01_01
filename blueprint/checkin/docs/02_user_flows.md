# User Flows

## Main flow
1. User logs in
2. System checks if today's local-date check-in exists
3. If not, show check-in sheet before home content
4. User completes check-in
5. Save record
6. Show brief completion summary and continue to home

## Skip flow
1. User logs in
2. Check-in prompt shown
3. User taps skip
4. Save skip event
5. Schedule reminder later in the day
6. Home still accessible

## Edit flow
1. User has already submitted check-in
2. User reopens today's check-in
3. User edits answers
4. Save new version
5. Keep latest as active record, preserve previous version in history

## Reminder flow
1. User skipped or abandoned
2. Reminder sent later in allowed window
3. User returns
4. Resume with saved partial answers if available

## UX notes
- If the user completes within one minute, success
- If abandonment is high, collapse habit items into one compact screen
