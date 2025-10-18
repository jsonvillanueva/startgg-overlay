const STREAM_NAME = "jsonv"; // your Twitch stream name
const TOURNAMENT_SLUG = "jsonv-s-echo-of-screams-tournament";
const BASE_URL = "http://127.0.0.1:3000";

// --- Types ---
interface StreamQueueResponse {
  data?: {
    tournament?: {
      streamQueue?: StreamEntry[];
    };
  };
}

interface StreamEntry {
  stream: {
    streamSource: string;
    streamName: string;
  };
  sets?: SetInfo[];
}

interface SetInfo {
  id: number;
}

interface SetEntrantsResponse {
  data?: {
    set?: {
      slots?: {
        entrant?: {
          name?: string;
        };
      }[];
    };
  };
}

interface SetScoresResponse {
  data?: {
    set?: {
      slots?: {
        standing?: {
          stats?: {
            score?: {
              value: number | null;
            };
          };
        };
      }[];
    };
  };
}

let lastActiveSetId: number | null = null;

// --- Functions ---
async function getStreamQueue(): Promise<number | null> {
  const res = await fetch(
    `${BASE_URL}/tournament/${TOURNAMENT_SLUG}/stream_queue`
  );
  const data: StreamQueueResponse = await res.json();

  const streams = data.data?.tournament?.streamQueue || [];
  const myStream = streams.find(
    (s) => s.stream.streamName.toLowerCase() === STREAM_NAME.toLowerCase()
  );
  const firstSet = myStream?.sets?.[0];

  return firstSet ? firstSet.id : null;
}

async function getSetEntrants(setId: number): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/set/${setId}/entrants`);
  const data: SetEntrantsResponse = await res.json();

  const slots = data.data?.set?.slots || [];
  return slots.map((slot) => slot.entrant?.name || "Unknown");
}

async function getSetScores(setId: number): Promise<number[]> {
  const res = await fetch(`${BASE_URL}/set/${setId}/scores`);
  const data: SetScoresResponse = await res.json();

  const slots = data.data?.set?.slots || [];
  return slots.map((slot) => slot.standing?.stats?.score?.value ?? 0);
}

async function updateOverlay(): Promise<void> {
  const setId = await getStreamQueue();
  if (setId !== null) {
    lastActiveSetId = setId;
  }

  if (lastActiveSetId === null) {
    document.getElementById("score")!.textContent = "Not Active";
    document.getElementById("player1")!.textContent = "";
    document.getElementById("player2")!.textContent = "";
    return;
  }

  const entrants = await getSetEntrants(lastActiveSetId);
  const scores = await getSetScores(lastActiveSetId);

  document.getElementById("player1")!.textContent = entrants[0] || "";
  document.getElementById("player2")!.textContent = entrants[1] || "";
  document.getElementById("score")!.textContent = `${scores[0]} - ${scores[1]}`;
}

// Refresh every 10 seconds
setInterval(updateOverlay, 5000);

updateOverlay();
