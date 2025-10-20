import { BASE_URL, PHASE_ID } from "./constants.js";

async function fetchBracket() {
  const res = await fetch(`${BASE_URL}/bracket/${PHASE_ID}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function renderBracket(json: any) {
  const bracketContainer = document.getElementById("bracket")!;
  bracketContainer.innerHTML = "";

  // Winners bracket
  const winnersDiv = document.createElement("div");
  winnersDiv.className = "bracket-container winners-container";

  // Losers bracket
  const losersDiv = document.createElement("div");
  losersDiv.className = "bracket-container losers-container";
  const phase = json.data?.phase;
  if (!phase) {
    bracketContainer.textContent = "No bracket data.";
    return;
  }
  const winnersRoundsMap: Record<number, any[]> = {};
  const losersRoundsMap: Record<number, any[]> = {};

  phase.phaseGroups?.nodes.forEach((group: any) => {
    (group.sets?.nodes || []).forEach((set: any) => {
      const roundNum = set.round ?? 1;

      if (roundNum < 0) {
        // Losers bracket (use abs for sorting)
        const absRound = Math.abs(roundNum);
        if (!losersRoundsMap[absRound]) losersRoundsMap[absRound] = [];
        losersRoundsMap[absRound].push({ set });
      } else {
        // Winners bracket
        if (!winnersRoundsMap[roundNum]) winnersRoundsMap[roundNum] = [];
        winnersRoundsMap[roundNum].push({ set });
      }
    });
  });
  if (!phase) {
    bracketContainer.textContent = "No bracket data.";
    return;
  }
  function renderRounds(
    roundsMap: Record<number, any[]>,
    container: HTMLElement
  ) {
    const roundsContainer = document.createElement("div");
    roundsContainer.className = "bracket-container";

    const sortedRounds = Object.keys(roundsMap)
      .map(Number)
      .sort((a, b) => a - b);

    sortedRounds.forEach((roundNum) => {
      const roundDiv = document.createElement("div");
      roundDiv.className = "round-column";

      // Round header
      const firstSet = roundsMap[roundNum][0]?.set;
      const roundHeader = document.createElement("div");
      roundHeader.className = "round-header";
      roundHeader.textContent = firstSet?.fullRoundText || `Round ${roundNum}`;
      roundDiv.appendChild(roundHeader);

      // Matches
      roundsMap[roundNum].forEach(({ set }) => {
        const setDiv = document.createElement("div");
        setDiv.className = "set";

        const playersDiv = document.createElement("div");
        playersDiv.className = "players";

        const p1Div = document.createElement("div");
        const p2Div = document.createElement("div");

        p1Div.textContent = set.slots?.[0]?.entrant?.name || "TBD";
        p2Div.textContent = set.slots?.[1]?.entrant?.name || "TBD";

        if (set.winnerId) {
          if (set.slots?.[0]?.entrant?.id === set.winnerId)
            p1Div.classList.add("winner");
          else if (set.slots?.[1]?.entrant?.id === set.winnerId)
            p2Div.classList.add("winner");
        }

        playersDiv.appendChild(p1Div);
        playersDiv.appendChild(p2Div);
        setDiv.appendChild(playersDiv);

        if (set.displayScore) {
          const scoreDiv = document.createElement("div");
          scoreDiv.className = "score";
          scoreDiv.textContent = set.displayScore;
          setDiv.appendChild(scoreDiv);
        }

        roundDiv.appendChild(setDiv);
      });

      roundsContainer.appendChild(roundDiv);
    });

    container.appendChild(roundsContainer);
  }

  // Render winners first
  renderRounds(winnersRoundsMap, winnersDiv);
  // Then losers
  renderRounds(losersRoundsMap, losersDiv);

  // Append to main bracket
  bracketContainer.innerHTML = "";
  bracketContainer.appendChild(winnersDiv);
  bracketContainer.appendChild(losersDiv);
}

async function updateBracket() {
  try {
    const json = await fetchBracket();
    renderBracket(json);
  } catch (err) {
    console.error("Error updating bracket:", err);
  }
}

updateBracket();
setInterval(updateBracket, 30000);
