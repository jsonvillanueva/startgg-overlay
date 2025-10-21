use axum::{extract::Path, response::IntoResponse, Json};
use reqwest::Client;
use serde_json::json;
use std::env;

/// Handler for GET /bracket/:phase_id
pub async fn bracket_handler(Path(phase_id): Path<u64>) -> impl IntoResponse {
    // Load your Start.gg API key from environment variable
    let api_key = env::var("STARTGG_TOKEN").expect("Missing STARTGG_TOKEN env var");
    let client = Client::new();

    // GraphQL query string
    let mut all_sets = vec![];
    let mut page = 1; // Start at page 1
    let per_page = 32; // Number of sets per page

    loop {
        let query = json!({
            "query": format!(
                r#"
                {{
                phase(id: {}) {{
                    id
                    name
                    phaseGroups {{
                    nodes {{
                        id
                        displayIdentifier
                        sets(page: {}, perPage: {}) {{
                        nodes {{
                            id
                                round
                                fullRoundText
                                winnerId
                                entrant1Source {{
                                    type
                                    typeId
                                }}
                                entrant2Source {{
                                    type
                                    typeId
                                }}
                                displayScore(mainEntrantId: null)
                                slots(includeByes: true) {{
                                    entrant {{
                                        id
                                        name
                                    }}
                                }}
                                hasPlaceholder
                                startAt
                                vodUrl
                                totalGames
                                setGamesType
                                loserProgressionSeed {{ id }}
                                winnerProgressionSeed {{ id }}
                        }}
                        }}
                    }}
                    }}
                }}
                }}
                "#,
                phase_id,
                page,
                per_page
            )
        });

        let res = client
            .post("https://api.start.gg/gql/alpha")
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&query)
            .send()
            .await;

        // Handle request failure
        let Ok(response) = res else {
            return Json(json!({"error": "Failed to send request"}));
        };

        // Parse response body
        let json: serde_json::Value = match response.json().await {
            Ok(j) => j,
            Err(e) => {
                return Json(json!({
                    "error": format!("Failed to parse JSON: {}", e)
                }));
            }
        };
        println!("DEBUG BRACKET RESPONSE: {}", json);

        let mut sets_found = 0;
        if let Some(phase_groups) = json["data"]["phase"]["phaseGroups"]["nodes"].as_array() {
            for group in phase_groups {
                if let Some(sets) = group["sets"]["nodes"].as_array() {
                    sets_found += sets.len();
                    all_sets.extend(sets.clone());
                }
            }
        }

        // Stop if fewer than per_page sets were returned (last page)
        if sets_found < per_page as usize {
            break;
        }

        page += 1;
        tokio::time::sleep(std::time::Duration::from_millis(100)).await; // brief delay for rate limits
    }

    Json(json!({"data": {"phase":{"sets": all_sets}}}))
}
