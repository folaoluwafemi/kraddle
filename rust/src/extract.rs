//! Port of src/extract.js — regex-based dependency extraction.
//!
//! This module can UNDER-EXTRACT: import forms its regexes do not recognize
//! are invisible to it, so completeness claims hold only for recognized
//! forms. A parser-based extractor is future work. Under-extraction is
//! exactly why the evaluator treats unknowns as blocking, and why coverage
//! subjects are the input files.

use crate::kernel::sha256_hex;
use regex::Regex;
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;

pub const SOURCE_EXTENSIONS: [&str; 6] = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

pub fn compute_file_map_digest(files: &BTreeMap<String, String>) -> String {
    let mut payload = String::new();
    let mut first = true;
    for path in files.keys() {
        if !first {
            payload.push('\n');
        }
        first = false;
        payload.push_str(path);
        payload.push('\n');
        payload.push_str(&files[path]);
    }
    sha256_hex(&payload)
}

fn static_import_from() -> Regex {
    Regex::new(r#"\bimport\s+[^;'"]*?\bfrom\s*["']([^"']+)["']"#).unwrap()
}

fn bare_import() -> Regex {
    Regex::new(r#"\bimport\s*["']([^"']+)["']"#).unwrap()
}

fn export_from() -> Regex {
    Regex::new(r#"\bexport\s+[^;'"]*?\bfrom\s*["']([^"']+)["']"#).unwrap()
}

fn static_require() -> Regex {
    Regex::new(r#"\brequire\s*\(\s*["']([^"']+)["']\s*\)"#).unwrap()
}

fn dynamic_import_literal() -> Regex {
    Regex::new(r#"\bimport\s*\(\s*["']([^"']+)["']\s*\)"#).unwrap()
}

fn dynamic_computed() -> Regex {
    // D2: the regex crate has no lookaheads. Node's
    // /\b(?:import|require)\s*\(\s*(?![\s"'])/ is restructured as the
    // prefix match plus an in-code inspection of the next character.
    Regex::new(r"\b(?:import|require)\s*\(").unwrap()
}

fn normalize_posix_path(path: &str) -> String {
    let mut out: Vec<&str> = Vec::new();
    for segment in path.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." {
            out.pop();
        } else {
            out.push(segment);
        }
    }
    out.join("/")
}

enum Classified {
    Resolved { to: String },
    Ambiguous { candidates: Vec<String> },
    Unresolved,
    External { to: String },
}

fn classify_spec(from: &str, spec: &str, files: &BTreeMap<String, String>) -> Classified {
    if !spec.starts_with('.') && !spec.starts_with('/') {
        return Classified::External { to: spec.to_string() };
    }
    let base_dir = match from.rfind('/') {
        Some(index) => &from[..index],
        None => "",
    };
    let joined = if spec.starts_with('/') {
        spec[1..].to_string()
    } else if !base_dir.is_empty() {
        format!("{}/{}", base_dir, spec)
    } else {
        spec.to_string()
    };
    let normalized = normalize_posix_path(&joined);
    if files.contains_key(&normalized) {
        return Classified::Resolved { to: normalized };
    }
    let mut candidates: Vec<String> = Vec::new();
    for extension in SOURCE_EXTENSIONS {
        let candidate = format!("{}{}", normalized, extension);
        if files.contains_key(&candidate) {
            candidates.push(candidate);
        }
    }
    for extension in SOURCE_EXTENSIONS {
        let candidate = format!("{}/index{}", normalized, extension);
        if files.contains_key(&candidate) {
            candidates.push(candidate);
        }
    }
    match candidates.len() {
        1 => Classified::Resolved { to: candidates.remove(0) },
        0 => Classified::Unresolved,
        _ => Classified::Ambiguous { candidates },
    }
}

fn edge_value(from: &str, spec: Option<&str>, to: Option<&str>, resolution: &str, candidates: Option<Vec<String>>) -> Value {
    let mut map = Map::new();
    map.insert("from".into(), json!(from));
    if let Some(spec) = spec {
        map.insert("spec".into(), json!(spec));
    } else {
        map.insert("spec".into(), Value::Null);
    }
    if let Some(to) = to {
        map.insert("to".into(), json!(to));
    } else {
        map.insert("to".into(), Value::Null);
    }
    map.insert("resolution".into(), json!(resolution));
    if let Some(candidates) = candidates {
        map.insert(
            "candidates".into(),
            Value::Array(candidates.into_iter().map(|c| json!(c)).collect()),
        );
    }
    Value::Object(map)
}

pub struct Extraction {
    pub edges: Vec<Value>,
    pub subjects: Vec<String>,
    pub limitations: &'static str,
}

/// Port of extractDependencies: four edge resolutions over an in-memory
/// file map (keys are repo-relative POSIX paths).
pub fn extract_dependencies(files: &BTreeMap<String, String>) -> Extraction {
    let mut edges: Vec<Value> = Vec::new();
    let mut froms: Vec<&String> = files.keys().collect();
    froms.sort();

    let static_patterns = [
        static_import_from(),
        bare_import(),
        export_from(),
        static_require(),
        dynamic_import_literal(),
    ];
    for from in froms {
        let content = &files[from];
        for pattern in &static_patterns {
            for captures in pattern.captures_iter(content) {
                let spec = captures.get(1).map(|m| m.as_str()).unwrap_or("");
                match classify_spec(from, spec, files) {
                    Classified::Resolved { to } => {
                        edges.push(edge_value(from, Some(spec), Some(&to), "resolved", None));
                    }
                    Classified::Ambiguous { candidates } => {
                        edges.push(edge_value(from, Some(spec), None, "ambiguous", Some(candidates)));
                    }
                    Classified::Unresolved => {
                        edges.push(edge_value(from, Some(spec), None, "unresolved", None));
                    }
                    Classified::External { to } => {
                        edges.push(edge_value(from, Some(spec), Some(&to), "external", None));
                    }
                }
            }
        }
        for captures in dynamic_computed().captures_iter(content) {
            let whole = captures.get(0).expect("whole match");
            let rest = &content[whole.end()..];
            let trimmed = rest.trim_start();
            let next = trimmed.chars().next();
            let is_computed = match next {
                None => true,
                Some(c) => c != '"' && c != '\'',
            };
            if is_computed {
                edges.push(edge_value(from, None, None, "unresolved", None));
            }
        }
    }

    let mut subjects: Vec<String> = files.keys().cloned().collect();
    subjects.sort();
    Extraction { edges, subjects, limitations: "regex-extraction" }
}
