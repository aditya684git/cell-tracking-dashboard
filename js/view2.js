const View2 = (() => {
  const F1_DOMAIN = [0.78, 0.98];
  const ramp = d3.scaleSequential(F1_DOMAIN, d3.interpolateLab("#323F4B", "#F5F7FA")).clamp(true);
  const fmtK = v => `${(v / 1000).toFixed(1)}k`;
  let svg, cellPos, colX, cw, rh;

  function init() {}

  function draw() {
    const c = chartSvg("v2-heat");
    svg = c.svg;
    const { w, h } = c;
    const fs = fontSize();
    const seqs = app.data.sequences;
    const groups = d3.groups(seqs.filter(s => s.model === MODELS[0]), s => s.cell_line);

    const labW = textWidth("FLD_102", fs) + 14;
    const barW = Math.min(90, Math.max(64, w * 0.2));
    const top = fs * 2.7 + 16;
    const legendH = 40;
    const hh = fs + 10, gg = 6;
    cw = Math.min(130, (w - labW - barW - 10) / MODELS.length);
    rh = Math.max(20, Math.min(50, (h - top - legendH - groups.length * hh - (groups.length - 1) * gg - 2) / 12));
    colX = m => labW + MODELS.indexOf(m) * cw;
    const barX = labW + MODELS.length * cw + 10;

    const rowY = new Map(), groupBox = new Map();
    let yy = top;
    groups.forEach(([line, rows], gi) => {
      if (gi) yy += gg;
      const y0 = yy;
      yy += hh;
      rows.forEach(r => { rowY.set(`${line}|${r.sequence}`, yy); yy += rh; });
      groupBox.set(line, { y0, y1: yy });
    });
    const bottom = yy;
    cellPos = d => ({ x: colX(d.model), y: rowY.get(`${d.cell_line}|${d.sequence}`) });

    svg.selectAll("*").remove();

    const head = svg.append("g").selectAll("g").data(MODELS).join("g")
      .attr("class", "col-head clickable")
      .attr("transform", m => `translate(${colX(m)},0)`)
      .on("click", (e, m) => toggleModel(m));
    head.append("rect").attr("x", 1).attr("y", top - 7).attr("width", cw - 2).attr("height", 5).attr("rx", 2)
      .attr("fill", m => MODEL_COLOR[m]);
    head.each(function (m) {
      const g = d3.select(this);
      const parts = textWidth(m, fs, 700) > cw - 6 ? m.replace(/([a-z])([A-Z])/, "$1 $2").split(" ") : [m];
      const t = g.append("text").attr("text-anchor", "middle").attr("font-weight", 700);
      parts.forEach((p, i) => t.append("tspan").attr("x", cw / 2).attr("y", top - 12 - (parts.length - 1 - i) * (fs + 1)).text(p));
    });

    svg.append("text").attr("x", barX).attr("y", top - 12).attr("class", "muted").text("True links");

    // group headings and the outline used when a cell line is picked in View 1
    const grp = svg.append("g").selectAll("g").data(groups).join("g");
    grp.append("text").attr("class", "grp-label")
      .attr("x", 6).attr("y", ([line]) => groupBox.get(line).y0 + hh - 6)
      .attr("font-weight", 700).text(([line]) => line);
    grp.append("rect").attr("class", "grp-sel")
      .attr("x", 1).attr("width", barX + barW - 2)
      .attr("y", ([line]) => groupBox.get(line).y0 - 2)
      .attr("height", ([line]) => groupBox.get(line).y1 - groupBox.get(line).y0 + 4)
      .attr("rx", 5).attr("fill", "none").attr("stroke", COL.ink).attr("stroke-width", 1.5)
      .attr("opacity", 0).attr("pointer-events", "none");

    const firstModel = seqs.filter(s => s.model === MODELS[0]);
    svg.append("g").selectAll("text").data(firstModel).join("text")
      .attr("class", "seq-label")
      .attr("x", labW - 8).attr("y", d => cellPos(d).y + rh / 2).attr("dy", "0.35em")
      .attr("text-anchor", "end").text(d => d.sequence);

    const bx = d3.scaleLinear([0, d3.max(firstModel, d => d.gt_links)], [0, barW - textWidth("14.0k", 11) - 6]);
    const bar = svg.append("g").selectAll("g").data(firstModel).join("g")
      .attr("transform", d => `translate(${barX},${cellPos(d).y})`);
    bar.append("rect").attr("y", rh * 0.3).attr("height", rh * 0.4).attr("width", d => bx(d.gt_links))
      .attr("rx", 2).attr("fill", "#CBD2D9");
    bar.append("text").attr("class", "muted").attr("x", d => bx(d.gt_links) + 4).attr("y", rh / 2).attr("dy", "0.35em")
      .text(d => fmtK(d.gt_links));
    bar.append("title").text(d => `${fmtInt(d.gt_links)} true links in ${d.cell_line} ${d.sequence}`);

    const cell = svg.append("g").selectAll("g").data(seqs).join("g")
      .attr("class", "cell clickable")
      .attr("transform", d => `translate(${cellPos(d).x},${cellPos(d).y})`)
      .on("mouseenter", (e, d) => {
        d3.select(e.currentTarget).select("rect").attr("stroke", COL.ink);
        hoverCell({ line: d.cell_line, seq: d.sequence, model: d.model });
        showTip(e, statsTip(`${d.model} · ${d.cell_line} · ${d.sequence}`, d.model, d) +
          `<div class="note">Found ${d3.format(".0%")(d.recall)} of the true links.</div>`);
      })
      .on("mousemove", moveTip)
      .on("mouseleave", (e) => {
        d3.select(e.currentTarget).select("rect").attr("stroke", "none");
        hoverCell(null);
        hideTip();
      })
      .on("click", (e, d) => pickCell(d.cell_line, d.sequence, d.model));
    cell.append("rect").attr("x", 1).attr("y", 1).attr("width", cw - 2).attr("height", rh - 2).attr("rx", 3)
      .attr("fill", d => ramp(d.f1)).attr("stroke-width", 1.5);
    cell.append("text").attr("x", cw / 2).attr("y", rh / 2).attr("dy", "0.35em").attr("text-anchor", "middle")
      .style("fill", d => d3.lab(ramp(d.f1)).l < 60 ? "#fff" : COL.ink)
      .text(d => fmt2(d.f1));

    svg.append("g").selectAll("rect").data(MODELS).join("rect")
      .attr("class", "col-sel")
      .attr("x", m => colX(m) - 1).attr("y", top - fs * 2.7 - 12).attr("width", cw + 2).attr("height", bottom - top + fs * 2.7 + 14)
      .attr("rx", 5).attr("fill", "none").attr("stroke", m => MODEL_COLOR[m]).attr("stroke-width", 2)
      .attr("opacity", 0).attr("pointer-events", "none");

    svg.append("rect").attr("class", "cell-sel")
      .attr("width", cw).attr("height", rh).attr("rx", 4)
      .attr("fill", "none").attr("stroke", COL.wrong).attr("stroke-width", 3).attr("pointer-events", "none");

    drawLegend(labW, bottom + 16, MODELS.length * cw);
  }

  // grey ramp legend right under the cells
  function drawLegend(x0, y0, lw) {
    const g = svg.append("g").attr("transform", `translate(${x0},${y0})`);
    const x = d3.scaleLinear(F1_DOMAIN, [12, lw - 12]);
    const grad = g.append("defs").append("linearGradient").attr("id", "f1-grad");
    d3.range(0, 1.01, 0.1).forEach(t => grad.append("stop").attr("offset", t)
      .attr("stop-color", ramp(F1_DOMAIN[0] + t * (F1_DOMAIN[1] - F1_DOMAIN[0]))));
    g.append("text").attr("x", -8).attr("y", 9).attr("text-anchor", "end").attr("font-weight", 700).text("F1");
    g.append("rect").attr("x", 12).attr("width", lw - 24).attr("height", 10).attr("rx", 2).attr("fill", "url(#f1-grad)");
    g.append("g").selectAll("text").data([0.78, 0.83, 0.88, 0.93, 0.98]).join("text")
      .attr("class", "muted").attr("x", x).attr("y", 24).attr("text-anchor", "middle").text(fmt2);
  }

  function update(instant) {
    const t = instant ? 0 : DUR;
    svg.selectAll(".cell").transition().duration(t).attr("opacity", d => fadeFor(d.model) === 1 ? 1 : 0.25);
    svg.selectAll(".col-head").transition().duration(t).attr("opacity", m => fadeFor(m) === 1 ? 1 : 0.35);
    svg.selectAll(".col-sel").transition().duration(t).attr("opacity", m => state.model === m ? 1 : 0);
    svg.selectAll(".grp-sel").transition().duration(t).attr("opacity", ([line]) => state.cellLine === line ? 1 : 0);
    const p = cellPos({ cell_line: state.line, sequence: state.seq, model: state.v3model });
    const sel = svg.select(".cell-sel").raise();
    (sel.attr("x") === null || instant ? sel : sel.transition().duration(t))
      .attr("x", p.x).attr("y", p.y);
  }

  return { init, draw, update };
})();
