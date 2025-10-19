use axum::{
    routing::get, Router, routing::get_service
};
use dotenvy::dotenv;
mod api;
use crate::api::tournaments::get_tournament_handler;
use crate::api::streams::{
    stream_queue_handler,
};
use crate::api::set::set_details_handler;
use tower_http::services::ServeDir;
use tower_http::cors::{CorsLayer, Any};
use std::time::Duration;

#[tokio::main]
async fn main() {
    // Load environment variables from .env
    dotenv().ok();

    // Build the Axum app
    let app = Router::new()
        .route("/tournament/{slug}/stream_queue", get(stream_queue_handler))
        .route("/tournament/{slug}/stream_queue/", get(stream_queue_handler))
        .route("/tournament/{slug}", get(get_tournament_handler))
        .route("/tournament/{slug}/", get(get_tournament_handler))
        .route("/set/{id}", get(set_details_handler))
        .route("/set/{id}/", get(set_details_handler))
        .fallback_service(get_service(ServeDir::new("static")))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)          // allow any origin
                .allow_methods(Any)         // allow GET, POST, etc.
                .allow_headers(Any)
                .max_age(Duration::from_secs(3600)),
        );

    // run our app with hyper, listening globally on port 3000
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
