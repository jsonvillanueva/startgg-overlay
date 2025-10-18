use axum::{routing::get, Json, Router};
use serde::Serialize;
use std::net::SocketAddr;

#[derive(Serialize)]
struct MatchInfo {
    player1: String,
    player2: String,
    score1: i32,
    score2: i32,
}

async fn match_data() -> Json<MatchInfo> {
    let data = MatchInfo {
        player1: "JasonV".into(),
        player2: "GraySun".into(),
        score1: 2,
        score2: 1,
    };
    Json(data)
}

#[tokio::main]
async fn main() {
    let app = Router::new().route("/match", get(match_data));

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("Server running at http://{}/match", addr);

    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}
