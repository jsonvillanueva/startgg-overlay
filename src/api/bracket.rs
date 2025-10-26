use axum::{extract::Path, response::IntoResponse, Json};
use reqwest::Client;
use serde_json::json;
use std::env;

/// Handler for GET /bracket/:phase_id
pub async fn bracket_handler(Path(phase_id): Path<u64>) -> impl IntoResponse {
    let api_key = env::var("STARTGG_TOKEN").expect("Missing STARTGG_TOKEN env var");
    let client = Client::new();

    // STEP 1 — Fetch all phase group IDs
    let group_query = json!({
        "query": format!(
            r#"
            {{
                phase(id: {}) {{
                    phaseGroups {{
                        nodes {{
                            id
                            displayIdentifier
                        }}
                    }}
                }}
            }}
            "#,
            phase_id
        )
    });

    let group_res = match client
        .post("https://api.start.gg/gql/alpha")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&group_query)
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => return Json(json!({"error": "Failed to fetch phase groups"})),
    };

    let group_json: serde_json::Value = match group_res.json().await {
        Ok(j) => j,
        Err(_) => return Json(json!({"error": "Failed to parse phase groups"})),
    };

    let Some(groups) = group_json["data"]["phase"]["phaseGroups"]["nodes"].as_array() else {
        return Json(json!({"error": "No phase groups found"}));
    };

    // STEP 2 — Fetch sets per group, paginated
    let mut all_sets = vec![];
    let per_page = 50;

    for group in groups {
        let group_id = group["id"].as_u64().unwrap_or_default();
        let group_name = group["displayIdentifier"].as_str().unwrap_or_default();
        let mut page = 1;

        loop {
            let query = json!({
                "query": format!(
                    r#"
                    {{
                        phaseGroup(id: {}) {{
                            id
                            displayIdentifier
                            sets(page: {}, perPage: {}) {{
                                nodes {{
                                    id
                                    round
                                    fullRoundText
                                    winnerId
                                    displayScore(mainEntrantId: null)
                                    slots(includeByes: true) {{
                                        entrant {{
                                            id
                                            name
                                        }}
                                    }}
                                    startAt
                                    vodUrl
                                    totalGames
                                    entrant1Source {{ type typeId }}
                                    entrant2Source {{ type typeId }}
                                }}
                            }}
                        }}
                    }}
                    "#,
                    group_id,
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

            let Ok(response) = res else {
                return Json(json!({"error": "Failed to fetch sets"}));
            };

            let json: serde_json::Value = match response.json().await {
                Ok(j) => j,
                Err(_) => {
                    return Json(json!({
                        "error": "Failed to parse JSON for sets"
                    }));
                }
            };

            // Extract sets
            let sets = json["data"]["phaseGroup"]["sets"]["nodes"]
                .as_array()
                .cloned()
                .unwrap_or_default();

            let count = sets.len();
            println!(
                "Fetched {} sets from group {} (page {})",
                count, group_name, page
            );

            for mut set in sets {
                // Inject group info into the set
                if let Some(obj) = set.as_object_mut() {
                    obj.insert("phaseGroupId".to_string(), json!(group_id));
                    obj.insert("displayIdentifier".to_string(), json!(group_name));
                }
                all_sets.push(set);
            }


            if count < per_page {
                break; // last page
            }

            page += 1;
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
    }

    Json(json!({ "data": { "sets": all_sets } }))
}