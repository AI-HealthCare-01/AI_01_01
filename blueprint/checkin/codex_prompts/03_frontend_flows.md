Read:
- blueprint/checkin/docs/02_user_flows.md
- blueprint/checkin/data/checkin_question_catalog.csv
- blueprint/checkin/data/checkin_copy_seeds.csv
- blueprint/checkin/AGENTS.md

Task:
Build the frontend check-in flow.

Requirements:
- show check-in on first login of local day if missing
- keep the main path under 45 seconds
- use:
  - time picker for wake time
  - segmented 5-point controls for mood/anxiety/energy
  - bucket chips for sleep, sunlight, exercise, alcohol
  - yes/no chip for caffeine after 2 PM
- allow skip
- allow same-day edit
- no free text
- no outing field
- no CBT or journaling UI

Need:
- loading state
- error state
- validation state
- completion state
- reminder-resume handling if partial state exists
