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

interface SetFullResponse {
  id: number;
  displayScore?: string;
  fullRoundText?: string;
  totalGames?: number;
  phaseGroup?: {
    phase?: {
      name?: string;
    };
  };
  slots?: {
    entrant?: {
      name?: string;
      participants?: { gamerTag?: string }[];
    };
    standing?: {
      placement?: number;
      stats?: {
        score?: {
          label?: string;
          value?: string;
        };
      };
    };
  }[];
}

let lastActiveSetId: number | null = null;
let lastSetData: SetFullResponse | null = null;

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

async function getSetFull(setId: number): Promise<SetFullResponse | null> {
  const res = await fetch(`${BASE_URL}/set/${setId}`);
  if (!res.ok) return null;
  return await res.json();
}

async function updateOverlay(): Promise<void> {
  try {
    const setId = await getStreamQueue();
    if (setId !== null) {
      lastActiveSetId = setId;
      const setData = await getSetFull(setId);
      console.log(setData);
      if (setData) {
        lastSetData = setData;
      }
    }

    if (!lastSetData) {
      document.getElementById("player1")!.textContent = "";
      document.getElementById("player2")!.textContent = "";
      document.getElementById("score")!.textContent = "No Active Set";
      return;
    }

    const slots = lastSetData.slots || [];
    const player1 = slots[0]?.entrant?.name ?? "Player 1";
    const player2 = slots[1]?.entrant?.name ?? "Player 2";

    const score1 = slots[0]?.standing?.stats?.score?.value ?? "0";
    const score2 = slots[1]?.standing?.stats?.score?.value ?? "0";

    const totalGames = lastSetData.totalGames ?? 5;
    const bestOf = `Best of ${totalGames}`;

    document.getElementById("player1")!.textContent = player1;
    document.getElementById("player2")!.textContent = player2;
    document.getElementById("score1")!.textContent = score1;
    document.getElementById("score2")!.textContent = score2;
    document.getElementById("bestof")!.textContent = bestOf;
  } catch (err) {
    console.error("Error updating overlay:", err);
  }
}

// Refresh every 10 seconds
setInterval(updateOverlay, 3000);

updateOverlay();
