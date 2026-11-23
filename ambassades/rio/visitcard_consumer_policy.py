"""Static v3.8 consumer policy for RIO VisitCard — DRAFT / GO-13 HOLD.

Only the facade may be imported by files named visitcard_consumer_*.py.
Other local dependencies must themselves be consumer modules, checked
recursively. Dynamic/reflection imports and local trust-root construction
are disallowed in these consumer files. This is a narrow source-policy
guard, NOT a Python sandbox or a runtime authorization boundary.
"""
from __future__ import annotations

import ast
from pathlib import Path

FACADE="visitcard_verification_entrypoint"
PREFIX="visitcard_consumer_"
ALLOWED_STDLIB=frozenset({
    "__future__","datetime","sqlite3","typing","dataclasses",
    "enum","collections","collections.abc",
})
FORBIDDEN_FUNCTIONS=frozenset({
    "__import__","eval","exec","compile","getattr","setattr","delattr",
})
FORBIDDEN_ATTRS=frozenset({
    "__dict__","__class__","__globals__","__getattribute__",
    "__subclasses__","__mro__",
})
TRUST_CONSTRUCTORS=frozenset({"VerifiedContext","ProofPackage"})


def audit_consumer_source(root: Path, source: str, name: str) -> tuple[str,...]:
    """Audit a candidate file, allowing only facade/stdlib/consumer edges."""
    issues=[]
    try:
        tree=ast.parse(source,filename=name)
    except (SyntaxError,ValueError) as exc:
        return (f"{name}: invalid Python syntax: {type(exc).__name__}",)

    saw_facade=False
    for node in ast.walk(tree):
        if isinstance(node,ast.Import):
            for alias in node.names:
                target=alias.name
                if target==FACADE:
                    saw_facade=True
                elif target in ALLOWED_STDLIB:
                    pass
                elif target.startswith(PREFIX) and "." not in target:
                    if not (root/(target+".py")).is_file():
                        issues.append(f"{name}: consumer helper not found: {target}")
                else:
                    issues.append(f"{name}: forbidden import: {target}")
        elif isinstance(node,ast.ImportFrom):
            target=node.module
            if node.level or not target:
                issues.append(f"{name}: relative import prohibited")
            elif any(alias.name=="*" for alias in node.names):
                issues.append(f"{name}: wildcard import prohibited")
            elif target==FACADE:
                saw_facade=True
            elif target in ALLOWED_STDLIB:
                pass
            elif target.startswith(PREFIX) and "." not in target:
                if not (root/(target+".py")).is_file():
                    issues.append(f"{name}: consumer helper not found: {target}")
            else:
                issues.append(f"{name}: forbidden import-from: {target}")
        elif isinstance(node,ast.Call):
            call=node.func
            if isinstance(call,ast.Name) and call.id in FORBIDDEN_FUNCTIONS:
                issues.append(f"{name}: dynamic call prohibited: {call.id}")
            elif isinstance(call,ast.Attribute) and call.attr in FORBIDDEN_FUNCTIONS:
                issues.append(f"{name}: dynamic attribute call prohibited: {call.attr}")
            if isinstance(call,ast.Name) and call.id in TRUST_CONSTRUCTORS:
                issues.append(f"{name}: trust/proof constructors belong to upstream provisioner")
            if isinstance(call,ast.Attribute) and call.attr in TRUST_CONSTRUCTORS:
                issues.append(f"{name}: indirect trust/proof constructor prohibited")
        elif isinstance(node,ast.Attribute) and node.attr in FORBIDDEN_ATTRS:
            issues.append(f"{name}: reflection prohibited: {node.attr}")
    # Helper modules must also explicitly import the facade so graph edges
    # cannot silently hide a verifier behind an unrelated local helper.
    if not saw_facade:
        issues.append(f"{name}: full-chain facade import required")
    return tuple(issues)


def audit_consumer_tree(root: Path) -> tuple[str,...]:
    """Scan ALL consumer modules, not just ones imported by the example adapter."""
    root=Path(root)
    paths=sorted(p for p in root.glob(PREFIX+"*.py") if p.name!="visitcard_consumer_policy.py")
    if not paths:
        return ("no consumer modules found",)
    issues=[]
    for path in paths:
        issues.extend(audit_consumer_source(root,path.read_text(encoding="utf-8"),path.name))
    return tuple(issues)


def main() -> int:
    root=Path(__file__).resolve().parent
    violations=audit_consumer_tree(root)
    for issue in violations:
        print("RIO CONSUMER POLICY FAIL:",issue)
    if violations:
        return 1
    print("RIO consumer policy PASS: facade-only, no dynamic import, no local trust provisioning")
    return 0


if __name__=="__main__":
    raise SystemExit(main())
