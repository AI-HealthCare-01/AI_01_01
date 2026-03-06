import json
from pathlib import Path
import pandas as pd
import joblib

BASE = Path(__file__).resolve().parent
DOCS = BASE / "docs"
MODELS = BASE / "models"
DATA = BASE / "data"

feature_cols = json.load(open(DOCS / "model_feature_columns.json", "r", encoding="utf-8"))
sample = pd.read_csv(DATA / "train_user_day_nowcast.csv").head(1).copy()
X = sample[feature_cols]

outputs = {}
for target in ["dep_target_state_today", "anx_target_state_today", "ins_target_state_today"]:
    model = joblib.load(MODELS / f"{target}.joblib")
    outputs[target] = float(model.predict(X)[0])

print(outputs)
