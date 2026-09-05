//! Port of src/denials-text.js — human-readable, CODE-first denial text.

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

/// Port of describeDenial: "<CODE> — <plain language>", never throws.
pub fn describe_denial(code: &str, detail: &Value) -> String {
    let get = |key: &str| detail.get(key);
    match code {
        "PREFLIGHT_VIOLATED" => format!(
            "PREFLIGHT_VIOLATED — This write would violate the rule '{}' that governs this episode. The file was not written.",
            safe(get("commitment"))
        ),
        "PREFLIGHT_UNKNOWN" => "PREFLIGHT_UNKNOWN — this write could not be verified — the check did not run or could not decide; writes are denied when checks cannot run.".to_string(),
        "TARGET_OUTSIDE_AUTHORITY" => format!(
            "TARGET_OUTSIDE_AUTHORITY — the target {} is outside this episode's write bounds ({}). The file was not written.",
            safe(get("target")),
            safe(get("targetPrefix"))
        ),
        "UNCONTROLLED_EFFECT" => format!(
            "UNCONTROLLED_EFFECT — changes outside the admitted surface were found in the working tree: {}. Every change must go through the write tool, or the episode cannot close.",
            safe_list(get("paths"))
        ),
        "AUTHORITY_REVOKED" => "AUTHORITY_REVOKED — the authority grant governing this episode was revoked; no further effects are admitted.".to_string(),
        "AUTHORITY_EXPIRED" => "AUTHORITY_EXPIRED — the authority grant governing this episode has expired; no further effects are admitted.".to_string(),
        "AUTHORITY_MISSING_OPERATIONS" => "AUTHORITY_MISSING_OPERATIONS — the authority grant lists no operations; nothing is authorized. Ask the human who started the episode to fix the grant.".to_string(),
        "SELF_AMENDMENT_DENIED" => "SELF_AMENDMENT_DENIED — the rule that governs this episode cannot be changed from inside it. Propose the change to a human instead.".to_string(),
        "PROFILE_GRAFT_DENIED" => format!(
            "PROFILE_GRAFT_DENIED — members cannot be grafted onto the governing profile {} from inside the episode. Membership changes go through the human channel.",
            safe(get("profileId"))
        ),
        "CONTEXT_INCOMPLETE" => format!(
            "CONTEXT_INCOMPLETE — the governing context is incomplete: {}. The episode cannot proceed until every reason is resolved.",
            safe_list(get("reasons"))
        ),
        "EPISODE_ALREADY_ACTIVE" => format!(
            "EPISODE_ALREADY_ACTIVE — this episode already has {} admitted effect(s) from a previous server run; restarting would fork its state. Start a new episode instead.",
            safe(get("admittedCount"))
        ),
        "EVIDENCE_PIN_MISMATCH" => "EVIDENCE_PIN_MISMATCH — the dependency evidence is missing, unaccepted, or pinned to a different revision than the one being governed.".to_string(),
        "EVIDENCE_SCOPE_MISMATCH" => "EVIDENCE_SCOPE_MISMATCH — the evidence record's contents do not match the extraction region it declares; it cannot be trusted to pin a context.".to_string(),
        "EPISODE_NOT_ACTIVE" => format!(
            "EPISODE_NOT_ACTIVE — the episode is not in an active state ({}); effects are not admitted.",
            safe(get("lifecycle"))
        ),
        "EPISODE_OUTCOME_MISSING" => "EPISODE_OUTCOME_MISSING — the episode has no outcome commitment and cannot close.".to_string(),
        "NO_OP_NOT_DECLARED" => "NO_OP_NOT_DECLARED — an episode with no recorded effects must explicitly declare that it did nothing before it can close.".to_string(),
        "WORKSPACE_EXISTS" => "WORKSPACE_EXISTS — a workspace already exists here; it was left untouched.".to_string(),
        other => format!("{} — (no description yet)", other),
    }
}
