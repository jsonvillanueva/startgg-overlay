import { BASE_URL, PHASE_ID } from "./constants.js";

interface EntrantSource {
  type?: string; // e.g. "set"
  typeId?: string; // links to another set's id
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

function parseMatchFromTypeId(typeId: string): number {
  // typeId format: preview_<groupId>_<round>_<match>
  const parts = typeId.split("_");
  if (parts.length < 4) return 0; // fallback
  return parseInt(parts[3], 10);
}

function buildBracketGraph(sets: BracketSet[]): BracketNode[] {
  // Step 1: Create a lookup of id → BracketNode
  const nodeMap: Record<string, BracketNode> = {};
  for (const set of sets) {
    nodeMap[set.id] = {
      id: set.id,
      set,
      parents: [],
      children: [],
    };
  }

  // Sort the sets by round first, then by match number (derived from typeId)
  sets.sort((a, b) => {
    const aRound = a.round;
    const bRound = b.round;
    const aMatch = parseInt(a.id.split("_")[2], 10); // Extract match number from typeId
    const bMatch = parseInt(b.id.split("_")[2], 10);
    return aRound !== bRound ? aRound - bRound : aMatch - bMatch;
  });

  // Step 2: Connect edges using entrant sources
  for (const set of sets) {
    const node = nodeMap[set.id];
    const sources = [set.entrant1Source, set.entrant2Source];

    for (const src of sources) {
      if (!src) continue;
      if (src.type === "set" && typeof src.typeId === "string") {
        const parentNode = nodeMap[src.typeId];
        if (parentNode) {
          // Link parent → child
          parentNode.children.push(node);
          // Link child → parent
          node.parents.push(parentNode);
        }
      }
      // Seeds (type === "seed") are terminal inputs (no parent node)
    }
  }

  // Step 3: Find root nodes (no parents → earliest round matches)
  const roots = Object.values(nodeMap).filter((n) => n.parents.length === 0);

  return roots;
}

function drawBracket(
  sets: any[],
  layout: Record<string, LayoutNode>,
  boxW: number,
  boxH: number
) {
  const svg = document.querySelector<SVGSVGElement>("#bracket")!;
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
      if (!src || src.type !== "set") continue;
      const from = layout[src.typeId];
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
  console.log(json);
  json.data.phase.sets.forEach((set: BracketSet) => {
    // Adjust Grand Finals Reset to appear one column further
    if (set.fullRoundText === "Grand Final Reset") {
      set.round += 1;
      set.id = `preview_141414_${set.round}_0`;
    }
    allSets.push(set);
  });

  // Build winners graph (round >= 0)
  const winnersSets = allSets.filter((s) => s.round >= 0);
  const roots = buildBracketGraph(winnersSets);

  // Layout by round → X position
  const roundGroups: Record<number, any[]> = {};
  for (const s of winnersSets) {
    if (!roundGroups[s.round]) roundGroups[s.round] = [];
    roundGroups[s.round].push(s);
  }

  // Sort rounds ascending
  const rounds = Object.keys(roundGroups)
    .map(Number)
    .sort((a, b) => a - b);

  // Layout constants
  const COLUMN_WIDTH = 220;
  const ROW_HEIGHT = 100;
  const BOX_WIDTH = 160;
  const BOX_HEIGHT = 40;

  const layout: Record<string, LayoutNode> = {};
  rounds.forEach((round, colIdx) => {
    const sets = roundGroups[round];

    // Sort sets by match number
    sets.sort(
      (a, b) => parseMatchFromTypeId(a.id) - parseMatchFromTypeId(b.id)
    );

    const startY = 50;
    const endY = window.innerHeight - 50;

    const n = sets.length;
    const virtualSlots = n + 2; // two "ghost" matches for spacing
    const spacing = (endY - startY) / (virtualSlots - 1);

    sets.forEach((set, i) => {
      const x = colIdx * COLUMN_WIDTH + 100;
      // y is offset by 1 to account for the "top ghost"
      const y = startY + (i + 1) * spacing;

      // Compute entrant names
      const names = set.slots
        .map((s: any) => s?.entrant?.name || "")
        .filter(Boolean);
      let entrantNames: string;
      if (names.length === 2) entrantNames = `${names[0]} vs ${names[1]}`;
      else if (names.length === 1) entrantNames = `${names[0]} vs TBD`;
      else entrantNames = `TBD vs TBD`;

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

  drawBracket(winnersSets, layout, BOX_WIDTH, BOX_HEIGHT);
}

updateBracket();
