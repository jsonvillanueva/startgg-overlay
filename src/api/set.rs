use axum::{extract::Path, http::StatusCode, response::{IntoResponse, Json}};
use serde::{Deserialize, Serialize};
use reqwest::Client;
use std::env;

#[derive(Serialize, Deserialize, Debug)]
pub struct SetFullResponse {
    pub data: Option<SetFullData>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SetFullData {
    pub set: Option<SetFull>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SetFull {
    pub id: u64,
    pub display_score: Option<String>,
    pub full_round_text: Option<String>,
    pub start_at: Option<u64>,
    pub completed_at: Option<u64>,
    pub round: Option<i32>,
    pub total_games: Option<u64>,
    pub phase_group: Option<PhaseGroup>,
    pub slots: Option<Vec<SetSlot>>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PhaseGroup {
    pub id: u64,
    pub phase: Option<Phase>,
    pub display_identifier: Option<String>, // <- add this
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Phase {
    pub name: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SetSlot {
    pub entrant: Option<Entrant>,
    pub standing: Option<Standing>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Entrant {
    pub id: u64,
    pub name: Option<String>,
    pub participants: Option<Vec<Participant>>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Participant {
    pub id: u64,
    pub gamer_tag: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Standing {
    pub placement: Option<u64>,
    pub stats: Option<StandingStats>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct StandingStats {
    pub score: Option<ScoreValue>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ScoreValue {
    pub label: Option<String>,
    pub value: Option<u64>,
}


pub async fn get_set_full(set_id: u64) -> anyhow::Result<Option<SetFull>> {
    let api_token = env::var("STARTGG_TOKEN")?;
    let client = Client::new();

    let query = r#"
        query GetSetFull($setId: ID!) {
          set(id: $setId) {
            id
            displayScore
            fullRoundText
            startAt
            completedAt
            round
            totalGames
            phaseGroup {
              id
              displayIdentifier
              phase {
                name
              }
            }
            slots {
              entrant {
                id
                name
                participants {
                  id
                  gamerTag
                }
              }
              standing {
                placement
                stats {
                  score {
                    label
                    value
                  }
                }
              }
            }
          }
        }
    "#;

    let variables = serde_json::json!({ "setId": set_id });

    let res = client
        .post("https://api.start.gg/gql/alpha")
        .bearer_auth(api_token)
        .json(&serde_json::json!({
            "query": query,
            "variables": variables
        }))
        .send()
        .await?;

    let json: serde_json::Value = res.json().await?;
    println!("DEBUG FULL SET RESPONSE: {}", json);

    if json["data"]["set"].is_null() {
        return Ok(None);
    }

    let parsed: SetFull = serde_json::from_value(json["data"]["set"].clone())?;
    Ok(Some(parsed))
}


pub async fn set_details_handler(Path(set_id): Path<u64>) -> impl IntoResponse {
    match get_set_full(set_id).await {
        Ok(Some(details)) => Json(details).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            format!("No set found with id {}", set_id),
        )
        .into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to fetch set details: {:?}", err),
        )
        .into_response(),
    }
}