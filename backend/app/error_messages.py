"""Collects the user-facing error messages raised in app/ (used by tests and tooling).

Every `raise SomeError("text")` / `raise HTTPException(status, "text")` whose text a user
can see is listed here as a template; f-string parts become `{expr}` placeholders.
"""

import ast
from pathlib import Path

APP = Path(__file__).resolve().parent
_INTERNAL = {"RuntimeError", "AssertionError", "NotImplementedError", "TypeError", "KeyError"}


def _template(node: ast.expr) -> str | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr):
        out = []
        for part in node.values:
            if isinstance(part, ast.Constant):
                out.append(str(part.value))
            elif isinstance(part, ast.FormattedValue):
                out.append("{" + ast.unparse(part.value) + "}")
        return "".join(out)
    return None


def raised_messages() -> dict[str, str]:
    """{template: "file:line"} for every user-visible raised message."""
    found: dict[str, str] = {}
    for path in sorted(APP.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not (isinstance(node, ast.Raise) and isinstance(node.exc, ast.Call)):
                continue
            call = node.exc
            name = ast.unparse(call.func).split(".")[-1]
            if name in _INTERNAL:
                continue
            args = list(call.args)
            if name == "HTTPException":
                args = args[1:2] or [k.value for k in call.keywords if k.arg == "detail"]
            if args and (tpl := _template(args[0])) is not None:
                found.setdefault(tpl, f"{path.relative_to(APP.parent)}:{node.lineno}")
    return found


if __name__ == "__main__":
    for msg, where in raised_messages().items():
        print(f"{where}\t{msg}")
