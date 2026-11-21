"""Error rate by how crowded a cell is, for the process book.

Usage: python prep/crowding.py   (run build_data.py first)
"""
import glob
import os

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
rows = []
for f in sorted(glob.glob(os.path.join(HERE, "..", "data", "links", "*.csv"))):
    model = os.path.basename(f).rsplit("_", 1)[1][:-4]
    d = pd.read_csv(f)
    # a source cell counts as an error if any of its true links is not predicted correctly
    bad = d.groupby("src").s.apply(lambda s: not (s == "c").all())
    cells = d[d.s != "w"].drop_duplicates("src")
    for _, g in cells.groupby("t"):
        if len(g) < 2:
            continue
        p = g[["sx", "sy"]].to_numpy()
        dist = np.sqrt(((p[:, None] - p[None]) ** 2).sum(-1))
        np.fill_diagonal(dist, np.inf)
        rows += [(model, nn, bad[s]) for s, nn in zip(g.src, dist.min(1))]

r = pd.DataFrame(rows, columns=["model", "nn", "bad"])
r["quarter"] = pd.qcut(r.nn, 4)
print(r.groupby(["quarter", "model"], observed=True).bad.mean().unstack().round(3))
