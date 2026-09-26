//! Plain-language, CODE-first denial text: "<CODE> — <plain sentence>".

use serde_json::Value;

fn safe(value: Option<&Value>) -> String {
    match value {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(text)) => text.clone(),
        Some(Value::Number(number)) => number.to_string(),
        Some(Value::Bool(flag)) => flag.to_string(),
        // Node's String(array) joins elements with ","; String(object) is
        // "[object Object]". Never exercised beyond flat string arrays.
        Some(Value::Array(list)) => list
            .iter()
            .map(|item| match item {
                Value::String(text) => text.clone(),
                other => other.to_string(),
            })
            .collect::<Vec<String>>()
            .join(","),
        Some(Value::Object(_)) => "[object Object]".to_string(),
    }
}

fn safe_list(value: Option<&Value>) -> String {
    match value {
        Some(Value::Array(list)) => list
            .iter()
            .map(|item| match item {
                Value::String(text) => text.clone(),
                other => other.to_string(),
            })
            .collect::<Vec<String>>()
            .join(", "),
        Some(Value::String(text)) => text.clone(),
        None | Some(Value::Null) => String::new(),
        Some(other) => other.to_string(),
    }
}

/// describe_denial: "<CODE> — <plain language>", never throws.
pub fn describe_denial(code: &str, detail: &Value) -> String {
    let get = |key: &str| detail.get(key);
    match code {
        "PREFLIGHT_VIOLATED" => format!(
            "PREFLIGHT_VIOLATED — this write breaks your rule '{}'. Nothing was written.",
            safe(get("commitment"))
        ),
        "PREFLIGHT_UNKNOWN" => "PREFLIGHT_UNKNOWN — this write could not be verified: the check did not run or could not decide. Writes stay denied when checks cannot run.".to_string(),
        "TARGET_OUTSIDE_AUTHORITY" => format!(
            "TARGET_OUTSIDE_AUTHORITY — {} is outside where this session may write ({}). Nothing was written.",
            safe(get("target")),
            safe(get("targetPrefix"))
        ),
        "UNCONTROLLED_EFFECT" => format!(
            "UNCONTROLLED_EFFECT — changes outside the allowed tool were found in the working tree: {}. Undo them or ask for a wider session; the session cannot finish while these are unaccounted for.",
            safe_list(get("paths"))
        ),
        "AUTHORITY_REVOKED" => "AUTHORITY_REVOKED — permission to act in this session was revoked; nothing more is allowed.".to_string(),
        "AUTHORITY_EXPIRED" => "AUTHORITY_EXPIRED — permission to act in this session has expired; nothing more is allowed.".to_string(),
        "AUTHORITY_MISSING_OPERATIONS" => "AUTHORITY_MISSING_OPERATIONS — this session lists no allowed operations, so nothing is permitted. Ask the human who started it to fix the permission.".to_string(),
        "SELF_AMENDMENT_DENIED" => "SELF_AMENDMENT_DENIED — rules cannot be changed from inside a session. Propose the change to a human instead.".to_string(),
        "PROFILE_GRAFT_DENIED" => format!(
            "PROFILE_GRAFT_DENIED — membership of {} cannot be changed from inside the session. Rule changes go through the human channel.",
            safe(get("profileId"))
        ),
        "CONTEXT_INCOMPLETE" => format!(
            "CONTEXT_INCOMPLETE — the picture is incomplete: {}. These must be resolved before the session can proceed.",
            safe_list(get("reasons"))
        ),
        "EPISODE_ALREADY_ACTIVE" => format!(
            "EPISODE_ALREADY_ACTIVE — this session already has {} allowed change(s) from an earlier run; restarting would fork its history. Start a new session instead.",
            safe(get("admittedCount"))
        ),
        "EVIDENCE_PIN_MISMATCH" => "EVIDENCE_PIN_MISMATCH — the proof is missing, not accepted, or pinned to a different revision than the one being governed.".to_string(),
        "EVIDENCE_SCOPE_MISMATCH" => "EVIDENCE_SCOPE_MISMATCH — the proof's contents do not match the region it declares, so it cannot be trusted.".to_string(),
        "EPISODE_NOT_ACTIVE" => format!(
            "EPISODE_NOT_ACTIVE — the session is not active ({}); nothing is allowed.",
            safe(get("lifecycle"))
        ),
        "EPISODE_OUTCOME_MISSING" => "EPISODE_OUTCOME_MISSING — the session has no recorded outcome and cannot finish.".to_string(),
        "NO_OP_NOT_DECLARED" => "NO_OP_NOT_DECLARED — a session that made no changes must say so before it can finish.".to_string(),
        "WORKSPACE_EXISTS" => "WORKSPACE_EXISTS — a .kraddle/ workspace already exists here; it was left untouched.".to_string(),
        other => format!("{} — (no description yet)", other),
    }
}
