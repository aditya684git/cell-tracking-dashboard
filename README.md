# Which cell-tracking model should a biologist trust?

CPSC 4030/6030 Data Visualization, Clemson University · group project (Use Case 2: choose a model for a new experiment).
Team: Aditya Choudhury, Akshay Mhetre, Daniel Shull.

A D3.js dashboard that compares three cell-tracking models (LAP, Trackastra, LineageMapper) with expert ground truth
on 12 microscopy sequences from 4 cell lines (MCF10A, HEK293T, U87, MDA-MB-231). All 330,284 labelled links are used.

## The dashboard

All three views are on one screen and are linked:

| View | Shows | Interactions |
|---|---|---|
| 1 · Overview | F1 by cell line (dot plot: filled = pooled, hollow = each sequence) and the type of each model's errors | click a row to outline that cell line in View 2 · click a model to highlight it everywhere · hover for details |
| 2 · Zoom & filter | F1 for every sequence × model (grey ramp 0.78–0.98, darker = more links lost) and the number of true links per sequence | hover for details (also rings the sequence in View 1) · click a cell to open it in View 3 |
| 3 · Details | the links of 4 consecutive transitions in image coordinates (correct, wrong, missed) and an error timeline for the whole sequence | Previous / Next or ← → · click the timeline to jump · hover a link to see its true link |

The model selector in the header highlights a model in all views and switches View 3 to it. View 3 opens on
U87 · FLD_2 · LineageMapper (the weakest cell in the heatmap), transitions 35–38.

## Running it locally

```
python -m http.server
```

Then open http://localhost:8000. No build step: plain HTML, CSS and JavaScript with D3 v7 from a CDN.

## Files

```
index.html          the dashboard
process.html        process book (design history, alternatives, insights)
css/style.css
js/main.js          shared state, linking between views, tooltip
js/view1.js         overview (dot plot + error bars)
js/view2.js         heatmap
js/view3.js         link plot + error timeline
data/summary.json   precision, recall, F1 and error counts per sequence, cell line and model
data/links/         one CSV per sequence × model (36 files) with the links View 3 draws
prep/build_data.py  builds data/ from the raw zips
prep/crowding.py    error rate by cell crowding (a process book result)
img/                figures used in the process book
```

## Rebuilding the data

The raw data (GT.zip, LAP.zip, Trackastra.zip, LineageMapper.zip) is not in the repository. Put the zips in a
`materials/` folder next to `prep/` and run:

```
python prep/build_data.py
```

Needs Python 3 and pandas. The script reads the zips directly, then checks its results against the numbers in our
Milestone 2 report (330,284 links, all 36 heatmap F1 values, the View 3 example window) and stops if anything differs.

**How links are labelled.** A ground-truth link joins a cell to each ID in its `CHILD_IDS` (a division gives two
links). A predicted link is `source_cell_id → target_spot_id`. Each predicted link is *correct* if it is a
ground-truth link and *wrong target* otherwise; each ground-truth link the model did not predict is *missed*.
Precision = correct / predicted, recall = correct / true links, F1 = 2PR / (P + R).

Link file columns: `t` (source frame), `s` (c = correct, w = wrong target, m = missed), `src`, `tgt`,
`true_tgt` (true target of a wrong link), `div` (1 if the source cell divides), `sx, sy, tx, ty` (pixels),
`track` (ground-truth track of the source cell).
