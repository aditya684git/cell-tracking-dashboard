const View3 = (() => {
  const N = 4;                       // transitions shown at once
  const IMG_X = [-10, 1235], IMG_Y = [-10, 912];
  const STYLE = {
    c: { color: COL.correct, width: 1.3, dash: null, label: "Correct link" },
    w: { color: COL.wrong, width: 1.9, dash: "5 3", label: "Wrong target" },
    m: { color: COL.missed, width: 1.6, dash: "3 3", label: "Missed true link" }
  };
  const ORDER = { m: 0, c: 1, w: 2 };  // wrong links drawn on top
  const cache = new Map();
  let links = null, byT = null, counts = null, T = 0, key = null, pending = null;
  let plot, tl;

  const parseRow = d => ({
    t: +d.t, s: d.s, src: +d.src, tgt: +d.tgt, trueTgt: d.true_tgt, div: d.div === "1",
    sx: +d.sx, sy: +d.sy, tx: +d.tx, ty: +d.ty, track: +d.track
  });
  const fileKey = () => `${state.line}_${state.seq}_${state.v3model}`;
  const clampWin = w => Math.max(0, Math.min(T - N, w));
  const linkId = d => `${d.t}|${d.s}|${d.src}|${d.tgt}`;

  function lineIcon(s, w = 22) {
    const st = STYLE[s];
    return `<svg width="${w}" height="8" aria-hidden="true"><line x1="1" x2="${w - 1}" y1="4" y2="4" stroke="${st.color}"
      stroke-width="${st.width + 0.4}" ${st.dash ? `stroke-dasharray="${st.dash}"` : ""}/></svg>`;
  }

  function init() {
    d3.select("#v3-prev").on("click", () => setState({ win: clampWin(state.win - 1) }));
    d3.select("#v3-next").on("click", () => setState({ win: clampWin(state.win + 1) }));
    window.addEventListener("keydown", e => {
      if (!links || e.target.closest("input, textarea, select")) return;
      if (e.key === "ArrowLeft") setState({ win: clampWin(state.win - 1) });
      if (e.key === "ArrowRight") setState({ win: clampWin(state.win + 1) });
    });
    d3.select("#v3-plot").append("div").attr("class", "loading").text("Loading…").style("display", "none");
  }

  function load(k) {
    if (!cache.has(k)) cache.set(k, d3.csv(`data/links/${k}.csv`, parseRow));
    return cache.get(k);
  }

  function setData(k, rows) {
    key = k;
    links = rows;
    const r = seqRow(state.line, state.seq, state.v3model);
    T = r.frames - 1;
    byT = d3.group(rows, d => d.t);
    counts = d3.range(T).map(t => {
      const c = { t, c: 0, w: 0, m: 0 };
      (byT.get(t) || []).forEach(d => c[d.s]++);
      return c;
    });
    state.win = clampWin(state.win);
  }

  function draw() {
    drawPlotFrame();
    drawTimeline();
    if (links) renderWindow(true);
  }

  function update(instant) {
    const k = fileKey();
    if (k !== key) {
      if (pending === k) return;
      pending = k;
      d3.select("#v3-plot .loading").style("display", null).text("Loading…");
      load(k).then(rows => {
        if (fileKey() !== k) return;
        pending = null;
        d3.select("#v3-plot .loading").style("display", "none");
        const first = !links;
        setData(k, rows);
        updateText(windowRows());  // text first, it can change the strip height
        drawTimeline();
        renderWindow(first);
      }).catch(() => {
        pending = null;
        cache.delete(k);
        d3.select("#v3-plot .loading").text(`Could not load ${k}.csv`);
      });
      return;
    }
    state.win = clampWin(state.win);
    renderWindow(instant);
  }

  function drawPlotFrame() {
    const m = { l: 34, r: 6, t: 4, b: 20 };
    const el = document.getElementById("v3-plot");
    el.style.flex = "";
    const need = (el.clientWidth - m.l - m.r) * (IMG_Y[1] - IMG_Y[0]) / (IMG_X[1] - IMG_X[0]) + m.t + m.b;
    if (need < el.clientHeight) el.style.flex = `0 0 ${need}px`;
    const { svg, w, h } = chartSvg("v3-plot");
    const k = Math.min((w - m.l - m.r) / (IMG_X[1] - IMG_X[0]), (h - m.t - m.b) / (IMG_Y[1] - IMG_Y[0]));
    const pw = k * (IMG_X[1] - IMG_X[0]), ph = k * (IMG_Y[1] - IMG_Y[0]);
    const ox = m.l + (w - m.l - m.r - pw) / 2;
    const x = d3.scaleLinear(IMG_X, [ox, ox + pw]);
    const y = d3.scaleLinear(IMG_Y, [m.t, m.t + ph]);
    svg.selectAll("*").remove();

    svg.append("rect").attr("x", ox).attr("y", m.t).attr("width", pw).attr("height", ph)
      .attr("fill", "#FBFCFD").attr("stroke", COL.grid);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${m.t + ph})`)
      .call(d3.axisBottom(x).tickValues(d3.range(0, 1201, 200)).tickSize(3).tickFormat(v => v === 1200 ? "1200 px" : v))
      .select(".domain").remove();
    svg.append("g").attr("class", "axis").attr("transform", `translate(${ox},0)`)
      .call(d3.axisLeft(y).tickValues(d3.range(0, 901, 200)).tickSize(3))
      .select(".domain").remove();

    svg.append("g").attr("class", "links");
    svg.append("g").attr("class", "cells").attr("pointer-events", "none");
    plot = { svg, x, y };
  }

  function drawTimeline() {
    const { svg, w, h } = chartSvg("v3-timeline");
    svg.selectAll("*").remove();
    tl = null;
    if (!links) return;
    const m = { l: 34, r: 6, t: 4, b: 18 };
    const x = d3.scaleLinear([1, T + 1], [m.l, w - m.r]);
    const maxE = d3.max(counts, c => c.w + c.m);
    const y = d3.scaleLinear([0, maxE], [h - m.b, m.t]).nice();
    const bw = Math.max(0.8, x(2) - x(1) - (x(2) - x(1) > 3 ? 0.6 : 0.15));

    svg.append("g").selectAll("line").data(y.ticks(3)).join("line")
      .attr("class", "gridline").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y).attr("y2", y);
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(3).tickSize(0).tickPadding(5)).select(".domain").remove();
    const ax = svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`)
      .call(d3.axisBottom(x).ticks(Math.min(8, w / 80)).tickSize(3).tickFormat(d3.format("d")));
    ax.select(".domain").attr("stroke", "#CBD2D9");
    ax.append("text").attr("x", w - m.r).attr("y", 15).attr("text-anchor", "end").text("transition →");

    const bar = svg.append("g").selectAll("g").data(counts).join("g");
    bar.append("rect").attr("x", c => x(c.t + 1)).attr("width", bw)
      .attr("y", c => y(c.m)).attr("height", c => y(0) - y(c.m)).attr("fill", COL.missed);
    bar.append("rect").attr("x", c => x(c.t + 1)).attr("width", bw)
      .attr("y", c => y(c.m + c.w)).attr("height", c => y(c.m) - y(c.m + c.w)).attr("fill", COL.wrong);

    svg.append("rect").attr("class", "win")
      .attr("y", m.t - 2).attr("height", h - m.b - m.t + 2).attr("rx", 2)
      .attr("fill", COL.ink).attr("fill-opacity", 0.1).attr("stroke", COL.ink).attr("stroke-width", 1.2)
      .attr("pointer-events", "none");

    // full-height hit strips so thin bars are easy to click
    svg.append("g").selectAll("rect").data(counts).join("rect")
      .attr("class", "clickable")
      .attr("x", c => x(c.t + 1)).attr("width", x(2) - x(1) + 0.01)
      .attr("y", m.t).attr("height", h - m.b - m.t).attr("fill", "transparent")
      .on("mouseenter", (e, c) => showTip(e, `<div class="tt-title">Transition ${c.t + 1} · frame ${c.t} → ${c.t + 1}</div>
        <table><tr><td>Wrong target</td><td>${c.w}</td></tr><tr><td>Missed</td><td>${c.m}</td></tr>
        <tr><td>Correct</td><td>${c.c}</td></tr></table><div class="note">Click to show transitions from here.</div>`))
      .on("mousemove", moveTip)
      .on("mouseleave", hideTip)
      .on("click", (e, c) => setState({ win: clampWin(c.t) }));

    tl = { svg, x };
  }

  function windowRows() {
    return d3.range(state.win, state.win + N).flatMap(f => byT.get(f) || [])
      .sort((a, b) => ORDER[a.s] - ORDER[b.s]);
  }

  function renderWindow(instant) {
    const t = instant ? 0 : DUR;
    const win = state.win;
    const rows = windowRows();
    const { x, y } = plot;

    const lk = plot.svg.select(".links").selectAll("g.lk").data(rows, linkId).join(
      enter => {
        const g = enter.append("g").attr("class", "lk").attr("opacity", 0);
        g.append("line").attr("class", "vis");
        g.append("line").attr("class", "hit").attr("stroke", "transparent").attr("stroke-width", 10);
        g.on("mouseenter", (e, d) => focusLink(e, d, rows))
          .on("mousemove", moveTip)
          .on("mouseleave", () => unfocus());
        return g;
      },
      upd => upd,
      exit => exit.transition().duration(t).attr("opacity", 0).remove()
    ).order();
    lk.selectAll("line").attr("x1", d => x(d.sx)).attr("y1", d => y(d.sy)).attr("x2", d => x(d.tx)).attr("y2", d => y(d.ty));
    lk.select(".vis")
      .attr("stroke", d => STYLE[d.s].color).attr("stroke-width", d => STYLE[d.s].width)
      .attr("stroke-dasharray", d => STYLE[d.s].dash).attr("stroke-linecap", "round");
    lk.transition().duration(t).attr("opacity", 1);

    const cells = [];
    const seen = new Set();
    rows.forEach(d => {
      const a = `s|${d.t}|${d.src}`, b = `t|${d.t + 1}|${d.tgt}`;
      if (!seen.has(a)) { seen.add(a); cells.push({ id: a, kind: "s", cell: d.src, x: d.sx, y: d.sy }); }
      if (!seen.has(b)) { seen.add(b); cells.push({ id: b, kind: "t", cell: d.tgt, x: d.tx, y: d.ty }); }
    });
    plot.svg.select(".cells").selectAll("path").data(cells, c => c.id).join(
      enter => enter.append("path").attr("opacity", 0),
      upd => upd,
      exit => exit.transition().duration(t).attr("opacity", 0).remove()
    )
      .attr("transform", c => `translate(${x(c.x)},${y(c.y)})`)
      .attr("d", c => d3.symbol(c.kind === "s" ? d3.symbolCircle : d3.symbolSquare, c.kind === "s" ? 22 : 26)())
      .attr("fill", "#fff").attr("stroke", "#7B8794").attr("stroke-width", 1)
      .transition().duration(t).attr("opacity", 1);

    if (tl) {
      const s = tl.svg.select(".win");
      (s.attr("x") === null || instant ? s : s.transition().duration(t))
        .attr("x", tl.x(win + 1) - 1).attr("width", tl.x(win + N + 1) - tl.x(win + 1) + 2);
    }
    updateText(rows);
  }

  function updateText(rows) {
    const r = seqRow(state.line, state.seq, state.v3model);
    const m = state.v3model;
    d3.select("#v3-name").html(`${markerIcon(m, true, 13)}${state.line} · ${state.seq} · ${m}`);
    d3.select("#v3-score").text(`F1 ${fmt2(r.f1)} · ${fmtInt(links.length)} links over ${T} transitions`);
    d3.select("#v3-tl-title").text(`Errors in every transition of the sequence (${fmtInt(links.length)} links)`);

    const n = { c: 0, w: 0, m: 0 };
    rows.forEach(d => n[d.s]++);
    const win = state.win;
    d3.select("#v3-summary").html(`
      <span><span class="range">Transitions ${win + 1}–${win + N} of ${T}</span>
        <span class="muted">· frames ${win} → ${win + N}</span></span>
      <span class="key">${lineIcon("c")}Correct <b>${n.c}</b></span>
      <span class="key">${lineIcon("w")}Wrong <b>${n.w}</b></span>
      <span class="key">${lineIcon("m")}Missed <b>${n.m}</b></span>
      <span class="key muted"><svg width="10" height="10"><circle cx="5" cy="5" r="3" fill="#fff" stroke="#7B8794"/></svg>source
        <svg width="10" height="10"><rect x="1.5" y="1.5" width="7" height="7" fill="#fff" stroke="#7B8794"/></svg>target</span>`);
    d3.select("#v3-prev").property("disabled", win <= 0);
    d3.select("#v3-next").property("disabled", win >= T - N);
  }

  // hovering a link: dim the rest, and pair a wrong link with the true link it should have been
  function focusLink(e, d, rows) {
    const partner = d.s === "w" ? "m" : d.s === "m" ? "w" : null;
    const related = rows.filter(o => o.s === partner && o.t === d.t && o.src === d.src);
    const on = new Set([d, ...related]);
    const ids = new Set();
    on.forEach(o => { ids.add(`s|${o.t}|${o.src}`); ids.add(`t|${o.t + 1}|${o.tgt}`); });

    const lk = plot.svg.selectAll("g.lk");
    lk.interrupt().attr("opacity", o => on.has(o) ? 1 : 0.12);
    lk.filter(o => on.has(o)).raise().select(".vis")
      .attr("stroke-width", o => STYLE[o.s].width + 1)
      .attr("stroke", o => o.s === "m" ? "#7B8794" : STYLE[o.s].color);
    plot.svg.select(".cells").raise().selectAll("path").interrupt().attr("opacity", c => ids.has(c.id) ? 1 : 0.15);

    const predicted = d.s === "m"
      ? (related.length ? related.map(o => o.tgt).join(", ") + " (wrong)" : "none")
      : d.tgt;
    const truth = d.s === "w" ? (d.trueTgt || "").split(";").join(", ") : d.tgt;
    let note = "";
    if (d.s === "w") note = "The model's link is orange; the true link is the grey dashed line.";
    if (d.s === "m" && related.length) note = "The model linked this cell to another target (orange).";
    if (d.div) note += `${note ? " " : ""}The source cell divides here; no model links divisions.`;
    showTip(e, `<div class="tt-title">${lineIcon(d.s, 18)}${STYLE[d.s].label}</div>
      <table>
        <tr><td>Frame</td><td>${d.t} → ${d.t + 1}</td></tr>
        <tr><td>Source cell</td><td>${d.src}</td></tr>
        <tr><td>Predicted target</td><td>${predicted}</td></tr>
        <tr><td>True target</td><td>${truth}</td></tr>
        <tr><td>Ground-truth track</td><td>${d.track}</td></tr>
      </table>${note ? `<div class="note">${note}</div>` : ""}`);
  }

  function unfocus() {
    hideTip();
    const lk = plot.svg.selectAll("g.lk").attr("opacity", 1);
    lk.sort((a, b) => ORDER[a.s] - ORDER[b.s]);
    lk.select(".vis").attr("stroke-width", o => STYLE[o.s].width).attr("stroke", o => STYLE[o.s].color);
    plot.svg.select(".cells").selectAll("path").attr("opacity", 1);
  }

  return { init, draw, update };
})();
