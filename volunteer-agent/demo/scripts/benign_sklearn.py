"""Benign workload: simple sklearn prediction."""
import numpy as np
from sklearn.linear_model import LogisticRegression
import json, sys

X = np.random.rand(500, 10)
y = (X[:, 0] > 0.5).astype(int)
model = LogisticRegression(max_iter=100).fit(X, y)
preds = model.predict(X)
print(json.dumps({"status": "success", "accuracy": float((preds == y).mean())}))
