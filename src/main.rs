use axum::{
    routing::get, Router
};
use dotenvy::dotenv;
mod api;
use crate::api::{streams::stream_queue_handler, tournaments::get_tournament_handler};
use crate::api::streams::{set_entrants_handler, set_scores_handler};

#[tokio::main]
async fn main() {
    // Load environment variables from .env
    dotenv().ok();

    // Build the Axum app
    let app = Router::new()
        .route("/", get(|| async {"Hello world!"})) 
        .route("/tournament/{slug}/stream_queue", get(stream_queue_handler))
        .route("/tournament/{slug}/stream_queue/", get(stream_queue_handler))
        .route("/tournament/{slug}", get(get_tournament_handler))
        .route("/tournament/{slug}/", get(get_tournament_handler))
        .route("/set/{id}/entrants", get(set_entrants_handler))
        .route("/set/{id}/entrants/", get(set_entrants_handler))
        .route("/set/{id}/scores", get(set_scores_handler))
        .route("/set/{id}/scores/", get(set_scores_handler));

    // run our app with hyper, listening globally on port 3000
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
