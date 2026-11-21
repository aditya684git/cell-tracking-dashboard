const View1 = (() => {
  const ALL = "All 12 sequences";
  const ERR_TYPES = [
    { key: "wrong", label: "Wrong target", color: COL.wrong },
    { key: "missed_div", label: "Missed: cell division", color: COL.missedDiv },
    { key: "missed_other", label: "Missed: other link", color: COL.missed }
  ];
  let dots, bars;

  function init() {
    d3.select("#v1-legend").selectAll("span").data(MODELS).join("span")
      .attr("class", "key btn")
      .attr("title", "Highlight this model")
      .html(m => `${markerIcon(m)}${m} <b>${fmt2(modelRow(m).f1)}</b>`)
      .on("click", (e, m) => toggleModel(m));
    d3.select("#v1-legend").append("span").attr("class", "key muted")
      .html(`<svg width="10" height="10"><circle cx="5" cy="5" r="3.5" fill="#fff" stroke="#7B8794" stroke-width="1.2"/></svg>one sequence`);

    d3.select("#v1-bar-legend").selectAll("span").data(ERR_TYPES).join("span")
      .attr("class", "key")
      .html(d => `<i class="sw" style="background:${d.color}"></i>${d.label}`);
  }

  function draw() {
    drawDots();
    drawBars();
  }

  function drawDots() {
    const { svg, w, h } = chartSvg("v1-dots");
    const fs = fontSize();
    const rows = [ALL, ...app.data.cellLines];
    const m = { l: textWidth(ALL, fs, 700) + 14, r: 10, t: 4, b: 30 };
    const x = d3.scaleLinear([0.76, 1], [m.l, w - m.r]);
    const y = d3.scaleBand(rows, [m.t, h - m.b]).paddingInner(0.1);
    const off = { LAP: -0.27, Trackastra: 0, LineageMapper: 0.27 };
    const my = (row, model) => y(row) + y.bandwidth() * (0.5 + off[model]);
    const sz = Math.max(22, Math.min(34, y.bandwidth() * 0.5));
    dots = { svg, x, y };

    svg.selectAll("*").remove();

    const ax = svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`)
      .call(d3.axisBottom(x).tickValues([0.8, 0.85, 0.9, 0.95, 1]).tickFormat(fmt2).tickSize(0).tickPadding(6));
    ax.select(".domain").remove();
    ax.append("text").attr("x", w - m.r).attr("y", 26).attr("text-anchor", "end")
      .attr("class", "muted").text("F1 score →");
    svg.append("g").selectAll("line").data(x.ticks(5)).join("line")
      .attr("class", "gridline").attr("x1", x).attr("x2", x).attr("y1", m.t).attr("y2", h - m.b);

    // whole row is the click target for a cell line
    const row = svg.append("g").selectAll("g").data(rows).join("g")
      .attr("class", "row clickable")
      .on("click", (e, r) => r === ALL ? setState({ cellLine: null }) : pickCellLine(r));
    row.append("rect").attr("class", "row-bg")
      .attr("x", 1).attr("y", r => y(r)).attr("width", w - 2).attr("height", y.bandwidth())
      .attr("rx", 5).attr("fill", "transparent");
    row.append("line")
      .attr("x1", m.l).attr("x2", w - m.r)
      .attr("y1", r => y(r) + y.bandwidth() / 2).attr("y2", r => y(r) + y.bandwidth() / 2)
      .attr("stroke", COL.grid).attr("stroke-dasharray", "2 3");
    row.append("text").attr("class", "row-label")
      .attr("x", m.l - 10).attr("y", r => y(r) + y.bandwidth() / 2).attr("dy", "0.35em")
      .attr("text-anchor", "end").attr("font-weight", r => r === ALL ? 700 : 400).text(r => r);
    row.on("mouseenter", function () { d3.select(this).select(".row-bg").attr("fill", "#F5F7FA"); })
      .on("mouseleave", function () { d3.select(this).select(".row-bg").attr("fill", "transparent"); });

    svg.append("line").attr("x1", 0).attr("x2", w)
      .attr("y1", y(rows[1]) - y.step() * y.paddingInner() / 2).attr("y2", y(rows[1]) - y.step() * y.paddingInner() / 2)
      .attr("stroke", "#CBD2D9");

    const marks = [];
    for (const r of rows) {
      for (const mod of MODELS) {
        const seqs = app.data.sequences.filter(s => s.model === mod && (r === ALL || s.cell_line === r));
        seqs.forEach(s => marks.push({ row: r, model: mod, kind: "seq", d: s }));
        marks.push({ row: r, model: mod, kind: "pool", d: r === ALL ? modelRow(mod) : lineRow(r, mod) });
      }
    }

    svg.append("g").selectAll("path").data(marks).join("path")
      .attr("class", d => `mark ${d.kind} clickable`)
      .attr("transform", d => `translate(${x(d.d.f1)},${my(d.row, d.model)})`)
      .attr("d", d => symbolPath(d.model, d.kind === "pool" ? sz * 3.2 : sz))
      .attr("fill", d => d.kind === "pool" ? MODEL_COLOR[d.model] : "#fff")
      .attr("stroke", d => d.kind === "pool" ? "#fff" : MODEL_COLOR[d.model])
      .attr("stroke-width", d => d.kind === "pool" ? 1.5 : 1.2)
      .on("mouseenter", (e, d) => {
        const where = d.kind === "pool" ? (d.row === ALL ? "all 12 sequences" : d.row) : `${d.d.cell_line} · ${d.d.sequence}`;
        showTip(e, statsTip(`${d.model} · ${where}`, d.model, d.d));
      })
      .on("mousemove", moveTip)
      .on("mouseleave", hideTip)
      .on("click", (e, d) => { e.stopPropagation(); toggleModel(d.model); });

    // pooled markers on top so hollow ones never cover them
    svg.selectAll(".mark.pool").raise();

    svg.append("rect").attr("class", "line-sel")
      .attr("x", 1).attr("y", y(rows[1])).attr("width", w - 2).attr("height", y.bandwidth()).attr("rx", 5)
      .attr("fill", "none").attr("stroke", COL.ink).attr("stroke-width", 1.5)
      .attr("pointer-events", "none").attr("opacity", 0);
  }

  function drawBars() {
    const { svg, w, h } = chartSvg("v1-bars");
    const fs = fontSize();
    const m = { l: 2, r: 12, t: 2, b: 20 };
    const rowH = (h - m.t - m.b) / MODELS.length;
    const barH = Math.max(10, Math.min(20, rowH - fs - 12));
    const maxErr = d3.max(app.data.byModel, r => r.wrong + r.missed);
    const x = d3.scaleLinear([0, maxErr], [m.l, w - m.r]).nice();
    svg.selectAll("*").remove();

    svg.append("g").selectAll("line").data(x.ticks(4)).join("line")
      .attr("class", "gridline").attr("x1", x).attr("x2", x).attr("y1", m.t).attr("y2", h - m.b);
    const ax = svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`)
      .call(d3.axisBottom(x).ticks(4).tickFormat(v => v ? `${v / 1000}k` : "0").tickSize(0).tickPadding(5));
    ax.select(".domain").remove();

    const row = svg.append("g").selectAll("g").data(MODELS).join("g")
      .attr("class", "err-row clickable")
      .attr("transform", (d, i) => `translate(0,${m.t + i * rowH})`)
      .on("click", (e, mod) => toggleModel(mod));

    const labelY = rowH - barH - 6;
    row.append("path").attr("transform", `translate(${m.l + 6},${labelY - fs * 0.35})`)
      .attr("d", mod => symbolPath(mod, 50)).attr("fill", mod => MODEL_COLOR[mod]);
    row.append("text").attr("x", m.l + 16).attr("y", labelY).attr("font-weight", 700).text(mod => mod);
    row.append("text").attr("x", w - m.r).attr("y", labelY).attr("text-anchor", "end")
      .html(mod => {
        const r = modelRow(mod);
        return `<tspan font-weight="700">${fmtInt(r.wrong + r.missed)}</tspan><tspan class="muted" fill="${COL.muted}"> · ${fmtInt(r.wrong)} wrong · ${fmtInt(r.missed)} missed</tspan>`;
      });

    row.each(function (mod) {
      const r = modelRow(mod);
      let acc = 0;
      const segs = ERR_TYPES.map(t => {
        const s = { ...t, model: mod, v: r[t.key], x0: acc, r };
        acc += r[t.key];
        return s;
      });
      d3.select(this).selectAll("rect").data(segs).join("rect")
        .attr("x", s => x(s.x0) + (s.x0 ? 1 : 0))
        .attr("y", rowH - barH - 2)
        .attr("width", s => Math.max(0, x(s.x0 + s.v) - x(s.x0) - (s.x0 ? 1 : 0) - 1))
        .attr("height", barH)
        .attr("rx", 2)
        .attr("fill", s => s.color)
        .on("mouseenter", (e, s) => {
          const tot = s.r.wrong + s.r.missed;
          showTip(e, `<div class="tt-title">${markerIcon(s.model)}${s.model} · ${s.label}</div>
            <table><tr><td>Links</td><td><b>${fmtInt(s.v)}</b></td></tr>
            <tr><td>Share of its errors</td><td>${fmtPct(s.v / tot)}</td></tr>
            <tr><td>All errors</td><td>${fmtInt(tot)}</td></tr>
            <tr><td>F1 · precision · recall</td><td>${fmt2(s.r.f1)} · ${fmt2(s.r.precision)} · ${fmt2(s.r.recall)}</td></tr></table>
            ${s.key === "missed_div" ? `<div class="note">All ${fmtInt(s.r.gt_division_links)} division links are missed.</div>` : ""}`);
        })
        .on("mousemove", moveTip)
        .on("mouseleave", hideTip);
    });
    bars = { svg };
  }

  function update(instant) {
    const t = instant ? 0 : DUR;
    dots.svg.selectAll(".mark").transition().duration(t).attr("opacity", d => fadeFor(d.model));
    const sel = state.cellLine;
    dots.svg.select(".line-sel").transition().duration(t)
      .attr("opacity", sel ? 1 : 0)
      .attr("y", sel ? dots.y(sel) : dots.svg.select(".line-sel").attr("y"));
    dots.svg.selectAll(".row-label").attr("font-weight", r => r === ALL || r === sel ? 700 : 400);
    bars.svg.selectAll(".err-row").transition().duration(t).attr("opacity", mod => fadeFor(mod) === 1 ? 1 : 0.25);
    d3.select("#v1-legend").selectAll(".key.btn").classed("faded", mod => fadeFor(mod) < 1);
    hover();
  }

  // ring the hollow marker of the heatmap cell under the mouse
  function hover() {
    const hv = state.hover;
    const hit = d => hv && d.kind === "seq" && d.model === hv.model && d.d.cell_line === hv.line && d.d.sequence === hv.seq;
    dots.svg.selectAll(".mark.seq")
      .attr("stroke", d => hit(d) ? COL.ink : MODEL_COLOR[d.model])
      .attr("stroke-width", d => hit(d) ? 2.4 : 1.2)
      .attr("opacity", d => hit(d) ? 1 : fadeFor(d.model))
      .filter(hit).raise();
    if (!hv) dots.svg.selectAll(".mark.pool").raise();
  }

  return { init, draw, update, hover };
})();
