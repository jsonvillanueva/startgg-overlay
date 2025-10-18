use axum::{
    extract::Path, http::StatusCode, response::IntoResponse, routing::get, Json, Router
};
use ggapi::{get_tournament_info, GGResponse, GGID};
use serde::Serialize;

#[tokio::main]
async fn main() {
    // Load environment variables from .env
    dotenvy::dotenv().ok();

    // Build the Axum app
    let app = Router::new()
                        .route("/tournament/{slug}", get(get_tournament_handler))
                        .route("/", get(|| async {"Hello, world!"}));

    // run our app with hyper, listening globally on port 3000
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

#[derive(Serialize)]
struct TournamentResponse {
    id: GGID,
    name: String,
    start_at: Option<String>,
}

pub async fn get_tournament_handler(Path(slug): Path<String>) -> impl IntoResponse {
    // Load your StartGG token from environment
    let api_token = std::env::var("STARTGG_TOKEN")
        .expect("STARTGG_TOKEN must be set in .env");

    // Call ggapi
    match get_tournament_info(&slug, &api_token).await {
        GGResponse::Data(data) => {
            // Safely handle optional fields
            if let Some(tournament) = data.tournament {
                let response = TournamentResponse {
                    id: tournament.id.unwrap_or(ggapi::GGID::Int(0)), // GGID -> u64
                    name: tournament.name.unwrap_or_default(), // Option<String> -> String
                    start_at: tournament.start_at.map(|ts| ts.to_string()),
                };

                Json(response).into_response()
            } else {
                (
                    StatusCode::NOT_FOUND,
                    format!("Tournament '{}' not found", slug),
                ).into_response()
            }
        }
        GGResponse::Error(err) => {
            eprintln!("Error fetching tournament: {}", err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to fetch tournament: {}", err),
            )
                .into_response()
        }
    }
}