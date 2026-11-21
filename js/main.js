const MODELS = ["LAP", "Trackastra", "LineageMapper"];
const MODEL_COLOR = { LAP: "#0072B2", Trackastra: "#009E73", LineageMapper: "#CC79A7" };
const MODEL_SHAPE = { LAP: d3.symbolCircle, Trackastra: d3.symbolSquare, LineageMapper: d3.symbolTriangle };
const COL = {
  ink: "#1F2933", muted: "#52606D", grid: "#E4E7EB",
  correct: "#3E4C59", wrong: "#D55E00", missed: "#A7AFB8", missedDiv: "#52606D"
};
const DUR = 300;

const fmtInt = d3.format(",");
const fmt2 = d3.format(".2f");
const fmt3 = d3.format(".3f");
const fmtPct = d3.format(".1%");

// one shared state, every view redraws from it
const state = {
  model: null,          // highlighted model, null = all
  cellLine: null,       // cell line outlined in View 2
  line: "U87",          // sequence shown in View 3
  seq: "FLD_2",
  v3model: "LineageMapper",
  win: 34,              // first frame of the 4-transition window (transitions 35-38)
  hover: null           // heatmap cell under the mouse
};

const app = { data: null, views: [] };

function setState(patch) {
  Object.assign(state, patch);
  app.views.forEach(v => v.update());
  updateSelector();
}

function pickModel(m) {
  const patch = { model: m };
  if (m) patch.v3model = m;
  setState(patch);
}

function toggleModel(m) {
  pickModel(state.model === m ? null : m);
}

function pickCellLine(line) {
  setState({ cellLine: state.cellLine === line ? null : line });
}

function pickCell(line, seq, model) {
  const patch = { line, seq, v3model: model };
  if (state.model) patch.model = model;  // keep the highlight on the model being looked at
  setState(patch);
}

function hoverCell(d) {
  state.hover = d;
  View1.hover();
}

function seqRow(line, seq, model) {
  return app.data.seqIndex.get(`${line}|${seq}|${model}`);
}
function lineRow(line, model) {
  return app.data.byCellLine.find(r => r.cell_line === line && r.model === model);
}
function modelRow(model) {
  return app.data.byModel.find(r => r.model === model);
}

function fadeFor(model) {
  return state.model && state.model !== model ? 0.15 : 1;
}

function symbolPath(model, size) {
  return d3.symbol(MODEL_SHAPE[model], size)();
}

// small inline svg of a model marker, for legends and tooltips
function markerIcon(model, filled = true, px = 12) {
  const s = px * px * 0.55;
  return `<svg width="${px}" height="${px}" viewBox="${-px / 2} ${-px / 2} ${px} ${px}" aria-hidden="true">
    <path d="${symbolPath(model, s)}" fill="${filled ? MODEL_COLOR[model] : "#fff"}" stroke="${MODEL_COLOR[model]}" stroke-width="1.3"/></svg>`;
}

function fontSize() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--fs")) || 12;
}

const measureCtx = document.createElement("canvas").getContext("2d");
function textWidth(str, size = fontSize(), weight = 400) {
  measureCtx.font = `${weight} ${size}px Lato, "Segoe UI", Helvetica, Arial, sans-serif`;
  return measureCtx.measureText(str).width;
}

// svg sized to its .chart container
function chartSvg(id) {
  const el = document.getElementById(id);
  const w = el.clientWidth, h = el.clientHeight;
  const svg = d3.select(el).selectAll("svg").data([0]).join("svg").attr("width", w).attr("height", h);
  return { svg, w, h };
}

const tip = d3.select("#tooltip");

function showTip(event, html) {
  tip.html(html).classed("show", true);
  moveTip(event);
}

function moveTip(event) {
  const pad = 14, node = tip.node();
  const w = node.offsetWidth, h = node.offsetHeight;
  let x = event.clientX + pad, y = event.clientY + pad;
  if (x + w > innerWidth - 6) x = event.clientX - w - pad;
  if (y + h > innerHeight - 6) y = event.clientY - h - pad;
  tip.style("left", `${Math.max(6, x)}px`).style("top", `${Math.max(6, y)}px`);
}

function hideTip() {
  tip.classed("show", false);
}

function statsTip(title, model, r) {
  return `<div class="tt-title">${markerIcon(model)}${title}</div>
    <table>
      <tr><td>F1</td><td><b>${fmt3(r.f1)}</b></td></tr>
      <tr><td>Precision</td><td>${fmt3(r.precision)}</td></tr>
      <tr><td>Recall</td><td>${fmt3(r.recall)}</td></tr>
      <tr><td>Wrong target</td><td>${fmtInt(r.wrong)}</td></tr>
      <tr><td>Missed</td><td>${fmtInt(r.missed)}</td></tr>
      <tr><td>True links</td><td>${fmtInt(r.gt_links)}</td></tr>
    </table>`;
}

function buildSelector() {
  const opts = [{ id: null, label: "All models" }, ...MODELS.map(m => ({ id: m, label: m }))];
  d3.select("#model-selector").selectAll("button").data(opts).join("button")
    .attr("type", "button")
    .classed("all", d => !d.id)
    .html(d => (d.id ? markerIcon(d.id) : "") + d.label)
    .on("click", (e, d) => pickModel(d.id));
  updateSelector();
}

function updateSelector() {
  d3.select("#model-selector").selectAll("button")
    .classed("active", d => d.id === state.model)
    .classed("faded", d => state.model && d.id && d.id !== state.model)
    .attr("aria-pressed", d => d.id === state.model);
}

function redrawAll() {
  app.views.forEach(v => v.draw());
  app.views.forEach(v => v.update(true));
}

async function start() {
  const data = await d3.json("data/summary.json");
  data.seqIndex = new Map(data.sequences.map(r => [`${r.cell_line}|${r.sequence}|${r.model}`, r]));
  app.data = data;
  app.views = [View1, View2, View3];
  buildSelector();
  app.views.forEach(v => v.init());
  redrawAll();

  // redraw when any chart box changes size (window resize, wrapped text, ...)
  let timer, first = true;
  const ro = new ResizeObserver(() => {
    if (first) { first = false; return; }
    clearTimeout(timer);
    timer = setTimeout(redrawAll, 100);
  });
  document.querySelectorAll(".chart").forEach(el => ro.observe(el));
  // web font changes text widths, so lay out again once it is in
  if (document.fonts) document.fonts.ready.then(redrawAll);
}
