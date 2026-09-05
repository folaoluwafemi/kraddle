//! Kraddle kernel — Rust port of src/kernel.js.
//! The Node implementation is the executable specification; when Rust and
//! Node disagree, Rust is wrong.

use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};

// ---------------------------------------------------------------------------
// Denial codes (R7): variant names = Node's DENIAL keys; the string form is
// byte-identical to Node's (wire compatibility).

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum DenialCode {
    EnvelopeInvalid,
    EnvelopeEnumInvalid,
    AcceptanceNotAuthorized,

    SelfAmendmentDenied,
    AuthoritySelfAmendmentDenied,
    AuthorityMissingOperations,
    AuthorityExpired,
    AuthorityRevoked,

    OperationNotAuthorized,
    OperationForbidden,
    TargetOutsideAuthority,
    MutationNotAuthorized,
    ProfileGraftDenied,

    ContextIncomplete,
    OmittedApplicableCommitment,
    UnresolvedSelector,
    UnresolvedDependencyEdge,

    EpisodeNotActive,
    EpisodeOutcomeMissing,
    UncontrolledEffect,

    EvaluationResultInvalid,
    EvaluationNotSatisfied,
    EvaluationFailedNotAPass,
    EvaluationRevisionMismatch,
    EvaluationStale,

    CoverageIncomplete,
    CoverageUnknownNonempty,
    CoverageExclusionNotPermitted,
    CoverageDigestMismatch,

    SegmentDigestMismatch,
    SegmentCommitMarkerMissing,
    ProjectionUntrusted,
    EvidencePinMismatch,
    EvidenceScopeMismatch,
    WorkspaceExists,
    NoOpNotDeclared,
    PreflightViolated,
    PreflightUnknown,
    EpisodeAlreadyActive,
}

impl DenialCode {
    pub const fn as_str(self) -> &'static str {
        match self {
            DenialCode::EnvelopeInvalid => "ENVELOPE_INVALID",
            DenialCode::EnvelopeEnumInvalid => "ENVELOPE_ENUM_INVALID",
            DenialCode::AcceptanceNotAuthorized => "ACCEPTANCE_NOT_AUTHORIZED",
            DenialCode::SelfAmendmentDenied => "SELF_AMENDMENT_DENIED",
            DenialCode::AuthoritySelfAmendmentDenied => "AUTHORITY_SELF_AMENDMENT_DENIED",
            DenialCode::AuthorityMissingOperations => "AUTHORITY_MISSING_OPERATIONS",
            DenialCode::AuthorityExpired => "AUTHORITY_EXPIRED",
            DenialCode::AuthorityRevoked => "AUTHORITY_REVOKED",
            DenialCode::OperationNotAuthorized => "OPERATION_NOT_AUTHORIZED",
            DenialCode::OperationForbidden => "OPERATION_FORBIDDEN",
            DenialCode::TargetOutsideAuthority => "TARGET_OUTSIDE_AUTHORITY",
            DenialCode::MutationNotAuthorized => "MUTATION_NOT_AUTHORIZED",
            DenialCode::ProfileGraftDenied => "PROFILE_GRAFT_DENIED",
            DenialCode::ContextIncomplete => "CONTEXT_INCOMPLETE",
            DenialCode::OmittedApplicableCommitment => "OMITTED_APPLICABLE_COMMITMENT",
            DenialCode::UnresolvedSelector => "UNRESOLVED_SELECTOR",
            DenialCode::UnresolvedDependencyEdge => "UNRESOLVED_DEPENDENCY_EDGE",
            DenialCode::EpisodeNotActive => "EPISODE_NOT_ACTIVE",
            DenialCode::EpisodeOutcomeMissing => "EPISODE_OUTCOME_MISSING",
            DenialCode::UncontrolledEffect => "UNCONTROLLED_EFFECT",
            DenialCode::EvaluationResultInvalid => "EVALUATION_RESULT_INVALID",
            DenialCode::EvaluationNotSatisfied => "EVALUATION_NOT_SATISFIED",
            DenialCode::EvaluationFailedNotAPass => "EVALUATION_FAILED_NOT_A_PASS",
            DenialCode::EvaluationRevisionMismatch => "EVALUATION_REVISION_MISMATCH",
            DenialCode::EvaluationStale => "EVALUATION_STALE",
            DenialCode::CoverageIncomplete => "COVERAGE_INCOMPLETE",
            DenialCode::CoverageUnknownNonempty => "COVERAGE_UNKNOWN_NONEMPTY",
            DenialCode::CoverageExclusionNotPermitted => "COVERAGE_EXCLUSION_NOT_PERMITTED",
            DenialCode::CoverageDigestMismatch => "COVERAGE_DIGEST_MISMATCH",
            DenialCode::SegmentDigestMismatch => "SEGMENT_DIGEST_MISMATCH",
            DenialCode::SegmentCommitMarkerMissing => "SEGMENT_COMMIT_MARKER_MISSING",
            DenialCode::ProjectionUntrusted => "PROJECTION_UNTRUSTED",
            DenialCode::EvidencePinMismatch => "EVIDENCE_PIN_MISMATCH",
            DenialCode::EvidenceScopeMismatch => "EVIDENCE_SCOPE_MISMATCH",
            DenialCode::WorkspaceExists => "WORKSPACE_EXISTS",
            DenialCode::NoOpNotDeclared => "NO_OP_NOT_DECLARED",
            DenialCode::PreflightViolated => "PREFLIGHT_VIOLATED",
            DenialCode::PreflightUnknown => "PREFLIGHT_UNKNOWN",
            DenialCode::EpisodeAlreadyActive => "EPISODE_ALREADY_ACTIVE",
        }
    }
}

impl std::fmt::Display for DenialCode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

// ---------------------------------------------------------------------------
// Error type: ControlDenial analog. Everything user-visible routes through
// denials_text::describe_denial (added in a later step), CODE-first.

#[derive(Debug)]
pub enum KraddleError {
    Control { code: DenialCode, detail: Value },
    Io(std::io::Error),
    Json(serde_json::Error),
}

impl KraddleError {
    pub fn control(code: DenialCode, detail: Value) -> Self {
        KraddleError::Control { code, detail }
    }

    pub fn code(&self) -> Option<DenialCode> {
        match self {
            KraddleError::Control { code, .. } => Some(*code),
            _ => None,
        }
    }

    pub fn detail(&self) -> Value {
        match self {
            KraddleError::Control { detail, .. } => detail.clone(),
            _ => Value::Null,
        }
    }
}

impl std::fmt::Display for KraddleError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            KraddleError::Control { code, detail } => {
                // ControlDenial's message is `${code}: ${JSON.stringify(detail)}`.
                write!(f, "{}: {}", code.as_str(), serde_json::to_string(detail).unwrap_or_default())
            }
            KraddleError::Io(err) => write!(f, "{}", err),
            KraddleError::Json(err) => write!(f, "{}", err),
        }
    }
}

impl std::error::Error for KraddleError {}

impl From<std::io::Error> for KraddleError {
    fn from(err: std::io::Error) -> Self {
        KraddleError::Io(err)
    }
}

impl From<serde_json::Error> for KraddleError {
    fn from(err: serde_json::Error) -> Self {
        KraddleError::Json(err)
    }
}

pub type KResult<T> = Result<T, KraddleError>;

// ---------------------------------------------------------------------------
// Digests (R4/D1): digests over canonical JSON — object keys sorted
// (serde_json's default BTreeMap ordering), arrays in order. Node computes
// the same via its canonicalJson() (added in the Step 0 amendment).

pub fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let out = hasher.finalize();
    let mut hex = String::with_capacity(out.len() * 2);
    for byte in out {
        hex.push_str(&format!("{:02x}", byte));
    }
    hex
}

/// Digest over the canonical serialization of a JSON value.
pub fn digest_of_value(value: &Value) -> String {
    sha256_hex(&serde_json::to_string(value).unwrap_or_default())
}

/// Canonical JSON: identical bytes to Node's canonicalJson() — serde_json's
/// default (BTreeMap) serializes object keys sorted, arrays in order.
pub fn canonical_json(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_default()
}

pub fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn new_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

// ---------------------------------------------------------------------------
// Envelope (§3.3 of the Phase 0 plan): every canonical record carries it.

pub const ENVELOPE_ENUMS: &[(&str, &[&str])] = &[
    ("origin", &["human", "extractor", "agent", "policy", "import"]),
    ("epistemic_basis", &["observed", "derived", "interpreted", "asserted"]),
    ("approval_state", &["proposed", "accepted", "rejected", "superseded"]),
    ("freshness_state", &["current", "stale", "expired"]),
];

pub const ENVELOPE_REQUIRED: &[&str] = &[
    "id",
    "kind",
    "origin",
    "epistemic_basis",
    "approval_state",
    "freshness_state",
    "recorded_at",
];

/// Port of validateEnvelope: operates on the raw JSON object so that the
/// Node semantics (undefined/null distinction, `confidence: null` being
/// present-but-invalid) are preserved exactly.
pub fn validate_envelope(record: &Value) -> KResult<()> {
    let missing: Vec<&str> = ENVELOPE_REQUIRED
        .iter()
        .filter(|field| {
            let value = record.get(**field);
            value.is_none() || matches!(value, Some(Value::Null))
        })
        .copied()
        .collect();
    if !missing.is_empty() {
        return Err(KraddleError::control(
            DenialCode::EnvelopeInvalid,
            json!({ "id": record.get("id").cloned().unwrap_or(Value::Null), "missing": missing }),
        ));
    }
    for (field, allowed) in ENVELOPE_ENUMS {
        let value = record.get(*field);
        let ok = value.and_then(|v| v.as_str()).map(|s| allowed.contains(&s)).unwrap_or(false);
        if !ok {
            return Err(KraddleError::control(
                DenialCode::EnvelopeEnumInvalid,
                json!({ "id": record.get("id").cloned().unwrap_or(Value::Null), "field": field, "value": value.cloned().unwrap_or(Value::Null) }),
            ));
        }
    }
    if let Some(confidence) = record.get("confidence") {
        let valid = confidence
            .as_f64()
            .map(|n| (0.0..=1.0).contains(&n))
            .unwrap_or(false);
        if !valid {
            return Err(KraddleError::control(
                DenialCode::EnvelopeEnumInvalid,
                json!({ "id": record.get("id").cloned().unwrap_or(Value::Null), "field": "confidence", "value": confidence.clone() }),
            ));
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Record (R6): one generic record struct — typed envelope + extra field map.
// No per-kind typed taxonomy; typed accessors only.

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Record {
    pub id: String,
    pub kind: String,
    pub origin: String,
    pub epistemic_basis: String,
    pub approval_state: String,
    pub freshness_state: String,
    pub recorded_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "scope_id")]
    pub scope_id: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Record {
    /// Human-authored record with accepted defaults (the `env()` helper of
    /// the Node test fixtures).
    pub fn human(id: &str, kind: &str) -> Self {
        Record {
            id: id.to_string(),
            kind: kind.to_string(),
            origin: "human".into(),
            epistemic_basis: "asserted".into(),
            approval_state: "accepted".into(),
            freshness_state: "current".into(),
            recorded_at: 1756771200000,
            confidence: None,
            scope_id: None,
            extra: Map::new(),
        }
    }

    pub fn human_at(id: &str, kind: &str, recorded_at: u64) -> Self {
        let mut record = Record::human(id, kind);
        record.recorded_at = recorded_at;
        record
    }

    pub fn with(mut self, key: &str, value: Value) -> Self {
        self.extra.insert(key.to_string(), value);
        self
    }

    pub fn field(&self, key: &str) -> Option<&Value> {
        self.extra.get(key)
    }

    pub fn str_field(&self, key: &str) -> Option<&str> {
        self.extra.get(key).and_then(|v| v.as_str())
    }

    pub fn bool_field(&self, key: &str) -> Option<bool> {
        self.extra.get(key).and_then(|v| v.as_bool())
    }

    pub fn num_field(&self, key: &str) -> Option<f64> {
        self.extra.get(key).and_then(|v| v.as_f64())
    }

    pub fn set_field(&mut self, key: &str, value: Value) {
        self.extra.insert(key.to_string(), value);
    }

    /// Node's record.value for commitments (string or selector object).
    pub fn value_field(&self) -> Option<&Value> {
        self.extra.get("value")
    }

    pub fn to_json(&self) -> Value {
        serde_json::to_value(self).unwrap_or(Value::Null)
    }

    pub fn from_json(value: &Value) -> KResult<Self> {
        serde_json::from_value::<Record>(value.clone())
            .map_err(|err| KraddleError::Json(err))
    }
}

// ---------------------------------------------------------------------------
// State: five BTreeMap collections (deterministic iteration, canonical
// ordering — D10).

#[derive(Debug, Default, Clone)]
pub struct State {
    pub units: std::collections::BTreeMap<String, Record>,
    pub commitments: std::collections::BTreeMap<String, Record>,
    pub relationships: std::collections::BTreeMap<String, Record>,
    pub evidence: std::collections::BTreeMap<String, Record>,
    pub scopes: std::collections::BTreeMap<String, Record>,
}

pub fn empty_state() -> State {
    State::default()
}

/// Port of applyOperation. The operation is a raw JSON object
/// `{ "type": ..., "value": ... }` exactly as in Node.
pub fn apply_operation(state: &mut State, operation: &Value) -> KResult<()> {
    let op_type = operation.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let value = operation.get("value");

    let id = value
        .and_then(|v| v.get("id"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let Some(id) = id else {
        return Err(KraddleError::control(
            DenialCode::EnvelopeInvalid,
            json!({ "type": op_type, "missing": ["id"] }),
        ));
    };

    if op_type == "unit.tombstone" {
        let Some(mut unit) = state.units.get(&id).cloned() else {
            return Err(KraddleError::control(
                DenialCode::EnvelopeInvalid,
                json!({ "type": op_type, "id": id, "reason": "unknown_record" }),
            ));
        };
        unit.set_field("tombstoned", Value::Bool(true));
        state.units.insert(id, unit);
        return Ok(());
    }

    let value = value.cloned().unwrap_or(Value::Null);
    validate_envelope(&value)?;
    let record = Record::from_json(&value)?;
    let collection = match op_type {
        "unit.create" | "unit.update" => Collection::Units,
        "commitment.create" | "commitment.update" => Collection::Commitments,
        "relationship.add" | "relationship.update" => Collection::Relationships,
        "evidence.create" | "evidence.update" => Collection::Evidence,
        "scope.create" | "scope.update" => Collection::Scopes,
        _ => {
            return Err(KraddleError::control(
                DenialCode::EnvelopeInvalid,
                json!({ "type": op_type, "reason": "unknown_operation" }),
            ));
        }
    };
    let target = match collection {
        Collection::Units => &mut state.units,
        Collection::Commitments => &mut state.commitments,
        Collection::Relationships => &mut state.relationships,
        Collection::Evidence => &mut state.evidence,
        Collection::Scopes => &mut state.scopes,
    };
    target.insert(id, record);
    Ok(())
}

enum Collection {
    Units,
    Commitments,
    Relationships,
    Evidence,
    Scopes,
}

// ---------------------------------------------------------------------------
// Profiles

const PROFILE_KINDS: &[&str] = &["control_binding", "evaluation", "execution_episode"];
const EVALUATION_RESULTS: &[&str] = &[
    "satisfied",
    "violated",
    "unknown",
    "not_applicable",
    "indeterminate",
    "evaluation_failed",
];

pub fn profile_root<'a>(state: &'a State, profile_id: &str) -> KResult<&'a Record> {
    let root = state.units.get(profile_id);
    let ok = root.map(|r| PROFILE_KINDS.contains(&r.kind.as_str())).unwrap_or(false);
    if !ok {
        return Err(KraddleError::control(
            DenialCode::EnvelopeInvalid,
            json!({ "profileId": profile_id, "reason": "unknown_profile_root" }),
        ));
    }
    Ok(root.unwrap())
}

pub fn profile_members<'a>(state: &'a State, profile_id: &str) -> Vec<&'a Record> {
    state
        .relationships
        .values()
        .filter(|edge| edge.str_field("profileId") == Some(profile_id))
        .collect()
}

pub fn relationships_for_role<'a>(state: &'a State, profile_id: &str, role: &str) -> Vec<&'a Record> {
    profile_members(state, profile_id)
        .into_iter()
        .filter(|edge| edge.str_field("role") == Some(role))
        .collect()
}

pub fn role_target<'a>(state: &'a State, edge: &Record) -> Option<&'a Record> {
    let target_id = edge.str_field("targetId")?;
    match edge.str_field("targetType")? {
        "unit" => state.units.get(target_id),
        "commitment" => state.commitments.get(target_id),
        "evidence" => state.evidence.get(target_id),
        "scope" => state.scopes.get(target_id),
        _ => None,
    }
}

fn require_role<'a>(state: &'a State, profile_id: &str, role: &str, target_type: &str, count: usize) -> KResult<Vec<&'a Record>> {
    let edges = relationships_for_role(state, profile_id, role);
    if edges.len() != count {
        return Err(KraddleError::control(
            DenialCode::EnvelopeInvalid,
            json!({ "profileId": profile_id, "role": role, "expected": count, "targetType": target_type }),
        ));
    }
    if edges
        .iter()
        .any(|edge| edge.str_field("targetType") != Some(target_type) || role_target(state, edge).is_none())
    {
        return Err(KraddleError::control(
            DenialCode::EnvelopeInvalid,
            json!({ "profileId": profile_id, "role": role, "reason": "invalid_target" }),
        ));
    }
    Ok(edges)
}

fn optional_role<'a>(state: &'a State, profile_id: &str, role: &str, target_type: &str) -> KResult<Vec<&'a Record>> {
    let edges = relationships_for_role(state, profile_id, role);
    if edges.len() > 1 {
        return Err(KraddleError::control(
            DenialCode::EnvelopeInvalid,
            json!({ "profileId": profile_id, "role": role, "expected": 1 }),
        ));
    }
    if let Some(first) = edges.first() {
        if first.str_field("targetType") != Some(target_type) || role_target(state, first).is_none() {
            return Err(KraddleError::control(
                DenialCode::EnvelopeInvalid,
                json!({ "profileId": profile_id, "role": role, "reason": "invalid_target" }),
            ));
        }
    }
    Ok(edges)
}

/// Port of validateProfile. Returns { id, kind, roles }.
pub fn validate_profile(state: &State, profile_id: &str) -> KResult<Value> {
    let root = profile_root(state, profile_id)?;
    let members = profile_members(state, profile_id);
    let mut roles: Vec<String> = Vec::new();
    for edge in &members {
        let role = edge.str_field("role").unwrap_or("").to_string();
        if !roles.contains(&role) {
            roles.push(role);
        }
        if edge.str_field("profileId") != Some(profile_id) {
            return Err(KraddleError::control(
                DenialCode::EnvelopeInvalid,
                json!({ "profileId": profile_id, "relationshipId": edge.id, "reason": "foreign_profile_member" }),
            ));
        }
        if edge.str_field("role").is_none()
            || edge.str_field("targetType").is_none()
            || role_target(state, edge).is_none()
        {
            return Err(KraddleError::control(
                DenialCode::EnvelopeInvalid,
                json!({ "profileId": profile_id, "relationshipId": edge.id, "reason": "malformed_profile_member" }),
            ));
        }
    }

    match root.kind.as_str() {
        "control_binding" => {
            require_role(state, profile_id, "governed_commitment", "commitment", 1)?;
            require_role(state, profile_id, "subject_selector", "commitment", 1)?;
            require_role(state, profile_id, "modality", "commitment", 1)?;
            optional_role(state, profile_id, "response_policy", "unit")?;
            optional_role(state, profile_id, "authority_policy", "unit")?;
            optional_role(state, profile_id, "evaluator", "unit")?;
            let modality_edge = relationships_for_role(state, profile_id, "modality").remove(0);
            let modality = role_target(state, modality_edge);
            let modality_value = modality.and_then(|m| m.str_field("value")).unwrap_or("");
            if ["invariant", "prohibition", "requirement"].contains(&modality_value) && !roles.iter().any(|r| r == "evaluator") {
                return Err(KraddleError::control(
                    DenialCode::EnvelopeInvalid,
                    json!({ "profileId": profile_id, "modality": modality_value, "reason": "blocking_modality_requires_evaluator" }),
                ));
            }
        }
        "evaluation" => {
            require_role(state, profile_id, "target_commitment", "commitment", 1)?;
            require_role(state, profile_id, "target_selector", "unit", 1)?;
            require_role(state, profile_id, "source_scope", "scope", 1)?;
            require_role(state, profile_id, "evaluator", "unit", 1)?;
            let result = require_role(state, profile_id, "result", "commitment", 1)?;
            let result_value = role_target(state, result[0])
                .and_then(|r| r.str_field("value"))
                .unwrap_or("");
            if !EVALUATION_RESULTS.contains(&result_value) {
                return Err(KraddleError::control(
                    DenialCode::EvaluationResultInvalid,
                    json!({ "profileId": profile_id, "result": result_value }),
                ));
            }
            require_role(state, profile_id, "coverage", "commitment", 1)?;
        }
        "execution_episode" => {
            require_role(state, profile_id, "purpose", "commitment", 1)?;
            require_role(state, profile_id, "target_scope", "scope", 1)?;
            require_role(state, profile_id, "base_revision", "commitment", 1)?;
            require_role(state, profile_id, "context_envelope", "unit", 1)?;
            require_role(state, profile_id, "authority_grant", "unit", 1)?;
            require_role(state, profile_id, "intended_delta", "unit", 1)?;
            optional_role(state, profile_id, "outcome", "commitment")?;
            optional_role(state, profile_id, "resulting_revision", "commitment")?;
        }
        _ => {}
    }

    Ok(json!({ "id": profile_id, "kind": root.kind, "roles": roles }))
}

pub fn profile_role<'a>(state: &'a State, profile_id: &str, role: &str, target_type: &str) -> Option<&'a Record> {
    let relationship = relationships_for_role(state, profile_id, role).into_iter().next()?;
    if relationship.str_field("targetType") != Some(target_type) {
        return None;
    }
    role_target(state, relationship)
}

pub fn profile_state(root: &Record) -> &str {
    root.str_field("lifecycle").unwrap_or("draft")
}

// ---------------------------------------------------------------------------
// Workspace: committed event segments under <root>/.kraddle/events.

use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Default)]
struct Inner {
    state: State,
    heads: Vec<String>,
    trusted: bool,
    quarantined: Vec<Value>,
}

pub struct LoadResult {
    pub state: State,
    pub heads: Vec<String>,
    pub trusted: bool,
    pub quarantined: Vec<Value>,
    pub projected_through: usize,
}

pub struct TransactOptions {
    pub profile_ids: Vec<String>,
    pub actor_id: String,
    pub episode_id: Option<String>,
}

impl Default for TransactOptions {
    fn default() -> Self {
        TransactOptions { profile_ids: Vec::new(), actor_id: "human".into(), episode_id: None }
    }
}

pub struct Workspace {
    pub root: PathBuf,
    kraddle: PathBuf,
    events: PathBuf,
    inner: Mutex<Inner>,
}

impl Workspace {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        let root = root.into();
        let kraddle = root.join(".kraddle");
        let events = kraddle.join("events");
        Workspace { root, kraddle, events, inner: Mutex::new(Inner::default()) }
    }

    /// Port of init(): refuses to overwrite an existing workspace.
    pub fn init(&self) -> KResult<Value> {
        let manifest_path = self.kraddle.join("manifest.krd");
        if manifest_path.exists() {
            return Err(KraddleError::control(
                DenialCode::WorkspaceExists,
                json!({ "root": self.root.to_string_lossy() }),
            ));
        }
        std::fs::create_dir_all(&self.events)?;
        std::fs::create_dir_all(self.kraddle.join("objects"))?;
        std::fs::create_dir_all(self.kraddle.join("indexes"))?;
        std::fs::create_dir_all(self.kraddle.join("local"))?;
        let manifest = json!({ "format": "kraddle/alpha", "workspaceId": new_uuid() });
        std::fs::write(manifest_path, format!("{}\n", canonical_json(&manifest)))?;
        std::fs::write(
            self.kraddle.join("heads.krd"),
            format!("{}\n", canonical_json(&json!({ "heads": [] }))),
        )?;
        Ok(manifest)
    }

    /// Port of load(): lexical segment order, quarantine fail-closed,
    /// stop after the first bad segment.
    pub fn load(&self) -> KResult<LoadResult> {
        let mut inner = self.inner.lock().expect("workspace lock poisoned");
        let mut files: Vec<String> = Vec::new();
        for entry in std::fs::read_dir(&self.events)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".krd") {
                files.push(name);
            }
        }
        files.sort();

        let mut state = empty_state();
        let mut heads: Vec<String> = Vec::new();
        let mut projected_through: usize = 0;
        let mut quarantine: Option<Value> = None;
        // Segments are applied in lexical segment order (sorted filename
        // order). There are no causal clocks; lexical segment order is the
        // only ordering available.
        for file in &files {
            let content = std::fs::read_to_string(self.events.join(file))?;
            let parsed = parse_segment(&content);
            let Some((operations, commit)) = parsed else {
                quarantine = Some(json!({
                    "file": file,
                    "code": DenialCode::SegmentCommitMarkerMissing.as_str(),
                    "index": projected_through,
                }));
                break;
            };
            let commit_value = commit.get("value").cloned().unwrap_or(Value::Null);
            let actual = digest_of_value(&Value::Array(operations.clone()));
            let expected = commit_value.get("operationsDigest").and_then(|d| d.as_str());
            if expected != Some(actual.as_str()) {
                quarantine = Some(json!({
                    "file": file,
                    "code": DenialCode::SegmentDigestMismatch.as_str(),
                    "index": projected_through,
                }));
                break;
            }
            for operation in &operations {
                apply_operation(&mut state, operation)?;
            }
            heads.push(
                commit_value
                    .get("transactionId")
                    .and_then(|t| t.as_str())
                    .unwrap_or_default()
                    .to_string(),
            );
            projected_through += 1;
        }

        let trusted = quarantine.is_none();
        let quarantined = match quarantine {
            Some(q) => vec![q],
            None => Vec::new(),
        };
        std::fs::write(
            self.kraddle.join("local").join("quarantine.json"),
            format!(
                "{}\n",
                serde_json::to_string_pretty(&json!({
                    "trusted": trusted,
                    "quarantined": quarantined,
                    "projectedThrough": projected_through,
                }))
                .unwrap_or_default()
            ),
        )?;

        inner.state = state.clone();
        inner.heads = heads.clone();
        inner.trusted = trusted;
        inner.quarantined = quarantined.clone();

        Ok(LoadResult { state, heads, trusted, quarantined, projected_through })
    }

    /// Port of transact(): authorized acceptance, profile validation,
    /// canonical operation digests, atomic write-temp-rename.
    pub fn transact(&self, operations: &[Value], options: &TransactOptions) -> KResult<String> {
        let mut inner = self.inner.lock().expect("workspace lock poisoned");
        if operations.is_empty() {
            return Err(KraddleError::control(
                DenialCode::EnvelopeInvalid,
                json!({ "reason": "empty_transaction" }),
            ));
        }
        if options.episode_id.is_some() {
            // Mutation authorization lands with the Step 4 port
            // (authorize_mutation), matching the Node phased build.
        }
        if options.actor_id != "human" && !options.actor_id.starts_with("policy-") {
            for operation in operations {
                let accepted = operation
                    .get("value")
                    .and_then(|v| v.get("approval_state"))
                    .and_then(|s| s.as_str())
                    == Some("accepted");
                if accepted {
                    return Err(KraddleError::control(
                        DenialCode::AcceptanceNotAuthorized,
                        json!({
                            "actorId": options.actor_id,
                            "recordId": operation.get("value").and_then(|v| v.get("id")).cloned().unwrap_or(Value::Null),
                        }),
                    ));
                }
            }
        }
        let mut next = inner.state.clone();
        for operation in operations {
            apply_operation(&mut next, operation)?;
        }
        for profile_id in &options.profile_ids {
            validate_profile(&next, profile_id)?;
        }
        let transaction_id = new_uuid();
        let prepared: Vec<Value> = operations
            .iter()
            .map(|operation| {
                let mut object = match operation.clone() {
                    Value::Object(map) => map,
                    other => {
                        let mut map = Map::new();
                        map.insert("value".into(), other);
                        map
                    }
                };
                object.insert("transactionId".into(), json!(transaction_id));
                object.insert("actorId".into(), json!(options.actor_id));
                Value::Object(object)
            })
            .collect();
        let operations_digest = digest_of_value(&Value::Array(prepared.clone()));
        let commit = json!({
            "type": "transaction.commit",
            "value": {
                "transactionId": transaction_id,
                "actorId": options.actor_id,
                "operationsDigest": operations_digest,
                "profileIds": options.profile_ids,
            }
        });
        let file = format!("{}-{}.krd", now_millis(), transaction_id);
        let temporary = self.events.join(format!(".{}.tmp", file));
        let mut lines: Vec<String> = prepared
            .iter()
            .map(|item| serde_json::to_string(item).unwrap_or_default())
            .collect();
        lines.push(serde_json::to_string(&commit).unwrap_or_default());
        // rename is atomic but not fsync-durable; a crash after rename may
        // lose the tail of the event history. Stated durability limitation
        // of Phase 0, not a guarantee.
        std::fs::write(&temporary, format!("{}\n", lines.join("\n")))?;
        std::fs::rename(&temporary, self.events.join(&file))?;
        inner.state = next;
        inner.heads.push(transaction_id.clone());
        std::fs::write(
            self.kraddle.join("heads.krd"),
            format!("{}\n", canonical_json(&json!({ "heads": inner.heads }))),
        )?;
        Ok(transaction_id)
    }

    /// Live state snapshot (the server reads state after every transact —
    /// Phase 2's stale-state bug is load-bearing here).
    pub fn state(&self) -> State {
        self.inner.lock().expect("workspace lock poisoned").state.clone()
    }

    pub fn heads(&self) -> Vec<String> {
        self.inner.lock().expect("workspace lock poisoned").heads.clone()
    }

    /// Run a mutation against the live state under the workspace lock.
    pub fn with_state_mut<R>(&self, f: impl FnOnce(&mut State) -> R) -> R {
        let mut inner = self.inner.lock().expect("workspace lock poisoned");
        f(&mut inner.state)
    }

    pub fn is_trusted(&self) -> bool {
        self.inner.lock().expect("workspace lock poisoned").trusted
    }
}

/// Parse one event segment: all lines as JSON, last line must be the
/// transaction.commit marker. Any failure yields None (the caller
/// quarantines with SEGMENT_COMMIT_MARKER_MISSING, as Node does).
fn parse_segment(content: &str) -> Option<(Vec<Value>, Value)> {
    let mut lines: Vec<Value> = Vec::new();
    for line in content.trim().split('\n') {
        if line.trim().is_empty() {
            continue;
        }
        lines.push(serde_json::from_str::<Value>(line).ok()?);
    }
    let last = lines.last()?.clone();
    if last.get("type").and_then(|t| t.as_str()) == Some("transaction.commit") {
        Some((lines[..lines.len() - 1].to_vec(), last))
    } else {
        None
    }
}

/// Port of requireTrustedProjection.
pub fn require_trusted_projection(trusted: bool, quarantined: &[Value]) -> KResult<()> {
    if !trusted {
        return Err(KraddleError::control(
            DenialCode::ProjectionUntrusted,
            json!({ "quarantined": quarantined }),
        ));
    }
    Ok(())
}
