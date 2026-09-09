#!/usr/bin/env python3
"""Detect drift between Issue-related enums across contracts/openapi.yaml,
apps/api/src/types.ts and apps/web/src/domain/entities/Issue.ts.

See ../SKILL.md for the full explanation, expected output, and limits of
this check. Zero dependencies (no PyYAML) by design, so it runs anywhere
python3 runs with no install step.
"""

import argparse
import os
import re
import sys

DEFAULT_TARGETS = [
    "contracts/openapi.yaml",
    "apps/api/src/types.ts",
    "apps/web/src/domain/entities/Issue.ts",
]

ENUM_NAME_PATTERN = re.compile(r"^Issue", re.IGNORECASE)

# A YAML mapping key with no inline value, e.g. "  IssueStatus:" or "    enum:".
YAML_KEY_LINE = re.compile(r"^(?P<indent>[ \t]*)(?P<key>[A-Za-z_][A-Za-z0-9_]*):\s*(#.*)?$")
YAML_FLOW_ENUM = re.compile(r"^(?P<indent>[ \t]*)enum:\s*\[(?P<values>[^\]]*)\]\s*(#.*)?$")
YAML_BLOCK_ENUM_KEY = re.compile(r"^(?P<indent>[ \t]*)enum:\s*(#.*)?$")
YAML_LIST_ITEM = re.compile(r"^(?P<indent>[ \t]*)-\s*(?P<value>.+?)\s*(#.*)?$")

TS_TYPE_ALIAS = re.compile(r"export\s+type\s+(?P<name>\w+)\s*=\s*(?P<body>[^;]+);", re.DOTALL)
TS_ENUM_BLOCK = re.compile(r"export\s+enum\s+(?P<name>\w+)\s*\{(?P<body>[^}]*)\}", re.DOTALL)
QUOTED_STRING = re.compile(r"""['"]([^'"]*)['"]""")


def indent_len(indent):
    return len(indent.replace("\t", "    "))


def parse_yaml_enums(text):
    """Return {enum_name: set(values)} for schema keys whose enum sits
    directly beneath them, in either flow ([A, B]) or block (- A / - B) style.
    """
    lines = text.splitlines()
    enums = {}
    i = 0
    n = len(lines)
    while i < n:
        key_match = YAML_KEY_LINE.match(lines[i])
        if not key_match or not ENUM_NAME_PATTERN.match(key_match.group("key")):
            i += 1
            continue

        name = key_match.group("key")
        key_indent = indent_len(key_match.group("indent"))
        values = None
        j = i + 1
        while j < n:
            line = lines[j]
            if line.strip() == "":
                j += 1
                continue
            this_indent = indent_len(re.match(r"^[ \t]*", line).group(0))
            if this_indent <= key_indent:
                break  # left the block belonging to `name`

            flow_match = YAML_FLOW_ENUM.match(line)
            if flow_match:
                values = {v.strip().strip("'\"") for v in flow_match.group("values").split(",") if v.strip()}
                j += 1
                break

            block_key_match = YAML_BLOCK_ENUM_KEY.match(line)
            if block_key_match:
                enum_key_indent = indent_len(block_key_match.group("indent"))
                values = set()
                k = j + 1
                while k < n:
                    item_line = lines[k]
                    if item_line.strip() == "":
                        k += 1
                        continue
                    item_indent = indent_len(re.match(r"^[ \t]*", item_line).group(0))
                    if item_indent <= enum_key_indent:
                        break
                    item_match = YAML_LIST_ITEM.match(item_line)
                    if not item_match:
                        break
                    values.add(item_match.group("value").strip().strip("'\""))
                    k += 1
                j = k
                break

            j += 1

        if values is not None:
            enums[name] = values
        i += 1

    return enums


def parse_ts_enums(text):
    """Return {enum_name: set(values)} for `export type X = 'a' | 'b';`
    unions and `export enum X { A = "a" }` blocks with string values.
    """
    enums = {}

    for match in TS_TYPE_ALIAS.finditer(text):
        name = match.group("name")
        if not ENUM_NAME_PATTERN.match(name):
            continue
        values = set(QUOTED_STRING.findall(match.group("body")))
        if values:
            enums[name] = values

    for match in TS_ENUM_BLOCK.finditer(text):
        name = match.group("name")
        if not ENUM_NAME_PATTERN.match(name):
            continue
        values = set()
        for member in match.group("body").split(","):
            value_match = QUOTED_STRING.search(member)
            if value_match:
                values.add(value_match.group(1))
        if values:
            enums[name] = values

    return enums


def parse_file(path):
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    if path.endswith((".yaml", ".yml")):
        return parse_yaml_enums(text)
    return parse_ts_enums(text)


def main():
    parser = argparse.ArgumentParser(description="Check Issue-related enums stay in sync across files.")
    parser.add_argument("--root", default=".", help="Repo root to resolve relative file paths against.")
    parser.add_argument("--file", dest="files", action="append", help="Relative path to check (repeatable). Overrides the default target list.")
    args = parser.parse_args()

    relative_paths = args.files if args.files else DEFAULT_TARGETS
    per_file_enums = {}
    for rel_path in relative_paths:
        abs_path = os.path.join(args.root, rel_path)
        if not os.path.isfile(abs_path):
            print(f"error: file not found: {abs_path}", file=sys.stderr)
            return 2
        per_file_enums[rel_path] = parse_file(abs_path)

    all_enum_names = sorted(
        {name for enums in per_file_enums.values() for name in enums},
        key=str.lower,
    )

    print("Issue Contract Checker")
    print("=======================")
    print()

    mismatch_count = 0
    for enum_name in all_enum_names:
        print(f"Checking enum: {enum_name}")

        per_file_values = {rel_path: enums.get(enum_name, set()) for rel_path, enums in per_file_enums.items()}
        enum_has_mismatch = False

        for rel_path in relative_paths:
            values = per_file_values[rel_path]
            other_union = set()
            for other_path, other_values in per_file_values.items():
                if other_path != rel_path:
                    other_union |= other_values

            missing = sorted(other_union - values)
            extra = sorted(values - other_union)

            line = f"  {rel_path}: {', '.join(sorted(values)) if values else '(not found)'}"
            annotations = []
            if missing:
                annotations.append(f"missing: {', '.join(missing)}")
            if extra:
                annotations.append(f"extra: {', '.join(extra)}")
            if annotations:
                line += "  <- " + "; ".join(annotations)
                enum_has_mismatch = True
            print(line)

        if enum_has_mismatch:
            mismatch_count += 1
            print(f"  MISMATCH in {enum_name}")
        else:
            print("  OK")
        print()

    print(f"Summary: {mismatch_count} mismatch(es) found across {len(all_enum_names)} enum(s) checked.")
    print("Note: matching enums does not prove full API compliance — this check only catches enum drift.")

    return 1 if mismatch_count else 0


if __name__ == "__main__":
    sys.exit(main())
