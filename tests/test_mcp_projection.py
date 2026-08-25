import json
from copy import deepcopy
from dataclasses import replace
from pathlib import Path

import pytest

from harnessctl.config import DEFAULT_CONFIG, ConfigError
from harnessctl.install import _merge_host_json, _merge_pi_json
from harnessctl.mcp import (
    GITHUB_MCP_URL,
    GITHUB_TOOLSETS,
    GITLAB_MCP_URL,
    OUTPUT_GUARD,
    ServerIntent,
    deduplicate_server_intents,
    recognized_server_intents,
    render_opencode_mcp,
    render_pi_mcp,
    required_server_intents,
)


def _intent(
    provider: str,
    *,
    url: str | None = None,
    token_env: str | None = None,
):
    config = deepcopy(DEFAULT_CONFIG)
    tools = {
        "github": "gh",
        "gitlab": "glab",
        "gitea": "tea",
        "forgejo": "forgejo-cli",
    }
    config["cvs"]["remote"] = {
        "provider": provider,
        "tools": tools[provider],
        "url": url
        or {
            "github": "https://github.com",
            "gitlab": "https://gitlab.com",
            "gitea": "https://gitea.example.test",
            "forgejo": "https://forgejo.example.test",
        }[provider],
        "token_env": token_env or f"{provider.upper()}_TOKEN",
    }
    return required_server_intents(config, "opencode")[0]


def test_github_and_gitlab_exact_host_projections() -> None:
    github = _intent("github", token_env="GH_TOKEN")
    gitlab = _intent("gitlab")

    assert render_opencode_mcp(github) == {
        "type": "remote",
        "url": GITHUB_MCP_URL,
        "headers": {
            "Authorization": "Bearer {env:GH_TOKEN}",
            "X-MCP-Toolsets": GITHUB_TOOLSETS,
        },
        "oauth": False,
    }
    assert render_pi_mcp(github) == {
        "url": GITHUB_MCP_URL,
        "headers": {
            "Authorization": "Bearer ${GH_TOKEN}",
            "X-MCP-Toolsets": GITHUB_TOOLSETS,
        },
        "auth": "bearer",
        "lifecycle": "lazy",
    }
    assert render_opencode_mcp(gitlab) == {
        "type": "remote",
        "url": GITLAB_MCP_URL,
        "oauth": {},
    }
    assert render_pi_mcp(gitlab) == {
        "url": GITLAB_MCP_URL,
        "auth": "oauth",
        "oauth": {},
        "lifecycle": "lazy",
    }
    assert "TOKEN" not in json.dumps(render_opencode_mcp(gitlab))


@pytest.mark.parametrize("provider", ["github", "gitlab", "gitea", "forgejo"])
def test_cvs_intents_use_canonical_ids_and_recognize_exact_legacy_ids(
    provider: str,
) -> None:
    config = deepcopy(DEFAULT_CONFIG)
    config["cvs"]["remote"] = {
        "provider": provider,
        "tools": {
            "github": "gh",
            "gitlab": "glab",
            "gitea": "tea",
            "forgejo": "forgejo-cli",
        }[provider],
        "url": {
            "github": "https://github.com",
            "gitlab": "https://gitlab.com",
            "gitea": "https://gitea.example.test",
            "forgejo": "https://forgejo.example.test",
        }[provider],
        "token_env": f"{provider.upper()}_TOKEN",
    }

    desired = required_server_intents(config, "all")
    recognized = recognized_server_intents(config, "all")

    assert [intent.server_id for intent in desired] == [f"sdlc_cvs_{provider}"]
    assert [intent.server_id for intent in recognized] == [f"cvs_{provider}"]
    assert replace(recognized[0], server_id=desired[0].server_id) == desired[0]


@pytest.mark.parametrize("provider", ["gitea", "forgejo"])
def test_local_forge_projection_maps_only_token_name(provider: str) -> None:
    intent = _intent(provider, token_env="FORGE_TOKEN")

    assert render_opencode_mcp(intent) == {
        "type": "local",
        "command": [
            "forgejo-mcp",
            "--transport",
            "stdio",
            "--url",
            intent.url,
        ],
        "environment": {"FORGEJO_ACCESS_TOKEN": "{env:FORGE_TOKEN}"},
    }
    assert render_pi_mcp(intent) == {
        "command": "forgejo-mcp",
        "args": ["--transport", "stdio", "--url", intent.url],
        "env": {"FORGEJO_ACCESS_TOKEN": "${FORGE_TOKEN}"},
        "lifecycle": "lazy",
    }


def test_provider_neutral_local_projection_omits_optional_url_and_empty_environment() -> None:
    intent = ServerIntent(
        "sdlc-code-index",
        "fixture",
        "local",
        None,
        None,
        "fixture-mcp",
        ("serve",),
        False,
        None,
        None,
        ("code-index",),
    )

    assert intent.server_id == "sdlc-code-index"
    assert render_opencode_mcp(intent) == {
        "type": "local",
        "command": ["fixture-mcp", "serve"],
    }
    assert render_pi_mcp(intent) == {
        "command": "fixture-mcp",
        "args": ["serve"],
        "lifecycle": "lazy",
    }


def test_provider_neutral_local_projection_maps_deterministic_environment_names() -> None:
    intent = ServerIntent(
        "sdlc-code-index",
        "fixture",
        "local",
        None,
        None,
        "fixture-mcp",
        ("serve",),
        False,
        None,
        None,
        ("code-index",),
        (("FIXTURE_TOKEN", "SOURCE_TOKEN"), ("FIXTURE_CACHE", "SOURCE_CACHE")),
    )

    assert render_opencode_mcp(intent)["environment"] == {
        "FIXTURE_TOKEN": "{env:SOURCE_TOKEN}",
        "FIXTURE_CACHE": "{env:SOURCE_CACHE}",
    }
    assert render_pi_mcp(intent)["env"] == {
        "FIXTURE_TOKEN": "${SOURCE_TOKEN}",
        "FIXTURE_CACHE": "${SOURCE_CACHE}",
    }


@pytest.mark.parametrize("harness", ["opencode", "pi", "all"])
def test_external_code_index_skill_generates_no_code_index_mcp_intents(harness: str) -> None:
    config = deepcopy(DEFAULT_CONFIG)
    config["mcp"] = {"output_limit_mode": "bounded-guidance"}
    config["skills"] = {"sdlc-code-index": {"enabled": True, "mcp_server": "operator-index"}}

    desired = required_server_intents(config, harness)

    assert all(intent.server_id != "operator-index" for intent in desired)
    assert all(intent.server_id != "sdlc-code-index" for intent in desired)
    assert all(
        intent.server_id != "operator-index"
        for intent in recognized_server_intents(config, harness)
    )
    assert all(
        intent.server_id != "sdlc-code-index"
        for intent in recognized_server_intents(config, harness)
    )


@pytest.mark.parametrize(
    "environment",
    [
        (("not-uppercase", "SOURCE_TOKEN"),),
        (("FIXTURE_TOKEN", "not-uppercase"),),
        (("FIXTURE_TOKEN", "SOURCE_TOKEN"), ("FIXTURE_TOKEN", "OTHER_TOKEN")),
    ],
)
def test_provider_neutral_local_projection_rejects_invalid_environment_bindings(
    environment: tuple[tuple[str, str], ...],
) -> None:
    intent = ServerIntent(
        "sdlc-code-index",
        "fixture",
        "local",
        None,
        None,
        "fixture-mcp",
        (),
        False,
        None,
        None,
        ("code-index",),
        environment,
    )

    with pytest.raises(ConfigError, match="environment"):
        render_opencode_mcp(intent)


def test_intents_deduplicate_identical_routes_and_reject_mismatch() -> None:
    intent = _intent("github", token_env="GH_TOKEN")
    duplicate = replace(intent, requesting_routes=("issues",))

    deduplicated = deduplicate_server_intents([intent, duplicate])

    assert len(deduplicated) == 1
    assert deduplicated[0].requesting_routes == ("cvs", "issues")
    with pytest.raises(ConfigError, match="fixed ID sdlc_cvs_github"):
        deduplicate_server_intents([intent, replace(duplicate, token_env="ISSUES_TOKEN")])


def test_opencode_merge_preserves_unrelated_content_and_avoids_rewrite(
    tmp_path: Path,
) -> None:
    path = tmp_path / "opencode.json"
    original = '{\n  "$schema": "x",\n  "mcp": {"operator": {"url": "x"}}\n}\n'
    path.write_text(original, encoding="utf-8")
    expected = render_opencode_mcp(_intent("github", token_env="GH_TOKEN"))

    merged = _merge_host_json(path, "mcp", {"sdlc_cvs_github": expected}, force=False)
    assert merged is not None
    document = json.loads(merged)
    assert document["$schema"] == "x"
    assert document["mcp"]["operator"] == {"url": "x"}
    path.write_text(merged, encoding="utf-8")
    assert _merge_host_json(path, "mcp", {"sdlc_cvs_github": expected}, force=False) is None


@pytest.mark.parametrize("container_name", ["mcp", "mcpServers"])
def test_host_merge_preserves_raw_unchanged_top_level_values(
    tmp_path: Path, container_name: str
) -> None:
    path = tmp_path / "host.json"
    operator_raw = '{"weight":1e+02,"escaped":"\\u0061"}'
    path.write_text(
        f'{{"operator":{operator_raw},"{container_name}":{{"legacy":{{}}}}}}',
        encoding="utf-8",
    )

    merged = _merge_host_json(
        path,
        container_name,
        {"canonical": {}},
        recognized={"legacy": ({},)},
        force=False,
    )

    assert merged is not None
    assert json.loads(merged)["operator"] == {"weight": 100, "escaped": "a"}
    assert f'"operator": {operator_raw}' in merged


def test_owned_conflict_requires_force_and_force_is_narrow(tmp_path: Path) -> None:
    path = tmp_path / "mcp.json"
    settings_operator_raw = '{"weight":1e+02,"escaped":"\\u0061"}'
    path.write_text(
        '{"unrelated":true,"mcpServers":'
        '{"sdlc_cvs_github":{"url":"wrong"},"operator":{}},'
        f'"settings":{{"outputGuard":{{"maxBytes":1}},"operator":{settings_operator_raw}}}}}',
        encoding="utf-8",
    )
    intent = _intent("github", token_env="GH_TOKEN")

    with pytest.raises(FileExistsError, match="sdlc_cvs_github"):
        _merge_pi_json(path, [intent], force=False)
    merged = _merge_pi_json(path, [intent], force=True)
    assert merged is not None
    document = json.loads(merged)
    assert document["unrelated"] is True
    assert document["mcpServers"]["operator"] == {}
    assert document["settings"]["operator"] == {"weight": 100, "escaped": "a"}
    assert document["settings"]["outputGuard"] == OUTPUT_GUARD
    assert f'"operator": {settings_operator_raw}' in merged


@pytest.mark.parametrize("container_name", ["mcp", "mcpServers"])
def test_owned_entry_switch_requires_force_and_replaces_only_fixed_id(
    tmp_path: Path, container_name: str
) -> None:
    path = tmp_path / "host.json"
    old = {"command": ["fixture-old", "serve"]}
    new = {"command": ["fixture-new", "serve"]}
    external_raw = (
        '{"command": [ "operator" ],'
        '"marker":"__harnessctl_preserved_json_member_0__","weight":1e+02}'
    )
    path.write_text(
        f'{{"operator":true,"{container_name}":'
        f'{{"sdlc-code-index":{json.dumps(old)},"operator":{external_raw}}}}}',
        encoding="utf-8",
    )
    recognized = {"sdlc-code-index": (old, new)}

    with pytest.raises(FileExistsError, match="sdlc-code-index"):
        _merge_host_json(
            path,
            container_name,
            {"sdlc-code-index": new},
            recognized=recognized,
            force=False,
        )
    merged = _merge_host_json(
        path,
        container_name,
        {"sdlc-code-index": new},
        recognized=recognized,
        force=True,
    )

    assert merged is not None
    document = json.loads(merged)
    assert document["operator"] is True
    assert document[container_name] == {
        "sdlc-code-index": new,
        "operator": {
            "command": ["operator"],
            "marker": "__harnessctl_preserved_json_member_0__",
            "weight": 100,
        },
    }
    assert external_raw in merged


@pytest.mark.parametrize("container_name", ["mcp", "mcpServers"])
def test_present_null_owned_entry_requires_force(tmp_path: Path, container_name: str) -> None:
    path = tmp_path / "host.json"
    expected = {"command": ["fixture-mcp", "serve"]}
    path.write_text(
        json.dumps({container_name: {"sdlc-code-index": None}}),
        encoding="utf-8",
    )

    with pytest.raises(FileExistsError, match="sdlc-code-index"):
        _merge_host_json(
            path,
            container_name,
            {"sdlc-code-index": expected},
            force=False,
        )

    merged = _merge_host_json(
        path,
        container_name,
        {"sdlc-code-index": expected},
        force=True,
    )

    assert merged is not None
    assert json.loads(merged)[container_name]["sdlc-code-index"] == expected


@pytest.mark.parametrize("container_name", ["mcp", "mcpServers"])
def test_owned_entry_comparison_distinguishes_booleans_from_numbers(
    tmp_path: Path, container_name: str
) -> None:
    path = tmp_path / "host.json"
    expected = {"weight": 0}
    path.write_text(
        json.dumps({container_name: {"sdlc-code-index": {"weight": False}}}),
        encoding="utf-8",
    )

    with pytest.raises(FileExistsError, match="sdlc-code-index"):
        _merge_host_json(
            path,
            container_name,
            {"sdlc-code-index": expected},
            force=False,
        )

    merged = _merge_host_json(
        path,
        container_name,
        {"sdlc-code-index": expected},
        force=True,
    )

    assert merged is not None
    assert json.loads(merged)[container_name]["sdlc-code-index"] == expected
    assert '"weight": false' not in merged


@pytest.mark.parametrize("container_name", ["mcp", "mcpServers"])
def test_disabled_owned_entry_removes_only_exact_recognized_definition(
    tmp_path: Path, container_name: str
) -> None:
    path = tmp_path / "host.json"
    generated = {"command": ["fixture-mcp", "serve"]}
    external_raw = (
        '{"command": [ "operator" ],'
        '"marker":"__harnessctl_preserved_json_member_0__","weight":1e+02}'
    )
    path.write_text(
        f'{{"operator":true,"{container_name}":'
        f'{{"sdlc-code-index":{json.dumps(generated)},"operator":{external_raw}}}}}',
        encoding="utf-8",
    )

    merged = _merge_host_json(
        path,
        container_name,
        {},
        recognized={"sdlc-code-index": (generated,)},
        force=False,
    )

    assert merged is not None
    document = json.loads(merged)
    assert document["operator"] is True
    assert document[container_name] == {
        "operator": {
            "command": ["operator"],
            "marker": "__harnessctl_preserved_json_member_0__",
            "weight": 100,
        }
    }
    assert external_raw in merged


@pytest.mark.parametrize("container_name", ["mcp", "mcpServers"])
def test_disabled_owned_entry_preserves_and_reports_modified_content(
    tmp_path: Path, container_name: str
) -> None:
    path = tmp_path / "host.json"
    generated = {"command": ["fixture-mcp", "serve"]}
    modified = {"command": ["operator-mcp", "serve"]}
    original = json.dumps({container_name: {"sdlc-code-index": modified}})
    path.write_text(original, encoding="utf-8")

    with pytest.warns(UserWarning, match="preserving modified MCP ID sdlc-code-index"):
        merged = _merge_host_json(
            path,
            container_name,
            {},
            recognized={"sdlc-code-index": (generated,)},
            force=False,
        )

    assert merged is None
    assert path.read_text(encoding="utf-8") == original


@pytest.mark.parametrize("container_name", ["mcp", "mcpServers"])
def test_exact_legacy_cvs_entry_migrates_to_canonical_id(
    tmp_path: Path, container_name: str
) -> None:
    path = tmp_path / "host.json"
    generated = {"url": "https://example.test", "auth": "fixture"}
    path.write_text(
        json.dumps({container_name: {"cvs_github": generated, "operator": {}}}),
        encoding="utf-8",
    )

    merged = _merge_host_json(
        path,
        container_name,
        {"sdlc_cvs_github": generated},
        recognized={"cvs_github": (generated,)},
        force=False,
    )

    assert merged is not None
    assert json.loads(merged)[container_name] == {
        "operator": {},
        "sdlc_cvs_github": generated,
    }


@pytest.mark.parametrize("container_name", ["mcp", "mcpServers"])
def test_modified_legacy_cvs_entry_is_preserved_during_canonical_install(
    tmp_path: Path, container_name: str
) -> None:
    path = tmp_path / "host.json"
    generated = {"url": "https://example.test", "auth": "fixture"}
    modified = {"url": "https://operator.example.test", "auth": "fixture"}
    original = json.dumps({container_name: {"cvs_github": modified}})
    path.write_text(original, encoding="utf-8")

    with pytest.warns(UserWarning, match="preserving modified MCP ID cvs_github"):
        merged = _merge_host_json(
            path,
            container_name,
            {"sdlc_cvs_github": generated},
            recognized={"cvs_github": (generated,)},
            force=False,
        )

    assert merged is not None
    assert json.loads(merged)[container_name] == {
        "cvs_github": modified,
        "sdlc_cvs_github": generated,
    }


@pytest.mark.parametrize("container_name", ["mcp", "mcpServers"])
def test_recognized_entry_comparison_distinguishes_booleans_from_numbers(
    tmp_path: Path, container_name: str
) -> None:
    path = tmp_path / "host.json"
    modified = {"weight": False}
    original = json.dumps({container_name: {"sdlc-code-index": modified}})
    path.write_text(original, encoding="utf-8")

    with pytest.warns(UserWarning, match="preserving modified MCP ID sdlc-code-index"):
        merged = _merge_host_json(
            path,
            container_name,
            {},
            recognized={"sdlc-code-index": ({"weight": 0},)},
            force=False,
        )

    assert merged is None
    assert path.read_text(encoding="utf-8") == original


def test_disabled_recognition_does_not_create_empty_pi_configuration(tmp_path: Path) -> None:
    path = tmp_path / "mcp.json"
    generated = {"command": "fixture-mcp", "args": ["serve"], "lifecycle": "lazy"}

    assert (
        _merge_pi_json(
            path,
            [],
            recognized={"sdlc-code-index": (generated,)},
            force=False,
        )
        is None
    )
    assert not path.exists()


@pytest.mark.parametrize(
    "content",
    ['{"mcp":1}', '{"mcp":{},"mcp":{}}', "[]"],
)
def test_host_merge_rejects_incompatible_or_duplicate_json(tmp_path: Path, content: str) -> None:
    path = tmp_path / "opencode.json"
    path.write_text(content, encoding="utf-8")
    intent = _intent("github", token_env="GH_TOKEN")

    with pytest.raises(ValueError):
        _merge_host_json(
            path,
            "mcp",
            {intent.server_id: render_opencode_mcp(intent)},
            force=False,
        )
