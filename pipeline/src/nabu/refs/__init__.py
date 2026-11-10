"""The reference library (ADR 0079): grammars, dictionaries and notes in a private Google Drive
folder, reached through the relay (apps/references). Copies come down to a directory outside any git
work tree, so nothing from a reference can be committed by accident."""

from nabu.refs.client import (
    DEFAULT_MAX_PULL,
    MAX_UPLOAD,
    Entry,
    PullReport,
    Relay,
    RelayError,
    default_local_dir,
    inside_git_work_tree,
    relay_from_env,
)

__all__ = [
    "DEFAULT_MAX_PULL",
    "MAX_UPLOAD",
    "Entry",
    "PullReport",
    "Relay",
    "RelayError",
    "default_local_dir",
    "inside_git_work_tree",
    "relay_from_env",
]
