import { BASE_URL, PHASE_ID } from "./constants.js";

const COLUMN_WIDTH = 280; // was 220
const BOX_WIDTH = 200; // was 160
const BOX_HEIGHT = 60; // was 40
interface EntrantSource {
  type?: string; // e.g. "set"
  typeId?: number | string; // links to another set's id
}

interface Slot {
  entrant?: {
    id: number;
    name: string;
  };
}
interface BracketSet {
  id: string;
  fullRoundText: string;
  round: number;
  slots: Slot[];
  entrant1Source: EntrantSource;
  entrant2Source: EntrantSource;
  winnerId?: number;
  // Layout / graph info
  y?: number;
  children?: BracketSet[];
  element?: HTMLElement;
}

// Represents a node in the graph
interface BracketNode {
  id: string;
  set: BracketSet;
  parents: BracketNode[]; // upstream matches feeding into this
  children: BracketNode[]; // downstream matches that this feeds into
}

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  round: number;
  match: number;
  name: string;
}

function parseMatchFromTypeId(typeId: string | number): number {
  if (typeof typeId === "string" && typeId.includes("_")) {
    const parts = typeId.split("_");
    return parseInt(parts[3], 10) || 0;
  }
  // fallback for numeric IDs
  return Number(typeId) || 0;
}

function buildBracketGraph(sets: BracketSet[]): BracketNode[] {
  const nodeMap: Record<string, BracketNode> = {};
  for (const set of sets) {
    const key = set.id.toString(); // ensure string key
    nodeMap[key] = { id: key, set, parents: [], children: [] };
  }

  // Sort by round, then by match
  sets.sort((a, b) => {
    const aRound = a.round;
    const bRound = b.round;
    const aMatch = parseMatchFromTypeId(a.id);
    const bMatch = parseMatchFromTypeId(b.id);
    return aRound !== bRound ? aRound - bRound : aMatch - bMatch;
  });

  // Connect parents → children
  for (const set of sets) {
    const node = nodeMap[set.id.toString()];
    const sources = [set.entrant1Source, set.entrant2Source];

    for (const src of sources) {
      if (!src || src.type !== "set" || src.typeId == null) continue;
      const parentNode = nodeMap[src.typeId.toString()];
      if (parentNode) {
        parentNode.children.push(node);
        node.parents.push(parentNode);
      }
    }
  }

  return Object.values(nodeMap).filter((n) => n.parents.length === 0);
}

function drawBracket(
  sets: any[],
  layout: Record<string, LayoutNode>,
  boxW: number,
  boxH: number,
  svg: SVGSVGElement
) {
  svg.innerHTML = ""; // clear

  // Create a single group to hold everything — we'll measure this group's bbox
  const gContent = document.createElementNS("http://www.w3.org/2000/svg", "g");
  gContent.setAttribute("id", "bracket-content");
  svg.appendChild(gContent);

  // Draw connectors into gContent
  for (const set of sets) {
    const target = layout[set.id];
    const sources = [set.entrant1Source, set.entrant2Source];

    for (const src of sources) {
      if (!src || src.type !== "set" || src.typeId == null) continue;
      const from = layout[src.typeId.toString()];
      if (!from) continue;

      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      const startX = from.x + boxW / 2;
      const startY = from.y;
      const endX = target.x - boxW / 2;
      const endY = target.y;
      const curveX = (startX + endX) / 2;

      path.setAttribute(
        "d",
        `M${startX},${startY} C${curveX},${startY} ${curveX},${endY} ${endX},${endY}`
      );
      path.classList.add("connector");
      gContent.appendChild(path);
    }
  }

  // Draw match boxes into gContent
  for (const node of Object.values(layout)) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute(
      "transform",
      `translate(${node.x - boxW / 2}, ${node.y - boxH / 2})`
    );

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("width", boxW.toString());
    rect.setAttribute("height", boxH.toString());
    rect.setAttribute("round_number", node.round.toString());
    rect.classList.add("set");
    g.appendChild(rect);

    // Handle player text lines
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.classList.add("players");
    text.setAttribute("font-size", "16"); // was default, now bigger
    text.setAttribute("x", (boxW / 2).toString());
    text.setAttribute("y", (boxH / 2 - 6).toString());

    const players = node.name.split(" vs ");
    players.forEach((p, i) => {
      const tspan = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "tspan"
      );
      tspan.setAttribute("x", (boxW / 2).toString());
      tspan.setAttribute("dy", i === 0 ? "0" : "1.3em"); // space between lines
      if (i === 0) tspan.classList.add("player-top");
      else tspan.classList.add("player-bottom");
      tspan.textContent = p || "TBD";
      text.appendChild(tspan);
    });

    g.appendChild(text);
    gContent.appendChild(g);
  }

  // --- Fit SVG to content by setting viewBox on the svg ---
  // Delay slightly to ensure browser has computed layout (usually not necessary,
  // but defensive if calling immediately after heavy DOM ops)
  requestAnimationFrame(() => {
    try {
      const bbox = gContent.getBBox();
      // Guard against degenerate bbox values
      const minWidth = 10;
      const minHeight = 10;
      const width = bbox.width > minWidth ? bbox.width : minWidth;
      const height = bbox.height > minHeight ? bbox.height : minHeight;
      const x = isFinite(bbox.x) ? bbox.x : 0;
      const y = isFinite(bbox.y) ? bbox.y : 0;

      svg.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
      // Let the SVG scale uniformly (fit) and stay centered
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      // Ensure svg fills the container via CSS (you already have this)
      // svg.style.width = "100%";
      // svg.style.height = "100%";
    } catch (err) {
      // If getBBox fails (some browsers restrict it until rendered), fallback:
      console.warn("Could not compute bbox for bracket-content", err);
      svg.removeAttribute("viewBox"); // fallback to default
    }
  });
}

// Recompute on resize so the viewBox stays fitted
window.addEventListener("resize", () => {
  // If you store the last-drawn sets/layout/box sizes globally, call drawBracket again.
  // Easiest: just re-run your update sequence to redraw & re-fit.
  // For minimal work, call updateBracket() if it is cheap enough:
  // updateBracket();
  // OR: compute the same viewBox logic again if you kept references to gContent.
});

function buildLayout(
  sets: any[],
  xOffset: number,
  yOffset = 0,
  availableHeight = window.innerHeight
): Record<string, LayoutNode> {
  const roundGroups: Record<number, any[]> = {};
  sets.forEach((s) => {
    const roundKey = Math.abs(s.round);
    if (!roundGroups[roundKey]) roundGroups[roundKey] = [];
    roundGroups[roundKey].push(s);
  });

  const rounds = Object.keys(roundGroups)
    .map(Number)
    .sort((a, b) => a - b);

  const layout: Record<string, LayoutNode> = {};
  rounds.forEach((round, colIdx) => {
    const setsInRound = roundGroups[round];
    setsInRound.sort(
      (a, b) => parseMatchFromTypeId(a.id) - parseMatchFromTypeId(b.id)
    );

    const startY = 0;
    const endY = availableHeight;
    const virtualSlots = setsInRound.length + 2;
    const spacing = (endY - startY - BOX_HEIGHT) / (virtualSlots - 1);

    setsInRound.forEach((set, i) => {
      const x = colIdx * COLUMN_WIDTH + xOffset;
      const y = yOffset + startY + (i + 1) * spacing;

      const names = set.slots
        .map((s: any) => s?.entrant?.name || "")
        .filter(Boolean);
      let entrantNames =
        names.length === 2
          ? `${names[0]} vs ${names[1]}`
          : names.length === 1
          ? `${names[0]} vs TBD`
          : `TBD vs TBD`;

      layout[set.id] = {
        id: set.id,
        x,
        y,
        round,
        match: parseMatchFromTypeId(set.id),
        name: entrantNames,
      };
    });
  });

  return layout;
}

/* --- Update loop --- */
async function fetchBracket() {
  const res = await fetch(`${BASE_URL}/bracket/${PHASE_ID}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function updateBracket() {
  const json = await fetchBracket();

  // Flatten sets
  const allSets: any[] = [];
  json.data.phase.sets.forEach((set: BracketSet) => {
    // Adjust Grand Finals Reset to appear one column further
    if (set.fullRoundText === "Grand Final Reset") {
      set.round += 1;
      set.id = `preview_141414_${set.round}_0`;
    }
    allSets.push(set);
  });

  // --- Winners bracket ---
  const halfHeight = window.innerHeight / 2;

  const winnersSets = allSets.filter((s) => s.round >= 0);
  const winnerLayout = buildLayout(winnersSets, 0, 0, window.innerHeight); // top half
  const winnerRoots = buildBracketGraph(winnersSets);

  // --- Losers bracket ---
  const losersSets = allSets.filter((s) => s.round < 0);
  const LOSERS_X_OFFSET =
    Math.max(...winnersSets.map((s) => s.round)) * COLUMN_WIDTH + 300;
  const loserLayout = buildLayout(losersSets, 0, 0, window.innerHeight); // bottom half
  const loserRoots = buildBracketGraph(losersSets);

  const winnersFinal = winnersSets
    .filter((s: any) => s.fullRoundText.includes("Grand Final"))
    .sort((a: any, b: any) => a.round - b.round)[0];

  const losersFinal = losersSets
    .filter((s: any) => s.fullRoundText.includes("Grand Final"))
    .sort((a: any, b: any) => a.round - b.round)[0];

  // Flatten sets and conditionally add Grand Final Reset
  json.data.phase.sets.forEach((set: BracketSet) => {
    if (set.fullRoundText === "Grand Final Reset") {
      // Only include reset if loser bracket winner won the first GF match
      const grandFinal = json.data.phase.sets.find(
        (s: any) => s.fullRoundText === "Grand Final"
      );
      if (grandFinal && grandFinal.winnerId === losersFinal?.winnerId) {
        set.round += 1;
        set.id = `preview_141414_${set.round}_0`;
        allSets.push(set);
      }
    } else {
      allSets.push(set);
    }
  });

  // Combine layouts
  const combinedLayout: Record<string, LayoutNode> = {
    ...winnerLayout,
    ...loserLayout,
  };

  // Combine sets for drawing
  const combinedSets = [...winnersSets, ...losersSets];

  const winnersSvg = document.querySelector<SVGSVGElement>("#winners-bracket")!;
  const losersSvg = document.querySelector<SVGSVGElement>("#losers-bracket")!;

  // Draw everything
  drawBracket(winnersSets, winnerLayout, BOX_WIDTH, BOX_HEIGHT, winnersSvg);
  drawBracket(losersSets, loserLayout, BOX_WIDTH, BOX_HEIGHT, losersSvg);
}
let showingWinners = true;

function toggleBrackets() {
  showingWinners = !showingWinners;

  // toggle bracket SVGs
  document
    .getElementById("winners-bracket")
    ?.classList.toggle("active", showingWinners);
  document
    .getElementById("losers-bracket")
    ?.classList.toggle("active", !showingWinners);

  // toggle headers
  document
    .getElementById("winners-header")
    ?.classList.toggle("active", showingWinners);
  document
    .getElementById("losers-header")
    ?.classList.toggle("active", !showingWinners);
}

// Example: switch every 10 seconds
setInterval(toggleBrackets, 10000);
setInterval(updateBracket, 30000);

updateBracket();
document.getElementById("winners-bracket")?.classList.add("active");
