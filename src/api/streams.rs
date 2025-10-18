use axum::{extract::Path, http::StatusCode, response::{IntoResponse, Json}};
use serde::{Deserialize, Serialize};
use reqwest::Client;
use std::env;

#[derive(Serialize, Deserialize, Debug)]
pub struct StreamQueueResponse {
    pub data: Option<TournamentData>,
    pub errors: Option<Vec<serde_json::Value>>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TournamentData {
    pub tournament: Option<Tournament>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Tournament {
    pub id: u64,
    pub stream_queue: Option<Vec<StreamEntry>>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct StreamEntry {
    pub stream: StreamInfo,
    pub sets: Option<Vec<SetInfo>>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StreamInfo {
    pub stream_source: String,
    pub stream_name: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SetInfo {
    pub id: u64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SetEntrantsResponse {
    pub data: SetEntrantsData,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SetEntrantsData {
    pub set: SetEntrantsSet,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SetEntrantsSet {
    pub id: u64,
    pub slots: Vec<SetEntrantSlot>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SetEntrantSlot {
    pub id: u64,
    pub entrant: Option<Entrant>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Entrant {
    pub id: u64,
    pub name: String,
    pub participants: Vec<Participant>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Participant {
    pub id: u64,
    pub gamer_tag: String,
}


#[derive(Serialize, Deserialize, Debug)]
pub struct SetScoresResponse {
    pub data: SetScoresData,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SetScoresData {
    pub set: SetScoresSet,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SetScoresSet {
    pub id: u64,
    pub slots: Vec<SetScoreSlot>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SetScoreSlot {
    pub id: u64,
    pub standing: Option<Standing>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Standing {
    pub id: u64,
    pub placement: Option<u64>,
    pub stats: Option<StandingStats>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct StandingStats {
    pub score: Option<ScoreValue>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ScoreValue {
    pub label: String,
    pub value: String,
}

pub async fn get_stream_queue(slug: &str) -> anyhow::Result<StreamQueueResponse> {
    let api_token = env::var("STARTGG_TOKEN")?;
    let client = Client::new();

    let query = r#"
        query StreamQueueOnTournament($tourneySlug: String!) {
            tournament(slug: $tourneySlug) {
                id
                streamQueue {
                    stream {
                        streamSource
                        streamName
                    }
                    sets {
                        id
                    }
                }
            }
        }
    "#;

    let variables = serde_json::json!({ "tourneySlug": slug });

    let res = client
        .post("https://api.start.gg/gql/alpha")
        .bearer_auth(api_token)
        .json(&serde_json::json!({
            "query": query,
            "variables": variables
        }))
        .send()
        .await?;

    let json: StreamQueueResponse = res.json().await?;
    Ok(json)
}

pub async fn get_set_entrants(set_id: u64) -> anyhow::Result<serde_json::Value> {
    let api_token = env::var("STARTGG_TOKEN")?;
    let client = Client::new();

    let query = r#"
        query SetEntrants($setId: ID!) {
            set(id: $setId) {
                id
                slots {
                    entrant {
                        id
                        name
                        participants {
                            id
                            gamerTag
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
    Ok(json)
}

pub async fn get_set_scores(set_id: u64) -> anyhow::Result<serde_json::Value> {
    let api_token = env::var("STARTGG_TOKEN")?;
    let client = Client::new();

    let query = r#"
        query SetScores($setId: ID!) {
            set(id: $setId) {
                id
                slots {
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
    Ok(json)
}


pub async fn stream_queue_handler(Path(slug): Path<String>) -> impl IntoResponse {
    match get_stream_queue(&slug).await {
        Ok(resp) => Json(resp).into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Error fetching stream queue: {:?}", err),
        ).into_response(),
    }
}

pub async fn set_entrants_handler(Path(id): Path<u64>) -> impl IntoResponse {
    match get_set_entrants(id).await {
        Ok(resp) => Json(resp).into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Error fetching set entrants: {:?}", err),
        )
            .into_response(),
    }
}

pub async fn set_scores_handler(Path(id): Path<u64>) -> impl IntoResponse {
    match get_set_scores(id).await {
        Ok(resp) => Json(resp).into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Error fetching set scores: {:?}", err),
        )
            .into_response(),
    }
}