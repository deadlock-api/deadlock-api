use deadlock_api_rust::state::AppState;
use redis::AsyncCommands;

#[tokio::test]
async fn test_load_app_state() {
    let state = AppState::from_env().await;
    match state {
        Ok(mut state) => {
            assert!(
                state
                    .redis_client
                    .exists::<&str, bool>("health_check")
                    .await
                    .is_ok()
            );
            assert!(state.ch_client.query("SELECT 1").execute().await.is_ok());
            assert!(!state.pg_client.is_closed());
        }
        Err(e) => {
            panic!("Failed to load app state: {e}");
        }
    }
}
