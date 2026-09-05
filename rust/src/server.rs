//! Port of src/server.js — the bounded agent surface. The server never
//! creates or widens authority (G15): episode and authority are
//! human-transacted before it starts.

use crate::denials_text::describe_denial;
use crate::evaluators::run_evaluator;
use crate::extract::{compute_file_map_digest, extract_dependencies};
use crate::kernel::{
    admit_effect, episode_status, evaluate, record_observed_effect, require_trusted_projection,
    resolve_applicable_context, validate_episode_closure, DenialCode, Effect, EvaluateArgs,
    KraddleError, KResult, Record, ResolverArgs, RunOutcome, TransactOptions, Workspace,
};
use crate::mcp::{McpServer, Tool, ToolHandler, ToolResult};
use crate::repo::{read_repo_files, read_worktree_files};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub const SERVER_INFO: (&str, &str) = ("kraddle-agent-surface", "0.1.0");

fn profile_role_records<'a>(state: &'a crate::kernel::State, profile_id: &str, role: &str) -> Vec<&'a Record> {
    let mut out = Vec::new();
    for relationship in state.relationships.values() {
        if relationship.str_field("profileId") != Some(profile_id)
            || relationship.str_field("role") != Some(role)
        {
            continue;
        }
        let target = match relationship.str_field("targetType") {
            Some("unit") => state.units.get(relationship.str_field("targetId").unwrap_or("")),
            Some("commitment") => state.commitments.get(relationship.str_field("targetId").unwrap_or("")),
            Some("scope") => state.scopes.get(relationship.str_field("targetId").unwrap_or("")),
            Some("evidence") => state.evidence.get(relationship.str_field("targetId").unwrap_or("")),
            _ => None,
        };
        if let Some(target) = target {
            out.push(target);
        }
    }
    out
}

fn episode_authority_unit<'a>(state: &'a crate::kernel::State, episode_id: &str) -> Option<&'a Record> {
    for relationship in state.relationships.values() {
        if relationship.str_field("profileId") == Some(episode_id)
            && relationship.str_field("role") == Some("authority_grant")
        {
            return state.units.get(relationship.str_field("targetId")?);
        }
    }
    None
}

/// Port of validateToolPath: repo-relative POSIX paths only.
fn validate_tool_path(path: &str) -> KResult<()> {
    if path.is_empty() {
        return Err(KraddleError::control(
            DenialCode::EnvelopeInvalid,
            json!({ "path": path, "reason": "invalid_path" }),
        ));
    }
    // Node's path.isAbsolute on win32: drive-prefixed, leading / or \.
    let is_absolute =
        path.starts_with('/') || path.starts_with('\\') || PathBuf::from(path).is_absolute();
    if is_absolute || path.contains('\\') || path.split('/').any(|segment| segment == "..") {
        return Err(KraddleError::control(
            DenialCode::EnvelopeInvalid,
            json!({ "path": path, "reason": "path_escape" }),
        ));
    }
    Ok(())
}

fn tool_result(result: KResult<ToolResult>) -> ToolResult {
    match result {
        Ok(tool_result) => tool_result,
        Err(KraddleError::Control { code, detail }) => {
            ToolResult::error(describe_denial(code.as_str(), &detail))
        }
        Err(other) => ToolResult::error(other.to_string()),
    }
}

fn extractor_rel(record_id: &str, profile_id: &str, role: &str, target_id: &str, target_type: &str, at: u64) -> Record {
    let mut record = Record::human_at(record_id, "relationship", at);
    record.origin = "extractor".into();
    record.epistemic_basis = "derived".into();
    record.approval_state = "proposed".into();
    record.set_field("profileId", json!(profile_id));
    record.set_field("role", json!(role));
    record.set_field("targetId", json!(target_id));
    record.set_field("targetType", json!(target_type));
    record
}

fn extractor_commitment(id: &str, value: Value, at: u64) -> Record {
    let mut record = Record::human_at(id, "commitment", at);
    record.origin = "extractor".into();
    record.epistemic_basis = "derived".into();
    record.approval_state = "proposed".into();
    record.set_field("value", value);
    record
}

pub struct ServerCore {
    pub workspace: Workspace,
    pub episode_id: String,
    pub repo_dir: PathBuf,
    pub base_evidence_id: String,
    pub base_files: BTreeMap<String, String>,
    pub base_revision: String,
    pub worktree_base: BTreeMap<String, String>,
    pub trusted: bool,
    pub admitted_writes: Mutex<BTreeMap<String, String>>,
}

pub struct KraddleServer {
    pub core: Arc<ServerCore>,
    pub mcp: McpServer,
}

impl KraddleServer {
    /// Drive one tool directly (the in-process test surface).
    pub fn call_tool(&self, name: &str, args: &Value) -> ToolResult {
        let tool = self
            .mcp
            .tools_iter()
            .find(|tool| tool.name == name)
            .unwrap_or_else(|| panic!("unknown tool {}", name));
        (tool.handler)(args)
    }
}

fn persist_episode_activity(core: &ServerCore) -> KResult<()> {
    let live = core
        .workspace
        .state()
        .units
        .get(&core.episode_id)
        .cloned()
        .expect("episode exists");
    let admitted = live
        .field("admittedEffects")
        .and_then(|f| f.as_array())
        .cloned()
        .unwrap_or_default();
    let observed = live
        .field("observedEffects")
        .and_then(|f| f.as_array())
        .cloned()
        .unwrap_or_default();
    let has_effects = !admitted.is_empty() || !observed.is_empty();
    let whitelisted_admitted: Vec<Value> = admitted
        .iter()
        .map(|entry| {
            json!({
                "admissionId": entry.get("admissionId").cloned().unwrap_or(Value::Null),
                "admittedAt": entry.get("admittedAt").cloned().unwrap_or(Value::Null),
                "operation": entry.get("operation").cloned().unwrap_or(Value::Null),
                "target": entry.get("target").cloned().unwrap_or(Value::Null),
            })
        })
        .collect();
    let whitelisted_observed: Vec<Value> = observed
        .iter()
        .map(|entry| {
            json!({
                "admissionId": entry.get("admissionId").cloned().unwrap_or(Value::Null),
                "observedAt": entry.get("observedAt").cloned().unwrap_or(Value::Null),
                "operation": entry.get("operation").cloned().unwrap_or(Value::Null),
                "target": entry.get("target").cloned().unwrap_or(Value::Null),
            })
        })
        .collect();
    let mut updated = live.clone();
    if has_effects {
        updated.set_field("noOp", json!(false));
    }
    updated.set_field("admittedEffects", json!(whitelisted_admitted));
    updated.set_field("observedEffects", json!(whitelisted_observed));
    core.workspace.transact(
        &[json!({ "type": "unit.update", "value": updated.to_json() })],
        &TransactOptions { actor_id: "policy-closure".into(), ..Default::default() },
    )?;
    Ok(())
}

fn preflight(core: &ServerCore, path: &str, content: &str) -> KResult<()> {
    let state = core.workspace.state();
    let mut proposed_map = core.base_files.clone();
    proposed_map.insert(path.to_string(), content.to_string());
    let accepted_bindings: Vec<String> = state
        .units
        .values()
        .filter(|unit| unit.kind == "control_binding" && unit.approval_state == "accepted")
        .map(|unit| unit.id.clone())
        .collect();
    let resolver = resolve_applicable_context(
        &state,
        &ResolverArgs {
            task_scope_id: None,
            target_paths: vec![path.to_string()],
            revision: Some(&core.base_revision),
            declared_applicable: accepted_bindings,
            dependency_evidence_id: Some(&core.base_evidence_id),
        },
    );
    if !resolver.complete {
        return Err(KraddleError::control(
            DenialCode::PreflightUnknown,
            json!({ "path": path, "reasons": resolver.incomplete_reasons }),
        ));
    }
    for binding_id in &resolver.applicable {
        let Some(evaluator_unit) = profile_role_records(&state, binding_id, "evaluator").into_iter().next() else {
            continue;
        };
        let governed = profile_role_records(&state, binding_id, "governed_commitment").into_iter().next();
        let outcome = run_evaluator(evaluator_unit, &proposed_map);
        if outcome.result == "violated" {
            return Err(KraddleError::control(
                DenialCode::PreflightViolated,
                json!({
                    "path": path,
                    "bindingId": binding_id,
                    "commitment": governed.and_then(|g| g.field("value").cloned()).unwrap_or(Value::Null),
                }),
            ));
        }
        if outcome.result != "satisfied" {
            return Err(KraddleError::control(
                DenialCode::PreflightUnknown,
                json!({
                    "path": path,
                    "bindingId": binding_id,
                    "reason": outcome.reason.clone().unwrap_or(outcome.result.clone()),
                }),
            ));
        }
    }
    Ok(())
}

fn read_file_handler(core: Arc<ServerCore>) -> ToolHandler {
    Arc::new(move |args| {
        tool_result((|| -> KResult<ToolResult> {
            require_trusted_projection(core.trusted, &[])?;
            let path = args.get("path").and_then(|p| p.as_str()).unwrap_or("");
            validate_tool_path(path)?;
            core.workspace.with_state_mut(|state| {
                admit_effect(state, &core.episode_id, &Effect { operation: "read".into(), target: Some(path.to_string()) })
            })?;
            let Some(content) = core.base_files.get(path) else {
                return Err(KraddleError::control(
                    DenialCode::EnvelopeInvalid,
                    json!({ "path": path, "reason": "file_not_in_base_state" }),
                ));
            };
            Ok(ToolResult::ok(content.clone()))
        })())
    })
}

fn write_file_handler(core: Arc<ServerCore>) -> ToolHandler {
    Arc::new(move |args| {
        tool_result((|| -> KResult<ToolResult> {
            require_trusted_projection(core.trusted, &[])?;
            let path = args.get("path").and_then(|p| p.as_str()).unwrap_or("");
            validate_tool_path(path)?;
            let content = args.get("content").and_then(|c| c.as_str()).map(str::to_string);
            let Some(content) = content else {
                return Err(KraddleError::control(
                    DenialCode::EnvelopeInvalid,
                    json!({ "path": path, "reason": "content_required" }),
                ));
            };
            preflight(&core, path, &content)?;
            let admission = core.workspace.with_state_mut(|state| {
                admit_effect(state, &core.episode_id, &Effect { operation: "write".into(), target: Some(path.to_string()) })
            })?;
            let full_path = core.repo_dir.join(path.replace('/', std::path::MAIN_SEPARATOR_STR));
            if let Some(parent) = full_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&full_path, &content)?;
            core.workspace.with_state_mut(|state| {
                record_observed_effect(
                    state,
                    &core.episode_id,
                    &json!({
                        "operation": "write",
                        "target": path,
                        "admissionId": admission.admission_id,
                    }),
                )
            })?;
            core.admitted_writes
                .lock()
                .expect("admitted writes lock")
                .insert(path.to_string(), content);
            persist_episode_activity(&core)?;
            Ok(ToolResult::ok(format!("admitted {} under admission {}", path, admission.admission_id)))
        })())
    })
}

fn close_episode_handler(core: Arc<ServerCore>) -> ToolHandler {
    Arc::new(move |_args| {
        tool_result((|| -> KResult<ToolResult> {
            require_trusted_projection(core.trusted, &[])?;
            let current = read_worktree_files(&core.repo_dir)?;
            let expected_files = {
                let admitted = core.admitted_writes.lock().expect("admitted writes lock");
                let mut expected = core.worktree_base.clone();
                for (path, content) in admitted.iter() {
                    expected.insert(path.clone(), content.clone());
                }
                expected
            };
            let mut unadmitted: Vec<String> = Vec::new();
            for path in expected_files.keys().chain(current.files.keys()) {
                if expected_files.get(path) != current.files.get(path) && !unadmitted.contains(path) {
                    unadmitted.push(path.clone());
                }
            }
            unadmitted.sort();
            if !unadmitted.is_empty() {
                return Err(KraddleError::control(
                    DenialCode::UncontrolledEffect,
                    json!({ "episodeId": core.episode_id, "paths": unadmitted }),
                ));
            }
            let current_files = current.files;

            let live_episode = core
                .workspace
                .state()
                .units
                .get(&core.episode_id)
                .cloned()
                .expect("episode exists");
            let base_ref = live_episode.field("baseStateRef").cloned().unwrap_or(json!({}));
            let worktree_state_ref = json!({
                "repository": base_ref.get("repository").cloned().unwrap_or(Value::Null),
                "revision": format!("{}+worktree", base_ref.get("revision").and_then(|r| r.as_str()).unwrap_or("")),
                "contentDigest": compute_file_map_digest(&current_files),
            });

            let now = crate::kernel::now_millis();
            let evidence_id = format!("EV-RESULT-{}", now);
            let extraction = extract_dependencies(&current_files);
            let scoped_edges: Vec<Value> = extraction
                .edges
                .iter()
                .filter(|edge| {
                    edge.get("from")
                        .and_then(|f| f.as_str())
                        .map(|from| from.starts_with("src/"))
                        .unwrap_or(false)
                })
                .cloned()
                .collect();
            let mut evidence = Record::human_at(&evidence_id, "evidence", now);
            evidence.origin = "extractor".into();
            evidence.epistemic_basis = "observed".into();
            evidence.set_field("stateRef", worktree_state_ref.clone());
            evidence.set_field("edges", json!(scoped_edges));
            evidence.set_field("extractionScope", json!({ "fromPrefixes": ["src/"] }));
            core.workspace.transact(
                &[json!({ "type": "evidence.create", "value": evidence.to_json() })],
                &TransactOptions { actor_id: "policy-closure".into(), ..Default::default() },
            )?;

            let state = core.workspace.state();
            let accepted_bindings: Vec<String> = state
                .units
                .values()
                .filter(|unit| unit.kind == "control_binding" && unit.approval_state == "accepted")
                .map(|unit| unit.id.clone())
                .collect();
            let target_paths: Vec<String> = current_files
                .keys()
                .filter(|path| path.starts_with("src/"))
                .cloned()
                .collect();
            let resolver = resolve_applicable_context(
                &state,
                &ResolverArgs {
                    task_scope_id: None,
                    target_paths,
                    revision: Some(worktree_state_ref.get("revision").and_then(|r| r.as_str()).unwrap_or("")),
                    declared_applicable: accepted_bindings,
                    dependency_evidence_id: Some(&evidence_id),
                },
            );
            if !resolver.complete {
                return Err(KraddleError::control(
                    DenialCode::ContextIncomplete,
                    json!({ "episodeId": core.episode_id, "reasons": resolver.incomplete_reasons }),
                ));
            }

            let mut operations: Vec<Value> = Vec::new();
            let mut evaluation_ids: Vec<String> = Vec::new();
            for binding_id in &resolver.applicable {
                let Some(evaluator_unit) = profile_role_records(&state, binding_id, "evaluator").into_iter().next() else {
                    continue;
                };
                let governed = profile_role_records(&state, binding_id, "governed_commitment").into_iter().next();
                let scope = profile_role_records(&state, &core.episode_id, "target_scope").into_iter().next();
                let evaluation_id = format!("EV-CLOSURE-{}", binding_id);
                let evaluator_id = evaluator_unit.id.clone();
                let run_unit = evaluator_unit.clone();
                let files_for_run = current_files.clone();
                let evaluation = evaluate(
                    &EvaluateArgs {
                        evaluation_id: &evaluation_id,
                        evaluator_id: &evaluator_id,
                        evaluator_version: "0.1.0",
                        subjects: Some(
                            current_files
                                .keys()
                                .filter(|path| path.starts_with("src/"))
                                .cloned()
                                .collect::<Vec<String>>(),
                        ),
                        state_ref: Some(worktree_state_ref.clone()),
                    },
                    move |_| {
                        let outcome = run_evaluator(&run_unit, &files_for_run);
                        Ok(RunOutcome { result: outcome.result, coverage: outcome.coverage })
                    },
                );
                evaluation_ids.push(evaluation_id.clone());
                let result_value = evaluation.str_field("result").unwrap_or_default().to_string();
                operations.push(json!({ "type": "unit.create", "value": evaluation.to_json() }));
                operations.push(json!({ "type": "commitment.create", "value": extractor_commitment(&format!("{}-result", evaluation_id), json!(result_value), now).to_json() }));
                operations.push(json!({ "type": "commitment.create", "value": extractor_commitment(&format!("{}-coverage", evaluation_id), json!("typed"), now).to_json() }));
                let mut selector = Record::human_at(&format!("{}-sel", evaluation_id), "selector", now);
                selector.origin = "extractor".into();
                selector.epistemic_basis = "derived".into();
                selector.approval_state = "proposed".into();
                operations.push(json!({ "type": "unit.create", "value": selector.to_json() }));
                operations.push(json!({ "type": "relationship.add", "value": extractor_rel(&format!("{}-r1", evaluation_id), &evaluation_id, "target_commitment", governed.map(|g| g.id.clone()).unwrap_or_default().as_str(), "commitment", now).to_json() }));
                operations.push(json!({ "type": "relationship.add", "value": extractor_rel(&format!("{}-r2", evaluation_id), &evaluation_id, "target_selector", &format!("{}-sel", evaluation_id), "unit", now).to_json() }));
                operations.push(json!({ "type": "relationship.add", "value": extractor_rel(&format!("{}-r3", evaluation_id), &evaluation_id, "source_scope", scope.map(|s| s.id.clone()).unwrap_or_default().as_str(), "scope", now).to_json() }));
                operations.push(json!({ "type": "relationship.add", "value": extractor_rel(&format!("{}-r4", evaluation_id), &evaluation_id, "evaluator", &evaluator_id, "unit", now).to_json() }));
                operations.push(json!({ "type": "relationship.add", "value": extractor_rel(&format!("{}-r5", evaluation_id), &evaluation_id, "result", &format!("{}-result", evaluation_id), "commitment", now).to_json() }));
                operations.push(json!({ "type": "relationship.add", "value": extractor_rel(&format!("{}-r6", evaluation_id), &evaluation_id, "coverage", &format!("{}-coverage", evaluation_id), "commitment", now).to_json() }));
                operations.push(json!({ "type": "relationship.add", "value": extractor_rel(&format!("{}-r7", evaluation_id), &core.episode_id, "proof_obligation", &evaluation_id, "unit", now).to_json() }));
            }

            let episode_now = core
                .workspace
                .state()
                .units
                .get(&core.episode_id)
                .cloned()
                .expect("episode exists");
            let mut updated = episode_now;
            updated.set_field("resultingStateRef", worktree_state_ref.clone());
            operations.push(json!({ "type": "unit.update", "value": updated.to_json() }));
            core.workspace.transact(
                &operations,
                &TransactOptions {
                    actor_id: "policy-closure".into(),
                    profile_ids: evaluation_ids,
                    ..Default::default()
                },
            )?;

            validate_episode_closure(&core.workspace.state(), &core.episode_id)?;
            Ok(ToolResult::ok(format!(
                "episode {} closed; resulting contentDigest {}",
                core.episode_id,
                worktree_state_ref.get("contentDigest").and_then(|d| d.as_str()).unwrap_or("")
            )))
        })())
    })
}

pub struct ServerConfig {
    pub repo_dir: PathBuf,
    pub workspace_dir: PathBuf,
    pub episode_id: String,
    pub base_evidence_id: String,
}

/// Port of createKraddleServer: startup validation chain, base digest pin,
/// the three tools (read/write/close — nothing else, G15).
pub fn create_kraddle_server(config: &ServerConfig) -> KResult<KraddleServer> {
    let workspace = Workspace::new(&config.workspace_dir);
    let load_result = workspace.load()?;
    require_trusted_projection(load_result.trusted, &load_result.quarantined)?;
    let state = workspace.state();

    let episode = state.units.get(&config.episode_id);
    let valid_episode = episode.map(|e| e.kind == "execution_episode").unwrap_or(false);
    if !valid_episode {
        return Err(KraddleError::control(
            DenialCode::EnvelopeInvalid,
            json!({ "episodeId": config.episode_id, "reason": "episode_missing" }),
        ));
    }
    let episode = episode.unwrap().clone();
    if episode_status(&state, &config.episode_id).ok().as_deref() == Some("suspended") {
        return Err(KraddleError::control(DenialCode::AuthorityRevoked, json!({ "episodeId": config.episode_id })));
    }
    let authority = episode_authority_unit(&state, &config.episode_id);
    let Some(authority) = authority else {
        return Err(KraddleError::control(
            DenialCode::AuthorityMissingOperations,
            json!({ "episodeId": config.episode_id }),
        ));
    };
    if authority.bool_field("revoked") == Some(true) {
        return Err(KraddleError::control(DenialCode::AuthorityRevoked, json!({ "episodeId": config.episode_id })));
    }
    if let Some(expires_at) = authority.num_field("expiresAt") {
        if expires_at <= crate::kernel::now_millis() as f64 {
            return Err(KraddleError::control(DenialCode::AuthorityExpired, json!({ "episodeId": config.episode_id })));
        }
    }
    // A restarted server must not silently fork episode state: the
    // admission ledger is persisted, so an already-active episode is
    // refused here.
    let admitted_count = episode
        .field("admittedEffects")
        .and_then(|f| f.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    if admitted_count > 0 {
        return Err(KraddleError::control(
            DenialCode::EpisodeAlreadyActive,
            json!({ "episodeId": config.episode_id, "admittedCount": admitted_count }),
        ));
    }

    let base_files = read_repo_files(&config.repo_dir)?.files;
    let base_digest = compute_file_map_digest(&base_files);
    let expected_digest = episode
        .field("baseStateRef")
        .and_then(|r| r.get("contentDigest"))
        .and_then(|d| d.as_str())
        .map(str::to_string);
    if expected_digest.as_deref() != Some(base_digest.as_str()) {
        return Err(KraddleError::control(
            DenialCode::EvidencePinMismatch,
            json!({
                "episodeId": config.episode_id,
                "expected": expected_digest.unwrap_or_default(),
                "actual": base_digest,
            }),
        ));
    }
    let worktree_base = read_worktree_files(&config.repo_dir)?.files;
    let base_revision = episode
        .field("baseStateRef")
        .and_then(|r| r.get("revision"))
        .and_then(|r| r.as_str())
        .unwrap_or("")
        .to_string();

    let core = Arc::new(ServerCore {
        workspace,
        episode_id: config.episode_id.clone(),
        repo_dir: config.repo_dir.clone(),
        base_evidence_id: config.base_evidence_id.clone(),
        base_files,
        base_revision,
        worktree_base,
        trusted: load_result.trusted,
        admitted_writes: Mutex::new(BTreeMap::new()),
    });

    let read_tool = Tool {
        name: "kraddle_read_file".into(),
        description: "Read a file from the governed repository, admitted through the episode authority.".into(),
        input_schema: json!({
            "type": "object",
            "properties": { "path": { "type": "string" } },
            "required": ["path"],
        }),
        handler: read_file_handler(Arc::clone(&core)),
    };
    let write_tool = Tool {
        name: "kraddle_write_file".into(),
        description: "Write a file inside the episode authority, after preflight of governing architecture rules.".into(),
        input_schema: json!({
            "type": "object",
            "properties": { "path": { "type": "string" }, "content": { "type": "string" } },
            "required": ["path", "content"],
        }),
        handler: write_file_handler(Arc::clone(&core)),
    };
    let close_tool = Tool {
        name: "kraddle_close_episode".into(),
        description: "Request closure of the episode; unadmitted working-tree changes are refused.".into(),
        input_schema: json!({ "type": "object", "properties": {} }),
        handler: close_episode_handler(Arc::clone(&core)),
    };

    let mcp = McpServer::new(
        vec![read_tool, write_tool, close_tool],
        json!({ "name": SERVER_INFO.0, "version": SERVER_INFO.1 }),
    );
    Ok(KraddleServer { core, mcp })
}

/// The server binary entry point (D6: two threads, serialized handling).
pub fn main() -> i32 {
    let repo_dir = std::env::var("KRADDLE_REPO").unwrap_or_default();
    let workspace_dir = std::env::var("KRADDLE_WORKSPACE_DIR").unwrap_or_default();
    let episode_id = std::env::var("KRADDLE_EPISODE_ID").unwrap_or_default();
    if repo_dir.is_empty() || workspace_dir.is_empty() || episode_id.is_empty() {
        eprintln!("kraddle server requires KRADDLE_REPO, KRADDLE_WORKSPACE_DIR, KRADDLE_EPISODE_ID");
        return 1;
    }
    let config = ServerConfig {
        repo_dir: PathBuf::from(&repo_dir),
        workspace_dir: PathBuf::from(&workspace_dir),
        episode_id,
        base_evidence_id: std::env::var("KRADDLE_BASE_EVIDENCE_ID").unwrap_or_default(),
    };
    let server = match create_kraddle_server(&config) {
        Ok(server) => Arc::new(server),
        Err(err) => {
            eprintln!("{}", err);
            return 1;
        }
    };

    use std::io::{BufRead, Write};
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    let writer_server = Arc::clone(&server);
    let writer = std::thread::spawn(move || {
        let serialize = Mutex::new(());
        let stdout = std::io::stdout();
        for line in rx {
            let _guard = serialize.lock().expect("server lock poisoned");
            if let Some(response) = writer_server.mcp.handle_message(&line) {
                let mut out = stdout.lock();
                let _ = writeln!(out, "{}", response);
                let _ = out.flush();
            }
        }
    });
    let stdin = std::io::stdin();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        if tx.send(line).is_err() {
            break;
        }
    }
    drop(tx);
    let _ = writer.join();
    0
}
