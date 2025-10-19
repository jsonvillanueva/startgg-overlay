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


pub async fn stream_queue_handler(Path(slug): Path<String>) -> impl IntoResponse {
    match get_stream_queue(&slug).await {
        Ok(resp) => Json(resp).into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Error fetching stream queue: {:?}", err),
        ).into_response(),
    }
}