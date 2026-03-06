-- Core tables for challenge feature v3
CREATE TABLE challenge_catalog (...);
CREATE TABLE challenge_exposure (...);
CREATE TABLE challenge_enrollment (...);
CREATE TABLE challenge_day_log (...);

-- Recommended indexes
-- challenge_exposure(user_id, date)
-- challenge_enrollment(user_id, status)
-- challenge_day_log(user_id, date)
