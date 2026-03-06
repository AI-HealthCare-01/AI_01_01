# Question Design

## Core structure
The recommended order is:

### Group A - Last night
- total sleep time
- wake time
- sleep latency

### Group B - Right now
- mood
- anxiety/stress
- energy

### Group C - Yesterday habits
- sunlight
- exercise
- alcohol
- caffeine after 2 PM

## Input controls
- Time: native time picker
- Bucket values: segmented chips
- 5-point state ratings: segmented control, no slider
- Binary habit items: yes/no chip or 2-level segmented

## Why not slider for everything
Daily repeated usage is sensitive to friction.
5-level and bucket inputs:
- are faster to complete
- reduce over-precision noise
- are easier to model as ordinal features

## Why wake-time regularity is not a direct question
Users are poor judges of regularity in daily self-report.
Store actual wake time each day and compute rolling deviation.

## Why outing is excluded
The concept is broad and hard to interpret:
- sunlight exposure
- social contact
- errands
- commute
all collapse into the same label.
More specific variables are better.
