# MindLab current-state modeling and data architecture guide

## 1. Modeling objective
The model target is **current state nowcast**, not future delta. For each user-day, the core targets are:
- dep_state_today
- anx_state_today
- ins_state_today

Seven-day and twenty-eight-day trend values are derived dashboard metrics, not training targets.

## 2. Core design principle
Use four layers.
- Layer A: raw operational logs
- Layer B: daily state layer
- Layer C: dashboard trend layer
- Layer D: modeling mart

This keeps runtime logging, state estimation, dashboard reporting, and model training separate.

## 3. Raw tables
Recommended raw tables:
- users
- baseline_assessment
- periodic_assessment
- daily_checkin
- challenge_catalog
- challenge_exposure
- challenge_enrollment
- challenge_day_log
- cbt_session_summary
- cbt_risk_signal
- daily_state
- user_day_trend_metrics

## 4. Current-state target design
### 4.1 Current-state labels
For each day, maintain:
- dep_state_final_0_100_today
- anx_state_final_0_100_today
- ins_state_final_0_100_today

For synthetic data, keep latent true values as well for supervised training and evaluation.

### 4.2 Trend metrics
Trend metrics are retrospective dashboard outputs.
- week_delta_retro(t) = mean(state[t-6:t]) - mean(state[t-13:t-7])
- month_delta_retro(t) = mean(state[t-27:t]) - mean(state[t-55:t-28])

These are shown to users and used in dashboards, but are not the main prediction target.

## 5. Role of assessments
PHQ-9, GAD-7, and ISI should be handled as **sparse anchors**.
- Baseline assessment is a static start-point feature.
- Periodic assessment is recommended every 28 days, but may be late, missed, or irregular.
- Model features should therefore include last score, days since last assessment, and overdue flags.

The service should not assume perfect adherence to the 28-day schedule.

## 6. Feature groups for current-state modeling
### Static features
- baseline PHQ / GAD / ISI
- demographics
- medication / therapy flags

### Same-day check-in features
- sleep total
- wake time
- sleep latency
- mood
- anxiety / stress
- energy
- daylight exposure
- exercise
- alcohol
- late caffeine

### Historical check-in features
- lag1
- recent rolling means
- recent variability
- observed-day counts / missingness proxy
- days since previous check-in

### Challenge features
- exposure counts
- acceptance / decline
- completion
- dropout
- helpfulness
- active challenge count

### CBT-linked features
- session count
- helpfulness
- homework commitment / completion
- pre/post shift summaries
- structured risk signals

### Sparse-anchor features
- last PHQ / GAD / ISI score
- days since last assessment
- overdue flags

## 7. Feature use from CBT
Use structured CBT outputs that are behaviorally interpretable.
Recommended for v1 model linkage:
- session count
- homework commitment / completion
- pre/post emotion shift
- pre/post belief shift
- session helpfulness
- risk flags

Do not use core-belief hypotheses, intermediate-belief hypotheses, or raw transcript embeddings as primary model features in v1.

## 8. Challenge recommendation logic
Do not treat model feature importance as direct causal effect.
Use recommendation in this order:
1. estimate current state
2. compute modifiable gaps
3. combine with past challenge fit and completion/helpfulness history
4. apply safety gate
5. rank and recommend

This keeps explanation cleaner and reduces overclaiming.

## 9. Post-launch data use and retraining policy
### Phase 0
Synthetic model in production. Real-world data collection and quality monitoring only.

### Phase 1
Calibration using sparse periodic assessments and residual analysis.

### Phase 2
Hybrid retraining with real data weighted above synthetic data.

### Phase 3
Real-data-first retraining. Synthetic data remains for regression testing and edge-case simulation.

Always recompute:
- daily_state_final
- 7-day and 28-day trend metrics
- days_since_last_assessment and overdue flags

Do not casually change:
- safety gate
- high-risk routing
- escalation policy

## 10. Implication for existing feature blueprints
The CBT, challenge, and check-in blueprints should align to this structure.
- CBT blueprint should export only structured model-linkable summaries and risk signals.
- Challenge blueprint should log exposure, enrollment, completion, dropout, and helpfulness.
- Check-in blueprint should provide same-day state-supporting variables and sparse-history features.

## 11. Synthetic dataset generation
Synthetic generation should follow this order.
1. user-level hidden traits
2. daily latent states
3. sparse daily check-ins
4. irregular periodic assessments
5. challenge exposure / completion / dropout
6. CBT summaries and risk signals
7. daily_state and dashboard trends
8. training mart generation

## 12. Recommended deliverables
- raw synthetic tables
- train_user_day_nowcast mart
- trained nowcast models for depression, anxiety, insomnia
- model metrics file
- scoring example script
- schema / manifest documentation

## References
- NICE depression guideline (adult treatment and management)
- NICE generalized anxiety disorder guideline
- VA/DoD insomnia and obstructive sleep apnea guideline, 2025
- Beck Institute conceptualization materials
- Product governance assumptions documented in the legal/signup blueprint
