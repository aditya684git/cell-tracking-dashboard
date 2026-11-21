"""Builds the small data files the dashboard loads, straight from the raw zips.

Usage: python prep/build_data.py [materials_dir] [out_dir]
Defaults: materials/ and data/ next to this folder.
"""
import json
import os
import re
import sys
import zipfile

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
MAT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "materials")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "..", "data")

MODELS = {"LAP": "lap_assignments_", "Trackastra": "trackastra_links_ilp.csv", "LineageMapper": "lineagemapper_links.csv"}
LINES = ["MCF10A", "HEK293T", "U87", "MDA-MB-231"]


def gt_links(g):
    rows = []
    for r in g.itertuples(index=False):
        if isinstance(r.CHILD_IDS, str) and r.CHILD_IDS:
            kids = [int(x) for x in r.CHILD_IDS.split(";")]
            for k in kids:
                rows.append((r.cell_id, k, r.frame_t, len(kids) == 2))
    return pd.DataFrame(rows, columns=["src", "tgt", "frame", "is_div"])


def find_pred(zf, model, line, fld):
    # LAP files carry the sequence name, the other two don't
    for name in zf.namelist():
        parts = name.split("/")
        if len(parts) == 4 and parts[1] == line and parts[2] == fld and parts[3].startswith(MODELS[model]):
            return name
    return None


zips = {m: zipfile.ZipFile(os.path.join(MAT, f"{m}.zip")) for m in MODELS}
gt_zip = zipfile.ZipFile(os.path.join(MAT, "GT.zip"))
os.makedirs(os.path.join(OUT, "links"), exist_ok=True)

seq_rows = []
for name in sorted(gt_zip.namelist()):
    m = re.match(r"GT/([^/]+)/GT_(FLD_\d+)\.csv$", name)
    if not m:
        continue
    line, fld = m.groups()
    preds = {mod: find_pred(zips[mod], mod, line, fld) for mod in MODELS}
    if not all(preds.values()):
        continue  # only 12 of the 25 GT sequences have predictions

    g = pd.read_csv(gt_zip.open(name))
    G = gt_links(g)
    gset = set(zip(G.src, G.tgt))
    gt_has_future = set(G.src)
    div_src = set(G[G.is_div].src)
    true_tgts = G.groupby("src").tgt.apply(lambda s: ";".join(map(str, s)))
    pos = g.set_index("cell_id")[["position_x_t", "position_y_t", "track_id"]]

    for mod, fname in preds.items():
        p = pd.read_csv(zips[mod].open(fname))
        pairs = list(zip(p.source_cell_id, p.target_spot_id))
        p_set = set(pairs)
        ok = [pr in gset for pr in pairs]
        if any((not c) and (s not in gt_has_future) for c, (s, _) in zip(ok, pairs)):
            sys.exit(f"{line} {fld} {mod}: predicted link from a cell with no true link (not expected)")

        miss = G[[pr not in p_set for pr in zip(G.src, G.tgt)]]
        correct = sum(ok)
        wrong = len(pairs) - correct
        missed_div = int(miss.is_div.sum())
        nsrc = p.groupby("source_cell_id").size()
        prec = correct / len(pairs)
        rec = correct / len(gset)
        seq_rows.append(dict(
            cell_line=line, sequence=fld, model=mod, frames=int(g.frame_t.max()) + 1,
            gt_links=len(gset), pred_links=len(pairs), correct=correct, wrong=wrong,
            missed=len(miss), missed_div=missed_div, missed_other=len(miss) - missed_div,
            gt_division_links=int(G.is_div.sum()), pred_divisions=int((nsrc >= 2).sum()),
            precision=prec, recall=rec, f1=2 * prec * rec / (prec + rec)))

        # link table for View 3: predicted links plus the missed true links
        lk = pd.DataFrame({"t": p.frame_start, "s": ["c" if c else "w" for c in ok],
                           "src": p.source_cell_id, "tgt": p.target_spot_id})
        lk = pd.concat([lk, pd.DataFrame({"t": miss.frame, "s": "m", "src": miss.src, "tgt": miss.tgt})], ignore_index=True)
        lk["true_tgt"] = lk.src.map(true_tgts).where(lk.s == "w", "")
        lk["div"] = lk.src.isin(div_src).astype(int)
        lk["sx"] = lk.src.map(pos.position_x_t).round(1)
        lk["sy"] = lk.src.map(pos.position_y_t).round(1)
        lk["tx"] = lk.tgt.map(pos.position_x_t).round(1)
        lk["ty"] = lk.tgt.map(pos.position_y_t).round(1)
        lk["track"] = lk.src.map(pos.track_id)
        if lk[["sx", "sy", "tx", "ty", "track"]].isna().any().any():
            sys.exit(f"{line} {fld} {mod}: a link cell has no position in the GT file")
        lk = lk.sort_values(["t", "s", "src"], kind="stable")
        lk.to_csv(os.path.join(OUT, "links", f"{line}_{fld}_{mod}.csv"), index=False)

seq = pd.DataFrame(seq_rows)
COUNTS = ["gt_links", "pred_links", "correct", "wrong", "missed", "missed_div", "missed_other", "gt_division_links", "pred_divisions"]


def pooled(keys):
    a = seq.groupby(keys)[COUNTS].sum().reset_index()
    a["precision"] = a.correct / a.pred_links
    a["recall"] = a.correct / a.gt_links
    a["f1"] = 2 * a.precision * a.recall / (a.precision + a.recall)
    return a


by_line = pooled(["cell_line", "model"])
by_model = pooled(["model"])


def records(df):
    df = df.copy()
    for c in ["precision", "recall", "f1"]:
        df[c] = df[c].round(4)
    return df.to_dict("records")


order = {l: i for i, l in enumerate(LINES)}
seq = seq.sort_values(["cell_line", "sequence"], key=lambda s: s.map(order) if s.name == "cell_line" else s.str[4:].astype(int))
with open(os.path.join(OUT, "summary.json"), "w") as f:
    json.dump({"models": list(MODELS), "cellLines": LINES, "sequences": records(seq),
               "byCellLine": records(by_line), "byModel": records(by_model)}, f, separators=(",", ":"))


# checks against the Milestone 2 numbers
def check(label, got, want):
    if got != want:
        sys.exit(f"CHECK FAILED {label}: got {got}, expected {want}")
    print(f"ok  {label}: {got}")


# F1 per sequence from the Milestone 2 heatmap (LAP, Trackastra, LineageMapper)
M2_F1 = {
    ("HEK293T", "FLD_2"): (0.9625, 0.8836, 0.8755), ("HEK293T", "FLD_5"): (0.9544, 0.8553, 0.8596),
    ("HEK293T", "FLD_8"): (0.9409, 0.8166, 0.7963), ("MCF10A", "FLD_102"): (0.9717, 0.9600, 0.9496),
    ("MCF10A", "FLD_103"): (0.9651, 0.9531, 0.9508), ("MCF10A", "FLD_104"): (0.9680, 0.9546, 0.9517),
    ("MDA-MB-231", "FLD_1"): (0.9726, 0.9548, 0.9488), ("MDA-MB-231", "FLD_2"): (0.9764, 0.9713, 0.9637),
    ("MDA-MB-231", "FLD_3"): (0.9713, 0.9642, 0.9519), ("U87", "FLD_1"): (0.9479, 0.8460, 0.7970),
    ("U87", "FLD_2"): (0.9495, 0.8047, 0.7848), ("U87", "FLD_4"): (0.9559, 0.8541, 0.8130),
}
check("sequences x models", len(seq), 36)
bad = [(r.cell_line, r.sequence, r.model, round(r.f1, 4)) for r in seq.itertuples()
       if round(r.f1, 4) != M2_F1[(r.cell_line, r.sequence)][list(MODELS).index(r.model)]]
check("heatmap F1 values that differ from Milestone 2", bad, [])

tot = seq[["correct", "wrong", "missed"]].sum()
check("labelled links", int(tot.sum()), 330284)
check("correct / wrong / missed", tuple(int(x) for x in tot), (282051, 11606, 36627))
check("true links (per model)", sorted(set(by_model.gt_links)), [106226])
check("division links (per model)", sorted(set(by_model.gt_division_links)), [1134])
check("division links found by any model", int((seq.gt_division_links - seq.missed_div).sum()), 0)
f1 = by_model.set_index("model").f1.round(2).to_dict()
check("pooled F1", f1, {"LAP": 0.96, "LineageMapper": 0.90, "Trackastra": 0.91})
w = by_model.set_index("model")
check("LAP wrong / missed", (int(w.wrong["LAP"]), int(w.missed["LAP"])), (678, 7103))
check("Trackastra proposed divisions", int(w.pred_divisions["Trackastra"]), 2235)

u = seq[(seq.cell_line == "U87") & (seq.sequence == "FLD_2") & (seq.model == "LineageMapper")].iloc[0]
check("U87 FLD_2 LineageMapper F1", round(u.f1, 2), 0.78)
L = pd.read_csv(os.path.join(OUT, "links", "U87_FLD_2_LineageMapper.csv"), dtype={"true_tgt": str})
check("U87 FLD_2 LineageMapper links", len(L), 8415)
check("U87 FLD_2 LineageMapper transitions", L.t.nunique(), 288)
win = L[L.t.between(34, 37)].s.value_counts().to_dict()
check("transitions 35-38 (correct, wrong, missed)", (win.get("c"), win.get("w"), win.get("m")), (79, 11, 30))
first = L[L.t.between(0, 3)].s.value_counts().to_dict()
check("transitions 1-4 (correct, wrong, missed)", (first.get("c"), first.get("w"), first.get("m")), (14, 19, 62))
ex = L[(L.src == 20035) & (L.s == "w")].iloc[0]
check("example wrong link 20035", (int(ex.t), int(ex.tgt), str(ex.true_tgt), int(ex.track)), (35, 20038, "20040", 963))
print("all checks passed")
