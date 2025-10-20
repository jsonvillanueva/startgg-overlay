use axum::{extract::Path, response::IntoResponse, Json};
use reqwest::Client;
use serde_json::json;
use std::env;

/// Handler for GET /bracket/:phase_id
pub async fn bracket_handler(Path(phase_id): Path<u64>) -> impl IntoResponse {
    // Load your Start.gg API key from environment variable
    let api_key = env::var("STARTGG_TOKEN").expect("Missing STARTGG_TOKEN env var");

    // GraphQL query string
let page = 1; // Start at page 1
let per_page = 64; // Number of sets per page

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
                    displayScore
                    winnerId
                    slots {{
                      entrant {{
                        id
                        name
                      }}
                    }}
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

    // Send the request to Start.gg
    let client = Client::new();
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

    Json(json)
}
