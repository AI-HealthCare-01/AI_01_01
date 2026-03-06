# Retraining policy

## Phase 0
0-8주: synthetic model 사용, real data는 모니터링

## Phase 1
anchor와 current-state residual을 이용한 calibration

## Phase 2
real data가 충분해지면 hybrid retraining
- real > synthetic 가중치

## Phase 3
real-data-first
synthetic는 regression test / edge-case simulation 용도로 유지
