import json
from copy import deepcopy
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest

from harnessctl.config import DEFAULT_CONFIG, ConfigError
from harnessctl.install import _merge_host_json, _merge_pi_json
from harnessctl.mcp import (
    GITHUB_MCP_URL,
    GITHUB_TOOLSETS,
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
    config["skills"]["cvs"]["provider"] = {
        "type": provider,
        "tools": tools[provider],
        "mcpName": f"sdlc_cvs_{provider}",
        "url": url
        or {
            "github": "https://github.com",
            "gitlab": "https://gitlab.com",
            "gitea": "https://gitea.example.test",
            "forgejo": "https://forgejo.example.test",
        }[provider],
        "token_env": token_env or f"{provider.upper()}_TOKEN",
    }
    return next(
        intent
        for intent in recognized_server_intents(config, "opencode")
        if intent.server_id == f"sdlc_cvs_{provider}"
        and intent.provider == provider
        and (provider != "gitea" or intent.command == "gitea-mcp")
    )


def _config_without_generic_servers() -> dict[str, Any]:
    config = deepcopy(DEFAULT_CONFIG)
    config["mcpServers"] = {}
    return config


def test_default_github_declaration_projects_exact_headers_for_both_hosts() -> None:
    github = next(
        intent
        for intent in required_server_intents(deepcopy(DEFAULT_CONFIG), "all")
        if intent.server_id == "sdlc_cvs_github"
    )

    assert render_opencode_mcp(github) == {
        "type": "remote",
        "url": GITHUB_MCP_URL,
        "headers": {
            "Authorization": "Bearer {env:GH_TOKEN}",
            "X-MCP-Toolsets": GITHUB_TOOLSETS,
        },
    }
    assert render_pi_mcp(github) == {
        "url": GITHUB_MCP_URL,
        "headers": {
            "Authorization": "Bearer ${GH_TOKEN}",
            "X-MCP-Toolsets": GITHUB_TOOLSETS,
        },
        "lifecycle": "lazy",
    }


def test_config_v1_url_and_command_declarations_compile_for_both_hosts() -> None:
    config = deepcopy(DEFAULT_CONFIG)
    config["mcpServers"] = {
        "remote-docs": {
            "url": "https://mcp.example.test/api",
            "headers": {
                "Authorization": "Bearer {env:DOCS_TOKEN}",
                "X-Mode": "static",
            },
        },
        "local-index": {
            "command": "index-mcp",
            "args": ["serve", "--stdio"],
            "environment": {"INDEX_TOKEN": "SOURCE_TOKEN"},
            "cwd": "tools/mcp",
        },
    }

    intents = {intent.server_id: intent for intent in required_server_intents(config, "all")}

    assert render_opencode_mcp(intents["remote-docs"]) == {
        "type": "remote",
        "url": "https://mcp.example.test/api",
        "headers": {"Authorization": "Bearer {env:DOCS_TOKEN}", "X-Mode": "static"},
    }
    assert render_pi_mcp(intents["remote-docs"]) == {
        "url": "https://mcp.example.test/api",
        "headers": {"Authorization": "Bearer ${DOCS_TOKEN}", "X-Mode": "static"},
        "lifecycle": "lazy",
    }
    assert render_opencode_mcp(intents["local-index"]) == {
        "type": "local",
        "command": ["index-mcp", "serve", "--stdio"],
        "environment": {"INDEX_TOKEN": "{env:SOURCE_TOKEN}"},
        "cwd": "tools/mcp",
    }
    assert render_pi_mcp(intents["local-index"]) == {
        "command": "index-mcp",
        "args": ["serve", "--stdio"],
        "lifecycle": "lazy",
        "env": {"INDEX_TOKEN": "${SOURCE_TOKEN}"},
        "cwd": "tools/mcp",
    }


def test_host_overrides_are_copied_and_applied_only_to_the_matching_projection() -> None:
    config = deepcopy(DEFAULT_CONFIG)
    config["mcpServers"] = {
        "custom": {
            "url": "https://mcp.example.test/api",
            "opencode": {
                "enabled": False,
                "native": {"labels": ["docs", 2, None]},
            },
            "pi": {
                "timeout": 5000,
                "native": {"retry": True},
            },
        }
    }
    original = deepcopy(config)

    [intent] = required_server_intents(config, "all")
    opencode = render_opencode_mcp(intent)
    pi = render_pi_mcp(intent)

    assert config == original
    assert opencode == {
        "enabled": False,
        "native": {"labels": ["docs", 2, None]},
        "type": "remote",
        "url": "https://mcp.example.test/api",
    }
    assert pi == {
        "timeout": 5000,
        "native": {"retry": True},
        "url": "https://mcp.example.test/api",
        "lifecycle": "lazy",
    }
    opencode["native"]["labels"].append("rendered")
    pi["native"]["retry"] = False
    assert config == original
    assert render_opencode_mcp(intent)["native"] == {"labels": ["docs", 2, None]}
    assert render_pi_mcp(intent)["native"] == {"retry": True}


def test_adapter_owned_fields_remain_authoritative_if_validation_is_bypassed() -> None:
    intent = ServerIntent(
        "custom",
        "generic",
        "https://mcp.example.test/api",
        None,
        None,
        (),
        False,
        None,
        None,
        ("mcpServers",),
        opencode_override={"type": "local", "url": "https://replacement.example.test"},
        pi_override={"url": "https://replacement.example.test", "lifecycle": "eager"},
    )

    assert render_opencode_mcp(intent) == {
        "type": "remote",
        "url": "https://mcp.example.test/api",
    }
    assert render_pi_mcp(intent) == {
        "url": "https://mcp.example.test/api",
        "lifecycle": "lazy",
    }


def test_cvs_reference_accepts_url_or_command_without_provider_derived_intent() -> None:
    config = _config_without_generic_servers()
    config["mcpServers"] = {"sdlc_cvs_github": {"command": "operator-github-mcp"}}

    [intent] = required_server_intents(config, "all")

    assert intent.provider == "generic"
    assert intent.command == "operator-github-mcp"
    assert intent.requesting_routes == ("mcpServers", "cvs")


@pytest.mark.parametrize("value", ["{env:}", "${TOKEN}", "{env:lower}", "safe\nInjected: value"])
def test_header_renderer_rejects_malformed_templates(value: str) -> None:
    intent = ServerIntent(
        "remote",
        "generic",
        "https://mcp.example.test",
        None,
        None,
        (),
        False,
        None,
        None,
        ("mcpServers",),
        headers=(("Authorization", value),),
    )

    with pytest.raises(ConfigError, match="header templates"):
        render_opencode_mcp(intent)


def test_plain_bitbucket_provider_does_not_request_unimplemented_projection() -> None:
    config = _config_without_generic_servers()
    config["skills"]["cvs"]["provider"] = {
        "type": "bitbucket",
        "tools": "git",
        "url": "https://bitbucket.org",
        "token_env": "BITBUCKET_TOKEN",
    }

    assert required_server_intents(config, "all") == []


@pytest.mark.parametrize("provider", ["github", "gitlab", "gitea", "forgejo"])
def test_cvs_intents_use_canonical_ids_and_recognize_exact_legacy_ids(
    provider: str,
) -> None:
    config = _config_without_generic_servers()
    config["skills"]["cvs"]["provider"] = {
        "type": provider,
        "tools": {
            "github": "gh",
            "gitlab": "glab",
            "gitea": "tea",
            "forgejo": "forgejo-cli",
        }[provider],
        "mcpName": f"sdlc_cvs_{provider}",
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

    assert desired == []
    assert recognized[0].server_id == f"sdlc_cvs_{provider}"
    assert recognized[1].server_id == f"cvs_{provider}"
    assert replace(recognized[1], server_id=recognized[0].server_id) == recognized[0]
    if provider == "gitea":
        assert [intent.server_id for intent in recognized[2:]] == [
            "cvs_gitea",
            "sdlc_cvs_gitea",
        ]
        for historical in recognized[2:]:
            assert historical.command == "forgejo-mcp"
            assert historical.args == (
                "--transport",
                "stdio",
                "--url",
                "https://gitea.example.test",
            )
            assert historical.environment == (("FORGEJO_ACCESS_TOKEN", "GITEA_TOKEN"),)
    else:
        assert len(recognized) == 2


def test_local_gitea_projection_is_provider_exclusive() -> None:
    intent = _intent("gitea", token_env="GITEA_SOURCE_TOKEN")

    assert intent.compatibility_version == "1.6.0"
    assert render_opencode_mcp(intent) == {
        "type": "local",
        "command": [
            "gitea-mcp",
            "--transport",
            "stdio",
            "--host",
            intent.url,
        ],
        "environment": {"GITEA_ACCESS_TOKEN": "{env:GITEA_SOURCE_TOKEN}"},
    }
    assert render_pi_mcp(intent) == {
        "command": "gitea-mcp",
        "args": ["--transport", "stdio", "--host", intent.url],
        "env": {"GITEA_ACCESS_TOKEN": "${GITEA_SOURCE_TOKEN}"},
        "lifecycle": "lazy",
    }
    assert "forgejo" not in json.dumps(render_opencode_mcp(intent)).lower()


def test_local_forgejo_projection_is_provider_exclusive() -> None:
    intent = _intent("forgejo", token_env="FORGE_TOKEN")

    assert intent.compatibility_version == "2.33.0"
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
    assert "gitea" not in json.dumps(render_opencode_mcp(intent)).lower()


def test_documents_do_not_create_mcp_intents_or_routes() -> None:
    intents = required_server_intents(deepcopy(DEFAULT_CONFIG), "all")

    assert [intent.server_id for intent in intents] == [
        "sdlc_cvs_github",
        "sdlc_code_index",
        "webcrawl_searchable",
    ]
    assert [intent.requesting_routes for intent in intents] == [
        ("mcpServers", "cvs"),
        ("mcpServers",),
        ("mcpServers",),
    ]


def test_provider_neutral_local_projection_omits_optional_url_and_empty_environment() -> None:
    intent = ServerIntent(
        "sdlc-code-index",
        "fixture",
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
        None,
        None,
        "fixture-mcp",
        ("serve",),
        False,
        None,
        None,
        ("code-index",),
        (("lowercase_key", "SOURCE_TOKEN"), ("FIXTURE_CACHE", "SOURCE_CACHE")),
    )

    assert render_opencode_mcp(intent)["environment"] == {
        "lowercase_key": "{env:SOURCE_TOKEN}",
        "FIXTURE_CACHE": "{env:SOURCE_CACHE}",
    }
    assert render_pi_mcp(intent)["env"] == {
        "lowercase_key": "${SOURCE_TOKEN}",
        "FIXTURE_CACHE": "${SOURCE_CACHE}",
    }


@pytest.mark.parametrize("harness", ["opencode", "pi", "all"])
def test_external_code_index_skill_generates_no_code_index_mcp_intents(harness: str) -> None:
    config = deepcopy(DEFAULT_CONFIG)
    config["skills"]["codeIndex"] = {"enabled": True, "mcpName": "operator-index"}

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


@pytest.mark.parametrize(
    ("provider", "tool", "url", "token_env", "target_env"),
    [
        (
            "gitea",
            "tea",
            "https://gitea.example.test",
            "GITEA_TOKEN",
            "GITEA_ACCESS_TOKEN",
        ),
        (
            "forgejo",
            "forgejo-cli",
            "https://forgejo.example.test",
            "FORGEJO_TOKEN",
            "FORGEJO_ACCESS_TOKEN",
        ),
    ],
)
def test_shared_generic_declaration_avoids_provider_derived_duplicates(
    provider: str,
    tool: str,
    url: str,
    token_env: str,
    target_env: str,
) -> None:
    config = _config_without_generic_servers()
    config["skills"]["cvs"]["provider"] = {
        "type": provider,
        "tools": tool,
        "mcpName": f"sdlc_cvs_{provider}",
        "url": url,
        "token_env": token_env,
    }
    config["skills"]["issues"] = {
        "enabled": True,
        "root": ".harnessctl/issues",
        "prefix": "hrn-",
        "provider": {
            "type": provider,
            "tools": tool,
            "mcpName": f"sdlc_cvs_{provider}",
            "url": url,
            "token_env": token_env,
        },
    }
    config["mcpServers"] = {
        f"sdlc_cvs_{provider}": {
            "command": "operator-mcp",
            "environment": {target_env: token_env},
        }
    }

    candidates = required_server_intents(config, "all")
    deduplicated = deduplicate_server_intents(candidates)

    assert [intent.requesting_routes for intent in candidates] == [("mcpServers", "cvs", "issues")]
    assert len(deduplicated) == 1
    shared = deduplicated[0]
    assert shared.server_id == f"sdlc_cvs_{provider}"
    assert shared.requesting_routes == ("mcpServers", "cvs", "issues")
    assert render_opencode_mcp(shared)["command"][0] == "operator-mcp"
    assert render_opencode_mcp(shared)["environment"] == {target_env: f"{{env:{token_env}}}"}
    assert render_pi_mcp(shared)["env"] == {target_env: f"${{{token_env}}}"}


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


@pytest.mark.parametrize("force", [False, True])
def test_operator_owned_conflict_is_preserved_and_force_is_narrow(
    tmp_path: Path, force: bool
) -> None:
    path = tmp_path / "mcp.json"
    settings_operator_raw = '{"weight":1e+02,"escaped":"\\u0061"}'
    path.write_text(
        '{"unrelated":true,"mcpServers":'
        '{"sdlc_cvs_github":{"url":"wrong"},"operator":{}},'
        f'"settings":{{"outputGuard":{json.dumps(OUTPUT_GUARD)},'
        f'"operator":{settings_operator_raw}}}}}',
        encoding="utf-8",
    )
    intent = _intent("github", token_env="GH_TOKEN")

    original = path.read_text(encoding="utf-8")
    with pytest.warns(UserWarning, match=r"sdlc_cvs_github.*host target.*Remove or rename"):
        merged = _merge_pi_json(path, [intent], force=force)
    assert merged is None
    assert path.read_text(encoding="utf-8") == original
    document = json.loads(original)
    assert document["unrelated"] is True
    assert document["mcpServers"]["operator"] == {}
    assert document["settings"]["operator"] == {"weight": 100, "escaped": "a"}
    assert document["mcpServers"]["sdlc_cvs_github"] == {"url": "wrong"}


@pytest.mark.parametrize("container_name", ["mcp", "mcpServers"])
def test_exact_recognized_entry_updates_without_force_and_preserves_siblings(
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

    merged = _merge_host_json(
        path,
        container_name,
        {"sdlc-code-index": new},
        recognized=recognized,
        force=False,
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
@pytest.mark.parametrize("force", [False, True])
def test_present_null_operator_entry_is_preserved(
    tmp_path: Path, container_name: str, force: bool
) -> None:
    path = tmp_path / "host.json"
    expected = {"command": ["fixture-mcp", "serve"]}
    path.write_text(
        json.dumps({container_name: {"sdlc-code-index": None}}),
        encoding="utf-8",
    )

    original = path.read_text(encoding="utf-8")
    with pytest.warns(UserWarning, match=r"sdlc-code-index.*operator-owned"):
        merged = _merge_host_json(
            path,
            container_name,
            {"sdlc-code-index": expected},
            force=force,
        )
    assert merged is None
    assert path.read_text(encoding="utf-8") == original


@pytest.mark.parametrize("container_name", ["mcp", "mcpServers"])
def test_operator_entry_comparison_distinguishes_booleans_from_numbers(
    tmp_path: Path, container_name: str
) -> None:
    path = tmp_path / "host.json"
    expected = {"weight": 0}
    path.write_text(
        json.dumps({container_name: {"sdlc-code-index": {"weight": False}}}),
        encoding="utf-8",
    )

    original = path.read_text(encoding="utf-8")
    with pytest.warns(UserWarning, match="operator-owned"):
        merged = _merge_host_json(
            path,
            container_name,
            {"sdlc-code-index": expected},
            force=False,
        )
    assert merged is None
    assert path.read_text(encoding="utf-8") == original


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
@pytest.mark.parametrize("force", [False, True])
def test_disabled_owned_entry_preserves_and_reports_modified_content(
    tmp_path: Path, container_name: str, force: bool
) -> None:
    path = tmp_path / "host.json"
    generated = {"command": ["fixture-mcp", "serve"]}
    modified = {"command": ["operator-mcp", "serve"]}
    original = json.dumps({container_name: {"sdlc-code-index": modified}})
    path.write_text(original, encoding="utf-8")

    with pytest.warns(UserWarning, match=r"sdlc-code-index.*operator-owned"):
        merged = _merge_host_json(
            path,
            container_name,
            {},
            recognized={"sdlc-code-index": (generated,)},
            force=force,
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

    with pytest.warns(UserWarning, match=r"cvs_github.*operator-owned"):
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
@pytest.mark.parametrize("server_id", ["cvs_gitea", "sdlc_cvs_gitea"])
@pytest.mark.parametrize("force", [False, True])
@pytest.mark.parametrize("modified", [False, True])
def test_historical_gitea_entry_requires_replacement_in_same_plan(
    tmp_path: Path,
    container_name: str,
    server_id: str,
    force: bool,
    modified: bool,
) -> None:
    path = tmp_path / "host.json"
    historical = {"command": ["forgejo-mcp", "--transport", "stdio"]}
    current = {**historical, **({"operator": True} if modified else {})}
    original = json.dumps({container_name: {server_id: current}})
    path.write_text(original, encoding="utf-8")

    if modified:
        with pytest.warns(UserWarning, match=rf"{server_id}.*operator-owned"):
            merged = _merge_host_json(
                path,
                container_name,
                {},
                recognized={server_id: (historical,)},
                force=force,
            )
        assert merged is None
        assert path.read_text(encoding="utf-8") == original
    else:
        merged = _merge_host_json(
            path,
            container_name,
            {},
            recognized={server_id: (historical,)},
            force=force,
        )
        assert merged is not None
        assert json.loads(merged)[container_name] == {}


@pytest.mark.parametrize("container_name", ["mcp", "mcpServers"])
def test_recognized_entry_comparison_distinguishes_booleans_from_numbers(
    tmp_path: Path, container_name: str
) -> None:
    path = tmp_path / "host.json"
    modified = {"weight": False}
    original = json.dumps({container_name: {"sdlc-code-index": modified}})
    path.write_text(original, encoding="utf-8")

    with pytest.warns(UserWarning, match=r"sdlc-code-index.*operator-owned"):
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
