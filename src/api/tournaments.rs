use axum::{
    extract::Path,
    http::StatusCode,
    response::{IntoResponse, Json},
};
use ggapi::{get_tournament_info, GGResponse, GGID};
use serde::Serialize;

#[derive(Serialize)]
pub struct TournamentResponse {
    pub id: GGID,
    pub name: String,
    pub start_at: Option<String>,
}

pub async fn get_tournament_handler(Path(slug): Path<String>) -> impl IntoResponse {
    let api_token = std::env::var("STARTGG_TOKEN").expect("STARTGG_TOKEN must be set");

    match get_tournament_info(&slug, &api_token).await {
        GGResponse::Data(data) => {
            if let Some(tournament) = data.tournament {
                let response = TournamentResponse {
                    id: tournament.id.unwrap_or(ggapi::GGID::Int(0)),
                    name: tournament.name.unwrap_or_default(),
                    start_at: tournament.start_at.map(|ts| ts.to_string()),
                };
                Json(response).into_response()
            } else {
                (StatusCode::NOT_FOUND, format!("Tournament '{}' not found", slug)).into_response()
            }
        }
        GGResponse::Error(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to fetch tournament: {}", err),
        )
            .into_response(),
    }
}

