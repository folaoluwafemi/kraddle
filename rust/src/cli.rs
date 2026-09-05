//! Port of src/cli.js â€” the HUMAN channel (G18): the trust root that
//! transacts bindings, evidence, episodes, and authority. Never an MCP
//! tool; the server never invokes it. Hand-rolled argv parsing (D7).

use crate::evaluators::architecture_rule_evaluator;
use crate::extract::{compute_file_map_digest, extract_dependencies};
use crate::kernel::{
    episode_status, resolve_applicable_context, validate_profile, KraddleError, Record,
    ResolverArgs, TransactOptions, Workspace,
};
use crate::repo::{git_state_ref, read_repo_files};
use serde_json::{json, Value};
use std::collections::BTreeMap;

fn rel_value(record_id: &str, profile_id: &str, role: &str, target_id: &str, target_type: &str, at: u64) -> Value {
    Record::human_at(record_id, "relationship", at)
        .with("profileId", json!(profile_id))
        .with("role", json!(role))
        .with("targetId", json!(target_id))
        .with("targetType", json!(target_type))
        .to_json()
}

pub const USAGE: &str = "kraddle â€” semantic control runtime (human channel)

usage:
  kraddle init [--repo <dir>]                     create the .kraddle workspace
  kraddle rule add --repo <dir> --source <prefix> --forbid <prefix> [--forbid <prefix>...]
                  --text \"<commitment sentence>\"  declare a governing rule
  kraddle episode start --repo <dir> --task \"<purpose>\" --write-prefix <prefix> [--read-only]
                                                  launch an episode and print server env vars
  kraddle status [--repo <dir>]                   list rules and episodes
  kraddle episode abort <id> [--repo <dir>]       abort an episode
  kraddle help                                    this text

defaults: --repo is the current working directory.
The CLI is the human trust root; the agent only ever sees the MCP server.";

pub struct CliResult {
    pub code: i32,
    pub output: String,
}

fn fail(message: String) -> CliResult {
    CliResult { code: 1, output: format!("{}\n\n{}", message, USAGE) }
}

fn fail_no_usage(message: String) -> CliResult {
    CliResult { code: 1, output: format!("{}\n(run \"kraddle help\" for usage)", message) }
}

fn ok(output: String) -> CliResult {
    CliResult { code: 0, output }
}

#[derive(Default)]
struct Parsed {
    flags: BTreeMap<String, Value>,
    positional: Vec<String>,
}

fn parse_args(argv: &[String]) -> Parsed {
    let mut parsed = Parsed::default();
    let mut index = 0;
    while index < argv.len() {
        let token = &argv[index];
        if token.starts_with("--") {
            let name = token[2..].to_string();
            let next = argv.get(index + 1);
            match next {
                Some(next) if !next.starts_with("--") => {
                    parsed.flags.insert(name, json!(next));
                    index += 1;
                }
                _ => {
                    parsed.flags.insert(name, json!(true));
                }
            }
        } else {
            parsed.positional.push(token.clone());
        }
        index += 1;
    }
    parsed
}

fn collect_repeatable(argv: &[String], name: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut index = 0;
    while index < argv.len() {
        if argv[index] == format!("--{}", name) {
            if let Some(next) = argv.get(index + 1) {
                values.push(next.clone());
                index += 1;
            }
        }
        index += 1;
    }
    values
}

fn normalize_prefix(prefix: &str) -> String {
    if prefix.is_empty() {
        prefix.to_string()
    } else if prefix.ends_with('/') {
        prefix.to_string()
    } else {
        format!("{}/", prefix)
    }
}

fn join_human(dir: &str, child: &str) -> String {
    let sep = if dir.contains('\\') { "\\" } else { "/" };
    format!("{}{}{}", dir.trim_end_matches(['\\', '/']), sep, child)
}

fn message_of(error: &KraddleError) -> String {
    error.to_string()
}

fn flag_str<'a>(parsed: &'a Parsed, key: &str) -> Option<&'a str> {
    parsed.flags.get(key).and_then(|v| v.as_str())
}

fn random_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()[..8].to_string()
}

fn load_workspace_or_fail(repo: &str, fail_with_usage: bool) -> Result<(Workspace, crate::kernel::LoadResult), CliResult> {
    let workspace = Workspace::new(repo);
    let load_result = workspace.load();
    let load_result = match load_result {
        Ok(result) => result,
        Err(_) => {
            let message = format!(
                "no workspace found at {} â€” run \"kraddle init\" first.",
                join_human(repo, ".kraddle")
            );
            return Err(if fail_with_usage { fail(message) } else { fail_no_usage(message) });
        }
    };
    if !load_result.trusted {
        let codes: Vec<&str> = load_result.quarantined
            .iter()
            .filter_map(|q| q.get("code").and_then(|c| c.as_str()))
            .collect();
        let message = format!(
            "the workspace at {} is quarantined ({}).",
            join_human(repo, ".kraddle"),
            codes.join(", ")
        );
        return Err(if fail_with_usage { fail(message) } else { fail_no_usage(message) });
    }
    Ok((workspace, load_result))
}

fn command_init(parsed: &Parsed, repo: String) -> CliResult {
    let workspace = Workspace::new(&repo);
    match workspace.init() {
        Ok(_) => ok(format!(
            "initialized workspace at {}\nit governs the repository at {}",
            join_human(&repo, ".kraddle"),
            repo
        )),
        Err(KraddleError::Control { code, .. }) if code == crate::kernel::DenialCode::WorkspaceExists => {
            fail(format!(
                "WORKSPACE_EXISTS â€” a workspace already exists at {}; it was left untouched. To reopen it, just run a status or start a server against it.",
                join_human(&repo, ".kraddle")
            ))
        }
        Err(err) => fail(format!("init failed: {}", message_of(&err))),
    }
}

fn command_rule_add(parsed: &Parsed, raw_argv: &[String], repo: String) -> CliResult {
    let text = flag_str(parsed, "text").unwrap_or("").trim().to_string();
    if text.is_empty() {
        return fail("rule add requires --text with the commitment sentence a human would say.".into());
    }
    let source = normalize_prefix(flag_str(parsed, "source").unwrap_or(""));
    if source.is_empty() {
        return fail("rule add requires --source, the path prefix the rule governs (e.g. src/domain).".into());
    }
    let forbids: Vec<String> = collect_repeatable(raw_argv, "forbid")
        .iter()
        .map(|prefix| normalize_prefix(prefix))
        .collect();
    if forbids.is_empty() {
        return fail("rule add requires at least one --forbid prefix (e.g. src/ui).".into());
    }
    if let Some(forbidden) = forbids.iter().find(|forbid| source.starts_with(forbid.as_str())) {
        return fail(format!(
            "unsatisfiable rule: the source prefix \"{}\" itself falls under the forbidden prefix \"{}\". A rule cannot govern a tree it also forbids.",
            source, forbidden
        ));
    }

    let files = match read_repo_files(std::path::Path::new(&repo)) {
        Ok(walk) => walk.files,
        Err(err) => {
            return fail_no_usage(format!(
                "rule add could not read the repository at {}: {}",
                repo,
                message_of(&err)
            ));
        }
    };
    let git = match git_state_ref(std::path::Path::new(&repo)) {
        Ok(git) => git,
        Err(err) => {
            return fail_no_usage(format!(
                "rule add could not read the repository at {}: {}",
                repo,
                message_of(&err)
            ));
        }
    };
    let state_ref = json!({
        "repository": git.repository,
        "revision": git.revision,
        "contentDigest": compute_file_map_digest(&files),
    });
    let extraction = extract_dependencies(&files);
    let scoped_edges: Vec<Value> = extraction
        .edges
        .iter()
        .filter(|edge| {
            edge.get("from")
                .and_then(|f| f.as_str())
                .map(|from| from.starts_with(&source))
                .unwrap_or(false)
        })
        .cloned()
        .collect();
    let source_files: Vec<&String> = files.keys().filter(|path| path.starts_with(&source)).collect();
    if source_files.is_empty() {
        let mut candidates: Vec<String> = files
            .keys()
            .map(|path| format!("{}/", path.split('/').next().unwrap_or("")))
            .collect();
        candidates.sort();
        candidates.dedup();
        candidates.retain(|prefix| files.keys().any(|path| path.starts_with(prefix.as_str())));
        return fail(format!(
            "no source files found under \"{}\" â€” the rule would govern nothing.\n  prefixes that exist in this repo: {}\n  pick a --source that contains files.",
            source,
            if candidates.is_empty() { "(none)".to_string() } else { candidates.join("  ") }
        ));
    }

    let (workspace, _) = match load_workspace_or_fail(&repo, false) {
        Ok(loaded) => loaded,
        Err(failure) => return failure,
    };

    let binding_id = format!("CB-{}", random_id());
    let evidence_id = format!("EV-{}", random_id());
    let commitment_id = format!("C-{}", random_id());
    let selector_id = format!("S-{}", random_id());
    let modality_id = format!("M-{}", random_id());
    let evaluator_id = format!("EVAL-{}", random_id());
    let scope_id = format!("SC-{}", random_id());
    let now = crate::kernel::now_millis();

    let human = |id: &str, kind: &str| Record::human_at(id, kind, now);
    let mut evaluator = human(&evaluator_id, "evaluator");
    evaluator.set_field("evaluatorType", json!("architecture_rule"));
    evaluator.set_field("params", json!({ "sourcePrefix": source, "forbiddenPrefixes": forbids }));
    let mut governed = human(&commitment_id, "commitment");
    governed.set_field("value", json!(text));
    governed.set_field("forbiddenPathPrefixes", json!(forbids));
    let mut selector = human(&selector_id, "commitment");
    selector.set_field("value", json!({ "type": "path_prefix", "value": source }));
    let mut modality = human(&modality_id, "commitment");
    modality.set_field("value", json!("prohibition"));
    let mut evidence = human(&evidence_id, "evidence");
    evidence.origin = "extractor".into();
    evidence.epistemic_basis = "observed".into();
    evidence.set_field("stateRef", state_ref);
    evidence.set_field("edges", json!(scoped_edges));
    evidence.set_field("extractionScope", json!({ "fromPrefixes": [source] }));

    let operations = vec![
        json!({ "type": "scope.create", "value": human(&scope_id, "scope").to_json() }),
        json!({ "type": "unit.create", "value": evaluator.to_json() }),
        json!({ "type": "commitment.create", "value": governed.to_json() }),
        json!({ "type": "commitment.create", "value": selector.to_json() }),
        json!({ "type": "commitment.create", "value": modality.to_json() }),
        json!({ "type": "unit.create", "value": human(&binding_id, "control_binding").to_json() }),
        json!({ "type": "relationship.add", "value": rel_value(&format!("{}-r1", binding_id), &binding_id, "governed_commitment", &commitment_id, "commitment", now) }),
        json!({ "type": "relationship.add", "value": rel_value(&format!("{}-r2", binding_id), &binding_id, "subject_selector", &selector_id, "commitment", now) }),
        json!({ "type": "relationship.add", "value": rel_value(&format!("{}-r3", binding_id), &binding_id, "modality", &modality_id, "commitment", now) }),
        json!({ "type": "relationship.add", "value": rel_value(&format!("{}-r4", binding_id), &binding_id, "evaluator", &evaluator_id, "unit", now) }),
        json!({ "type": "evidence.create", "value": evidence.to_json() }),
    ];

    if let Err(err) = workspace.transact(
        &operations,
        &TransactOptions { profile_ids: vec![binding_id.clone()], ..Default::default() },
    ) {
        return fail(format!("rule add failed: {}", message_of(&err)));
    }
    if let Err(err) = validate_profile(&workspace.state(), &binding_id) {
        return fail(format!("rule add failed: {}", message_of(&err)));
    }

    ok(format!(
        "rule added.\nbinding {}\ngoverns \"{}\" over {} (forbids {})\npinned to revision {}\nevidence {}",
        binding_id,
        text,
        source,
        forbids.join(", "),
        git.revision,
        evidence_id
    ))
}

fn explain_reason(code: &str) -> String {
    match code {
        "OMITTED_APPLICABLE_COMMITMENT" => "OMITTED_APPLICABLE_COMMITMENT â€” a governing rule applies to this repository but was not counted; declare it with rule add.".into(),
        "UNRESOLVED_SELECTOR" => "UNRESOLVED_SELECTOR â€” a rule uses a selector this runtime cannot evaluate.".into(),
        "UNRESOLVED_DEPENDENCY_EDGE" => "UNRESOLVED_DEPENDENCY_EDGE â€” the dependency evidence contains an import that could not be resolved statically.".into(),
        "EVIDENCE_PIN_MISMATCH" => "EVIDENCE_PIN_MISMATCH â€” the dependency evidence is missing, not accepted, or pinned to a different revision.".into(),
        "EVIDENCE_SCOPE_MISMATCH" => "EVIDENCE_SCOPE_MISMATCH â€” the evidence record's contents do not match the extraction region it declares.".into(),
        other => format!("{} â€” (no description yet)", other),
    }
}

fn command_episode_start(parsed: &Parsed, repo: String) -> CliResult {
    let task = flag_str(parsed, "task").unwrap_or("").trim().to_string();
    if task.is_empty() {
        return fail("episode start requires --task describing what the episode is for.".into());
    }
    let write_prefix = normalize_prefix(flag_str(parsed, "write-prefix").unwrap_or(""));
    if write_prefix.is_empty() {
        return fail("episode start requires --write-prefix, the path prefix writes are bounded to (e.g. src/domain).".into());
    }
    let read_only = parsed.flags.get("read-only") == Some(&json!(true));

    let files = match read_repo_files(std::path::Path::new(&repo)) {
        Ok(walk) => walk.files,
        Err(err) => return fail(format!("episode start could not read the repository at {}: {}", repo, message_of(&err))),
    };
    let git = match git_state_ref(std::path::Path::new(&repo)) {
        Ok(git) => git,
        Err(err) => return fail(format!("episode start could not read the repository at {}: {}", repo, message_of(&err))),
    };
    let state_ref = json!({
        "repository": git.repository,
        "revision": git.revision,
        "contentDigest": compute_file_map_digest(&files),
    });
    let extraction = extract_dependencies(&files);
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

    let (workspace, _) = match load_workspace_or_fail(&repo, true) {
        Ok(loaded) => loaded,
        Err(failure) => return failure,
    };

    let now = crate::kernel::now_millis();
    let evidence_id = format!("EV-{}", random_id());
    let mut evidence = Record::human_at(&evidence_id, "evidence", now);
    evidence.origin = "extractor".into();
    evidence.epistemic_basis = "observed".into();
    evidence.set_field("stateRef", state_ref.clone());
    evidence.set_field("edges", json!(scoped_edges));
    evidence.set_field("extractionScope", json!({ "fromPrefixes": ["src/"] }));
    if let Err(err) = workspace.transact(
        &[json!({ "type": "evidence.create", "value": evidence.to_json() })],
        &TransactOptions::default(),
    ) {
        return fail(format!("episode start failed while recording base evidence: {}", message_of(&err)));
    }

    let state = workspace.state();
    let accepted_bindings: Vec<String> = state
        .units
        .values()
        .filter(|unit| unit.kind == "control_binding" && unit.approval_state == "accepted")
        .map(|unit| unit.id.clone())
        .collect();
    let target_paths: Vec<String> = files
        .keys()
        .filter(|path| path.starts_with("src/"))
        .cloned()
        .collect();
    let resolver = resolve_applicable_context(
        &state,
        &ResolverArgs {
            task_scope_id: None,
            target_paths,
            revision: Some(&git.revision),
            declared_applicable: accepted_bindings,
            dependency_evidence_id: Some(&evidence_id),
        },
    );
    if !resolver.complete {
        let explanations: Vec<String> = resolver
            .incomplete_reasons
            .iter()
            .map(|reason| explain_reason(reason))
            .collect();
        return fail_no_usage(format!(
            "episode start refused: the governing context is incomplete, so an episode cannot launch honestly.\n  {}",
            explanations.join("\n  ")
        ));
    }

    let episode_id = format!("EP-{}", random_id());
    let purpose_id = format!("EP-{}-purpose", random_id());
    let base_id = format!("EP-{}-base", random_id());
    let outcome_id = format!("EP-{}-outcome", random_id());
    let context_id = format!("EP-{}-ctx", random_id());
    let authority_id = format!("EP-{}-auth", random_id());
    let delta_id = format!("EP-{}-delta", random_id());
    let scope_id = format!("SC-{}", random_id());

    let human = |id: &str, kind: &str| Record::human_at(id, kind, now);
    let mut ctx = human(&context_id, "context_envelope");
    ctx.set_field("valid", json!(true));
    ctx.set_field("completeness", json!("complete"));
    ctx.set_field("complete", json!(resolver.complete));
    ctx.set_field("incompleteReasons", json!(resolver.incomplete_reasons));
    let mut authority = human(&authority_id, "authority_grant");
    authority.set_field("operations", if read_only { json!(["read"]) } else { json!(["read", "write"]) });
    authority.set_field("targetPrefix", json!(write_prefix));
    authority.set_field("allowRecordIds", json!([]));
    let mut episode = human(&episode_id, "execution_episode");
    episode.set_field("lifecycle", json!("authorized"));
    episode.set_field("baseStateRef", state_ref.clone());
    episode.set_field("resultingStateRef", state_ref.clone());
    episode.set_field("noOp", json!(true));

    let mut purpose = human(&purpose_id, "commitment");
    purpose.set_field("value", json!(task));
    let mut base = human(&base_id, "commitment");
    base.set_field("value", json!(git.revision));
    let mut outcome = human(&outcome_id, "commitment");
    outcome.set_field("value", json!("completed under governing commitments"));

    let operations = vec![
        json!({ "type": "commitment.create", "value": purpose.to_json() }),
        json!({ "type": "commitment.create", "value": base.to_json() }),
        json!({ "type": "commitment.create", "value": outcome.to_json() }),
        json!({ "type": "unit.create", "value": ctx.to_json() }),
        json!({ "type": "unit.create", "value": authority.to_json() }),
        json!({ "type": "unit.create", "value": human(&delta_id, "software_element").to_json() }),
        json!({ "type": "scope.create", "value": human(&scope_id, "scope").to_json() }),
        json!({ "type": "unit.create", "value": episode.to_json() }),
        json!({ "type": "relationship.add", "value": rel_value(&format!("{}-r1", episode_id), &episode_id, "purpose", &purpose_id, "commitment", now) }),
        json!({ "type": "relationship.add", "value": rel_value(&format!("{}-r2", episode_id), &episode_id, "target_scope", &scope_id, "scope", now) }),
        json!({ "type": "relationship.add", "value": rel_value(&format!("{}-r3", episode_id), &episode_id, "base_revision", &base_id, "commitment", now) }),
        json!({ "type": "relationship.add", "value": rel_value(&format!("{}-r4", episode_id), &episode_id, "context_envelope", &context_id, "unit", now) }),
        json!({ "type": "relationship.add", "value": rel_value(&format!("{}-r5", episode_id), &episode_id, "authority_grant", &authority_id, "unit", now) }),
        json!({ "type": "relationship.add", "value": rel_value(&format!("{}-r6", episode_id), &episode_id, "intended_delta", &delta_id, "unit", now) }),
        json!({ "type": "relationship.add", "value": rel_value(&format!("{}-r7", episode_id), &episode_id, "outcome", &outcome_id, "commitment", now) }),
    ];

    if let Err(err) = workspace.transact(
        &operations,
        &TransactOptions { profile_ids: vec![episode_id.clone()], ..Default::default() },
    ) {
        return fail(format!("episode start failed: {}", message_of(&err)));
    }

    ok(format!(
        "episode {} started (lifecycle authorized).\nThe agent surface refused nothing at launch: the governing context is complete.\n\nPaste these to run the MCP server (npm start):\nKRADDLE_REPO={}\nKRADDLE_WORKSPACE_DIR={}\nKRADDLE_EPISODE_ID={}\nKRADDLE_BASE_EVIDENCE_ID={}",
        episode_id,
        repo,
        repo.trim_end_matches(['\\', '/']),
        episode_id,
        evidence_id
    ))
}

fn command_status(repo: String) -> CliResult {
    let (workspace, load_result) = match load_workspace_or_fail(&repo, true) {
        Ok(loaded) => loaded,
        Err(failure) => return failure,
    };
    let mut lines: Vec<String> = Vec::new();
    let quarantine_note = if load_result.quarantined.is_empty() {
        String::new()
    } else {
        format!(", quarantined segments: {}", load_result.quarantined.len())
    };
    lines.push(format!(
        "workspace {} â€” trusted: {}{}",
        join_human(&repo, ".kraddle"),
        load_result.trusted,
        quarantine_note
    ));
    lines.push(String::new());

    let state = workspace.state();
    let bindings: Vec<&Record> = state
        .units
        .values()
        .filter(|unit| unit.kind == "control_binding")
        .collect();
    lines.push(format!("rules ({}):", bindings.len()));
    for binding in bindings {
        let governed_id = state
            .relationships
            .values()
            .find(|relationship| {
                relationship.str_field("profileId") == Some(binding.id.as_str())
                    && relationship.str_field("role") == Some("governed_commitment")
            })
            .and_then(|rel| rel.str_field("targetId").map(str::to_string));
        let text = governed_id
            .as_deref()
            .and_then(|id| state.commitments.get(id))
            .and_then(|commitment| commitment.str_field("value"));
        let shown = match text {
            Some(text) if text.chars().count() > 60 => {
                format!("{}â€¦", text.chars().take(60).collect::<String>())
            }
            Some(text) => text.to_string(),
            None => "(no commitment text)".to_string(),
        };
        lines.push(format!("  {}  \"{}\"  [{}]", binding.id, shown, binding.approval_state));
    }
    lines.push(String::new());

    let episodes: Vec<&Record> = state
        .units
        .values()
        .filter(|unit| unit.kind == "execution_episode")
        .collect();
    lines.push(format!("episodes ({}):", episodes.len()));
    for episode in episodes {
        let status = episode_status(&state, &episode.id).unwrap_or_else(|_| "unknown".into());
        let admitted = episode
            .field("admittedEffects")
            .and_then(|f| f.as_array())
            .map(|a| a.len())
            .unwrap_or(0);
        lines.push(format!("  {}  {}  admitted effects: {}", episode.id, status, admitted));
    }
    ok(lines.join("\n"))
}

fn command_episode_abort(parsed: &Parsed, repo: String) -> CliResult {
    let episode_id = parsed.positional.get(1).cloned();
    let Some(episode_id) = episode_id.filter(|id| !id.is_empty()) else {
        return fail("episode abort requires the episode id, e.g. kraddle episode abort EP-xxxx.".into());
    };
    let (workspace, _) = match load_workspace_or_fail(&repo, true) {
        Ok(loaded) => loaded,
        Err(failure) => return failure,
    };
    let episode = workspace.state().units.get(&episode_id).cloned();
    let Some(mut episode) = episode.filter(|e| e.kind == "execution_episode") else {
        return fail(format!("no episode with id {} exists in this workspace.", episode_id));
    };
    let now = crate::kernel::now_millis();
    episode.set_field("lifecycle", json!("aborted"));
    episode.origin = "human".into();
    episode.epistemic_basis = "asserted".into();
    episode.recorded_at = now;
    if let Err(err) = workspace.transact(
        &[json!({ "type": "unit.update", "value": episode.to_json() })],
        &TransactOptions::default(),
    ) {
        return fail(format!("episode abort failed: {}", message_of(&err)));
    }
    ok(format!("episode {} aborted.", episode_id))
}

/// Port of runCli: returns { code, output }; never a stack trace.
pub fn run_cli(argv: &[String], cwd: Option<&str>) -> CliResult {
    let command = argv.first().cloned();
    let rest: Vec<String> = argv.iter().skip(1).cloned().collect();
    let mut parsed = parse_args(&rest);
    let repo = match flag_str(&parsed, "repo") {
        Some(repo) => repo.to_string(),
        None => match cwd {
            Some(cwd) => cwd.to_string(),
            None => std::env::current_dir()
                .map(|dir| dir.to_string_lossy().to_string())
                .unwrap_or_else(|_| ".".into()),
        },
    };
    parsed.flags.remove("repo");

    match command.as_deref() {
        Some("init") => command_init(&parsed, repo),
        Some("rule") => {
            let subcommand = parsed.positional.first().map(String::as_str);
            if subcommand != Some("add") {
                return fail(format!(
                    "unknown rule subcommand: {} â€” try \"kraddle rule add\"",
                    subcommand.unwrap_or("(none)")
                ));
            }
            command_rule_add(&parsed, &rest, repo)
        }
        Some("episode") => {
            let subcommand = parsed.positional.first().map(String::as_str);
            match subcommand {
                Some("start") => command_episode_start(&parsed, repo),
                Some("abort") => command_episode_abort(&parsed, repo),
                other => fail(format!(
                    "unknown episode subcommand: {} â€” try \"kraddle episode start\"",
                    other.unwrap_or("(none)")
                )),
            }
        }
        Some("status") => command_status(repo),
        Some("help") => ok(USAGE.to_string()),
        None => fail("no command given.".into()),
        Some(other) => fail(format!("unknown command: {}", other)),
    }
}

/// The CLI binary entry point.
pub fn main() -> i32 {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let result = run_cli(&argv, None);
    print!("{}\n", result.output);
    result.code
}
