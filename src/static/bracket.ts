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
  round_name: string;
  name: string;
}
function createRoundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  rTL: number, // top-left radius
  rBR: number // bottom-right radius
): string {
  return `
    M${x + rTL},${y}             
    L${x + w},${y}              
    L${x + w},${y + h - rBR}  
    Q${x + w},${y + h} ${x + w - rBR},${y + h} 
    L${x},${y + h}           
    L${x},${y + rTL}          
    Q${x},${y} ${x + rTL},${y} 
    Z
  `
    .replace(/\s+/g, " ")
    .trim();
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

    // Draw a path with rounded upper-left & bottom-right corners only
    const radius = 24;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

    const x = node.x - boxW / 2;
    const y = node.y - boxH / 2;

    // Path data for rectangle with rounded TL and BR corners
    // Relative coordinates inside <g>
    const d = `
  M ${radius},0
  H ${boxW}
  V ${boxH - radius}
  Q ${boxW},${boxH} ${boxW - radius},${boxH}
  H 0
  V ${radius}
  Q 0,0 ${radius},0
  Z
`;

    path.setAttribute("d", d.trim());
    path.classList.add("set");
    path.setAttribute("round_number", node.round.toString());
    path.setAttribute("round_name", node.round_name);
    path.classList.add("match-box");
    g.appendChild(path);

    // Handle player text lines
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.classList.add("players");
    text.setAttribute("font-size", "32"); // was default, now bigger
    text.setAttribute("x", (boxW / 2).toString());
    text.setAttribute("y", (boxH / 2 - 6).toString());

    const players = node.name.split(" vs ");
    players.forEach((p, i) => {
      const playerGroup = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "g"
      );
      const bg = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const text = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );

      const isTop = i === 0;
      const bgY = isTop ? 0 : boxH / 2;
      const textY = isTop ? boxH / 4 : (3 * boxH) / 4;

      bg.setAttribute(
        "d",
        createRoundedRectPath(
          0,
          bgY,
          boxW,
          boxH / 2,
          isTop ? radius : 0,
          isTop ? 0 : radius
        )
      );
      bg.classList.add("set", isTop ? "player-top-bg" : "player-bottom-bg");

      text.textContent = p || "";
      text.setAttribute("x", (boxW / 2).toString());
      text.setAttribute("y", textY.toString());
      text.classList.add("player-text", isTop ? "player-top" : "player-bottom");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("font-size", "16");

      playerGroup.appendChild(bg);
      playerGroup.appendChild(text);
      g.appendChild(playerGroup);
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

  // Find the round with the most matches
  const maxMatches = Math.max(...rounds.map((r) => roundGroups[r].length));
  const centerY = yOffset + availableHeight / 2;

  const layout: Record<string, LayoutNode> = {};

  rounds.forEach((round, colIdx) => {
    const setsInRound = roundGroups[round];
    setsInRound.sort(
      (a, b) => parseMatchFromTypeId(a.id) - parseMatchFromTypeId(b.id)
    );

    const n = setsInRound.length;
    const spacing = availableHeight / (maxMatches + 1);

    // Compute total height of this round’s matches
    const totalHeight = (n - 1) * spacing;

    // Align this round vertically centered around centerY
    const startY = centerY - totalHeight / 2;

    setsInRound.forEach((set, i) => {
      const x = colIdx * COLUMN_WIDTH + xOffset;
      const y = startY + i * spacing;

      const names = set.slots
        .map((s: any) => s?.entrant?.name || "")
        .filter(Boolean)
        .map((name: string) => {
          const parts = name.split("|").map((s) => s.trim());
          const gamertag = parts.length > 1 ? parts[1] : parts[0];
          return gamertag.length > 16 ? gamertag.slice(0, 16) + "…" : gamertag;
        });

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
        round_name: set.fullRoundText,
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

  // First find references for logic
  const grandFinal = json.data.phase.sets.find(
    (s: any) => s.fullRoundText === "Grand Final"
  );
  const losersFinal = json.data.phase.sets.find(
    (s: any) => s.fullRoundText === "Losers Final"
  );

  // Now process sets
  json.data.phase.sets.forEach((set: BracketSet) => {
    if (set.fullRoundText === "Grand Final Reset") {
      if (
        grandFinal &&
        losersFinal &&
        grandFinal.winnerId != null &&
        losersFinal.winnerId != null &&
        grandFinal.winnerId === losersFinal.winnerId
      ) {
        // Only include the reset if the loser’s bracket winner actually won GF1
        set.round += 1;
        set.id = `preview_141414_${set.round}_0`;
        allSets.push(set);
      }
    } else {
      allSets.push(set);
    }
  });
  console.log(allSets);

  // --- Winners / Losers split ---
  const winnersSets = allSets.filter((s) => s.round >= 0);
  const losersSets = allSets.filter((s) => s.round < 0);

  const winnerLayout = buildLayout(winnersSets, 0, 0, window.innerHeight);
  const loserLayout = buildLayout(losersSets, 0, 0, window.innerHeight);

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
