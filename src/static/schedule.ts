import { BASE_URL, TOURNAMENT_SLUG } from "./constants.js";

interface SetFullResponse {
  id: number;
  displayScore?: string;
  fullRoundText?: string;
  startAt?: number;
  completedAt?: number;
  totalGames?: number;
  phaseGroup?: { phase?: { name?: string }; displayIdentifier: string };
  slots?: {
    entrant?: {
      name?: string;
      participants?: { gamerTag?: string }[];
    };
  }[];
}

async function fetchStreamQueueWithDetails(): Promise<SetFullResponse[]> {
  try {
    const res = await fetch(
      `${BASE_URL}/tournament/${TOURNAMENT_SLUG}/stream_queue`
    );
    const json = await res.json();
    const queue = json.data?.tournament?.streamQueue ?? [];

    const sets: SetFullResponse[] = [];
    for (const entry of queue) {
      if (!entry.sets) continue;
      for (const s of entry.sets) {
        const detailRes = await fetch(`${BASE_URL}/set/${s.id}`);
        const detailJson = await detailRes.json();
        const data = detailJson.data?.set ?? detailJson.data ?? detailJson;
        if (data?.id) sets.push(data);
      }
    }

    return sets;
  } catch (err) {
    console.warn("Failed to fetch:", err);
    return [];
  }
}

function formatPDT(timestamp?: number): string {
  if (!timestamp) return "";
  const date = new Date(timestamp * 1000);
  return date.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

function createMatchDiv(set: SetFullResponse): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "match-entry";

  const roundEl = document.createElement("div");
  roundEl.className = "match-round";

  const roundName =
    set.fullRoundText || set.phaseGroup?.phase?.name || "Unknown Round";
  let roundText = roundName;
  if (set.phaseGroup?.displayIdentifier) {
    roundText += ` (Pool - ${set.phaseGroup.displayIdentifier})`;
  }
  roundEl.textContent = roundText;
  div.appendChild(roundEl);

  const playersEl = document.createElement("div");
  playersEl.className = "match-players";
  const players = set.slots?.map((s) => s.entrant?.name || "TBD") ?? [];
  playersEl.textContent = players.join(" vs ");
  div.appendChild(playersEl);

  if (set.completedAt) div.classList.add("completed");

  const timeEl = document.createElement("div");
  timeEl.className = "match-time";
  timeEl.textContent = set.startAt
    ? `Starts at: ${formatPDT(set.startAt)} PDT`
    : "";
  div.appendChild(timeEl);

  return div;
}

function updateCountdown(sets: SetFullResponse[]) {
  const countdownEl = document.getElementById("countdown")!;
  if (!sets.length) {
    countdownEl.textContent = "00:00";
    return;
  }

  const next = sets.find((s) => s.startAt && s.startAt * 1000 > Date.now());
  if (!next || !next.startAt) {
    countdownEl.textContent = "00:00";
    return;
  }

  const target = next.startAt * 1000;

  const tick = () => {
    const diff = target - Date.now();
    if (diff <= 0) {
      countdownEl.textContent = "00:00";
      return;
    }

    const mins = Math.floor(diff / (1000 * 60));
    const secs = Math.floor((diff / 1000) % 60);
    countdownEl.textContent = `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;

    requestAnimationFrame(tick);
  };

  tick();
}

let lastRemovedMatch: SetFullResponse | null = null;
let previousUpcomingCount = 0;

function getDisplayMatches(sets: SetFullResponse[]): SetFullResponse[] {
  const upcoming = sets.filter((s) => !s.completedAt);

  // Detect removed match
  if (previousUpcomingCount > upcoming.length) {
    const previousIds = new Set(sets.map((s) => s.id));
    const removed = Array.from(previousIds).find(
      (id) => !upcoming.some((s) => s.id === id)
    );
    if (removed) {
      // find removed set in last update
      lastRemovedMatch = sets.find((s) => s.id === removed) || lastRemovedMatch;
    }
  }

  previousUpcomingCount = upcoming.length;

  const display: SetFullResponse[] = [];

  if (lastRemovedMatch) display.push(lastRemovedMatch);
  display.push(...upcoming);

  return display.slice(0, 4);
}

function renderSchedule(sets: SetFullResponse[]) {
  const container = document.getElementById("schedule-container")!;
  container.innerHTML = "";

  if (!sets.length) {
    container.innerText = "No matches found";
    return;
  }

  sets.forEach((set) => container.appendChild(createMatchDiv(set)));

  const upcomingMatches = sets.filter((s) => !s.completedAt);
  updateCountdown(upcomingMatches);
}

async function start() {
  async function update() {
    const allSets = await fetchStreamQueueWithDetails();
    const displaySets = getDisplayMatches(allSets);
    renderSchedule(displaySets);
  }

  await update(); // initial render
  setInterval(update, 15000); // refresh every 15s
}

window.addEventListener("DOMContentLoaded", start);
